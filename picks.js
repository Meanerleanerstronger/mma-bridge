// ==============================================
// MMA BRIDGE — FIGHT PICKS
// Supabase table needed (run in SQL editor):
//
// CREATE TABLE IF NOT EXISTS public.picks (
//   id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
//   event_id   text NOT NULL,
//   event_name text,
//   fight_key  text NOT NULL,
//   fighter_a  text NOT NULL,
//   fighter_b  text NOT NULL,
//   pick       text NOT NULL,
//   method     text,
//   created_at timestamptz DEFAULT now(),
//   UNIQUE(user_id, event_id, fight_key)
// );
// ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "picks_select" ON public.picks FOR SELECT USING (true);
// CREATE POLICY "picks_insert" ON public.picks FOR INSERT WITH CHECK (auth.uid() = user_id);
// CREATE POLICY "picks_update" ON public.picks FOR UPDATE USING (auth.uid() = user_id);
// CREATE POLICY "picks_delete" ON public.picks FOR DELETE USING (auth.uid() = user_id);
// ==============================================

(async function () {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function getParam(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function slugify(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

  // Parse "KO/TKO R2" → { base:"KO/TKO", round:"2" }
  function parseMethod(m) {
    if (!m) return { base: '', round: '' };
    const match = m.match(/^(.+?)\s*R(\d+)$/);
    if (match) return { base: match[1].trim(), round: match[2] };
    return { base: m.trim(), round: '' };
  }
  function combineMethod(base, round) {
    if (!base) return null;
    if (round && (base === 'KO/TKO' || base === 'SUB')) return `${base} R${round}`;
    return base;
  }

  const root    = document.getElementById('pkRoot');
  const toast   = document.getElementById('pkToast');
  const sb      = window._sb;
  const eventId = getParam('id');

  // ── Wait for auth ─────────────────────────────
  function waitForAuth(ms = 4000) {
    return new Promise(res => {
      const t0 = Date.now();
      const tick = () => {
        const u = window.MMABridgeAuth?.getUser?.();
        if (u || Date.now() - t0 > ms) res(u || null);
        else setTimeout(tick, 80);
      };
      tick();
    });
  }

  // ── Silhouette SVG ────────────────────────────
  const SILHOUETTE = `
    <svg class="pk-silhouette" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="30" r="20" fill="rgba(255,255,255,0.07)"/>
      <path d="M4 105 C4 72 20 62 40 62 C60 62 76 72 76 105Z" fill="rgba(255,255,255,0.07)"/>
    </svg>`;

  // ── Show toast ────────────────────────────────
  let toastTimer;
  function showToast(msg, type = 'ok') {
    toast.textContent = msg;
    toast.className = `pk-toast pk-toast-${type}`;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2400);
  }

  // ── Load event ────────────────────────────────
  if (!eventId) { root.innerHTML = `<div class="pk-error">No event specified.</div>`; return; }

  root.innerHTML = `<div class="pk-loading"><div class="pk-spinner"></div>Loading card…</div>`;

  const [eventsData, fightersData, user] = await Promise.all([
    fetch('./events.json').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json').then(r => r.ok ? r.json() : []).catch(() => []),
    waitForAuth(),
  ]);

  // Build fighter lookup: slugified name → { img, record }
  const fighterDB = {};
  (Array.isArray(fightersData) ? fightersData : []).forEach(f => {
    if (f.id) fighterDB[f.id] = f;
    if (f.name) fighterDB[slugify(f.name)] = f;
  });

  function lookupFighter(name) {
    return fighterDB[slugify(name)] || fighterDB[name?.toLowerCase()] || null;
  }

  function fighterImg(evImg, name) {
    if (evImg) return evImg;
    const fd = lookupFighter(name);
    return fd?.img || '';
  }

  function fighterRecord(name) {
    const fd = lookupFighter(name);
    if (!fd?.record) return '';
    const { wins = 0, losses = 0, draws = 0 } = fd.record;
    return `${wins}-${losses}${draws ? `-${draws}` : ''}`;
  }

  // Parse max rounds from "5 Rds" / "3 Rds"
  function maxRounds(roundsStr) {
    const m = String(roundsStr || '').match(/(\d+)/);
    return m ? parseInt(m[1]) : 3;
  }

  const event = eventsData.find(e => e.id === eventId || slugify(e.name || '') === eventId);
  if (!event) { root.innerHTML = `<div class="pk-error">Event not found.</div>`; return; }

  const isCompleted = event.status === 'completed';
  const myId = user?.id || null;

  // ── Load user's existing picks ────────────────
  let myPicks = {}; // fight_key → { pick, method (combined), base, round }
  if (myId && sb) {
    try {
      const { data } = await sb.from('picks')
        .select('fight_key, pick, method')
        .eq('user_id', myId)
        .eq('event_id', eventId);
      (data || []).forEach(p => {
        const { base, round } = parseMethod(p.method);
        myPicks[p.fight_key] = { pick: p.pick, method: p.method, base, round };
      });
    } catch {}
  }

  // ── Save a single pick ────────────────────────
  async function savePick(fightKey, fighterA, fighterB, pick, methodBase, round) {
    if (!myId || !sb) return;
    const combined = combineMethod(methodBase, round);
    try {
      await sb.from('picks').upsert({
        user_id: myId, event_id: eventId,
        event_name: event.name || '', fight_key: fightKey,
        fighter_a: fighterA, fighter_b: fighterB,
        pick, method: combined || null,
      }, { onConflict: 'user_id,event_id,fight_key' });
      myPicks[fightKey] = { pick, method: combined, base: methodBase || '', round: round || '' };
      updateSaveBar();
      showToast('Pick saved ✓');
    } catch { showToast('Could not save pick', 'err'); }
  }

  // ── Update save bar ───────────────────────────
  function updateSaveBar() {
    const totalFights = (event.mainCard||[]).length + (event.prelims||[]).length + (event.earlyPrelims||[]).length;
    const pickedCount = Object.keys(myPicks).length;
    const bar = document.getElementById('pkSaveBar');
    if (!bar) return;
    const info = bar.querySelector('.pk-save-info');
    const btn  = bar.querySelector('.pk-save-btn');
    const pBar = root.querySelector('.pk-progress-bar');
    const pLbl = root.querySelector('.pk-progress-label');
    if (info) info.innerHTML = `<strong>${pickedCount}</strong> of <strong>${totalFights}</strong> fights picked`;
    if (pBar) pBar.style.width = `${totalFights ? Math.round((pickedCount/totalFights)*100) : 0}%`;
    if (pLbl) pLbl.textContent = `${pickedCount} of ${totalFights} fights picked`;
    if (btn && pickedCount > 0) {
      btn.classList.add('saved');
      btn.textContent = `✓ ${pickedCount} Picks Saved`;
    } else if (btn) {
      btn.classList.remove('saved');
      btn.textContent = 'Save Picks';
    }
  }

  // ── Compute score if completed ────────────────
  function computeScore() {
    const all = [
      ...(event.mainCard || []),
      ...(event.prelims || []),
      ...(event.earlyPrelims || []),
    ];
    let correct = 0, total = 0;
    all.forEach((f, i) => {
      const section = i < (event.mainCard||[]).length ? 'main'
        : i < (event.mainCard||[]).length + (event.prelims||[]).length ? 'prelims'
        : 'early';
      const idx = section === 'main' ? i
        : section === 'prelims' ? i - (event.mainCard||[]).length
        : i - (event.mainCard||[]).length - (event.prelims||[]).length;
      const key = `${section}-${idx}`;
      const p = myPicks[key];
      if (!p || !f.winner) return;
      total++;
      if (p.pick.toLowerCase() === f.winner.toLowerCase()) correct++;
    });
    return { correct, total };
  }

  // ── Fighter photo — 3-level fallback chain ────
  function fighterPhoto(evImg, name, side) {
    const fd = lookupFighter(name);
    const primary  = evImg || fd?.img || '';
    const fallback = evImg && fd?.img ? fd.img : '';
    if (!primary) return `<div class="pk-sil-wrap">${SILHOUETTE}</div>`;
    return `<img class="pk-fighter-img pk-fighter-img-${side}"
      src="${esc(primary)}" alt="${esc(name)}" loading="lazy"
      ${fallback ? `data-fallback="${esc(fallback)}"` : ''}
      onerror="var fb=this.dataset.fallback;if(fb){this.removeAttribute('data-fallback');this.src=fb}else{this.style.display='none';this.nextElementSibling.style.display='flex'}">
      <div class="pk-sil-wrap" style="display:none">${SILHOUETTE}</div>`;
  }

  // ── Build one fight card ──────────────────────
  function buildFight(f, sectionKey, idx, isMain) {
    const key    = `${sectionKey}-${idx}`;
    const saved  = myPicks[key] || {};
    const pickedA = saved.pick === f.a;
    const pickedB = saved.pick === f.b;
    const savedBase  = saved.base  || '';
    const savedRound = saved.round || '';
    const rounds = maxRounds(f.rounds);

    // Completed: show result
    const winner = f.winner || null;
    const resultA = isCompleted && winner ? (winner === f.a ? 'win' : 'loss') : '';
    const resultB = isCompleted && winner ? (winner === f.b ? 'win' : 'loss') : '';
    const correctA = isCompleted && pickedA && resultA === 'win';
    const correctB = isCompleted && pickedB && resultB === 'win';
    const wrongA   = isCompleted && pickedA && resultA === 'loss';
    const wrongB   = isCompleted && pickedB && resultB === 'loss';

    const methodBtns = [
      { id: 'KO/TKO', cls: 'ko', label: 'KO / TKO' },
      { id: 'SUB',    cls: 'sub', label: 'Submission' },
      { id: 'DEC',    cls: 'dec', label: 'Decision' },
    ].map(m => `
      <button class="pk-method-btn ${m.cls}${savedBase === m.id ? ` active ${m.cls}` : ''}"
        data-method="${esc(m.id)}" data-key="${esc(key)}">${esc(m.label)}</button>
    `).join('');

    const needsRound = (savedBase === 'KO/TKO' || savedBase === 'SUB');
    const roundCls   = savedBase === 'KO/TKO' ? 'ko' : 'sub';
    const roundBtns  = Array.from({length: rounds}, (_,i) => i+1).map(r => `
      <button class="pk-round-btn${savedRound === String(r) ? ` active ${roundCls}` : ''}"
        data-round="${r}" data-key="${esc(key)}"
        data-method-cls="${roundCls}">R${r}</button>
    `).join('');

    const titleBadge = f.titleFight
      ? `<div class="pk-title-badge">🏆 Title Fight</div>` : '';
    const rankedBadge = f.ranked && !f.titleFight
      ? `<div class="pk-ranked-badge">⭐ Ranked</div>` : '';

    const resultBadge = isCompleted && winner
      ? `<div class="pk-result-label">${esc(winner)} by ${esc(f.method || '—')}</div>` : '';

    return `
      <div class="pk-fight${isMain ? ' pk-fight-main' : ''}" data-key="${esc(key)}">
        ${titleBadge}${rankedBadge}

        <div class="pk-fight-inner">
          <!-- FIGHTER A -->
          <div class="pk-side pk-side-a${pickedA ? ' selected' : ''}${resultA ? ` result-${resultA}` : ''}${correctA ? ' correct' : ''}${wrongA ? ' wrong' : ''}"
               data-key="${esc(key)}" data-pick="${esc(f.a)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="pk-fighter-photo">
              ${fighterPhoto(f.imgA || '', f.a, 'a')}
            </div>
            <div class="pk-fighter-name pk-fighter-name-a">${esc(f.a)}</div>
            ${fighterRecord(f.a) ? `<div class="pk-record">${esc(fighterRecord(f.a))}</div>` : ''}
            ${pickedA ? `<div class="pk-pick-label">Your pick</div>` : ''}
            ${correctA ? `<div class="pk-pick-result correct">✓ Correct</div>` : ''}
            ${wrongA   ? `<div class="pk-pick-result wrong">✗ Wrong</div>` : ''}
          </div>

          <!-- CENTER INFO -->
          <div class="pk-center">
            <div class="pk-vs">VS</div>
            <div class="pk-weight">${esc(f.weight || '')}</div>
            <div class="pk-rounds">${esc(f.rounds || '')}</div>
            ${resultBadge}
            ${!isCompleted ? `
              <div class="pk-methods">
                <div class="pk-method-row">${methodBtns}</div>
                <div class="pk-round-row" id="pkRounds-${esc(key)}" style="${needsRound ? '' : 'display:none'}">
                  <span class="pk-round-label">Rd</span>
                  ${roundBtns}
                </div>
              </div>` : ''}
          </div>

          <!-- FIGHTER B -->
          <div class="pk-side pk-side-b${pickedB ? ' selected' : ''}${resultB ? ` result-${resultB}` : ''}${correctB ? ' correct' : ''}${wrongB ? ' wrong' : ''}"
               data-key="${esc(key)}" data-pick="${esc(f.b)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="pk-fighter-photo">
              ${fighterPhoto(f.imgB || '', f.b, 'b')}
            </div>
            <div class="pk-fighter-name pk-fighter-name-b">${esc(f.b)}</div>
            ${fighterRecord(f.b) ? `<div class="pk-record">${esc(fighterRecord(f.b))}</div>` : ''}
            ${pickedB ? `<div class="pk-pick-label">Your pick</div>` : ''}
            ${correctB ? `<div class="pk-pick-result correct">✓ Correct</div>` : ''}
            ${wrongB   ? `<div class="pk-pick-result wrong">✗ Wrong</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  // ── Build section ──────────────────────────────
  function buildSection(title, fights, sectionKey, isMainCard) {
    if (!fights || !fights.length) return '';
    const cards = fights.map((f, i) => buildFight(f, sectionKey, i, isMainCard && i === 0)).join('');
    return `
      <div class="pk-section">
        <div class="pk-section-label">${esc(title)}</div>
        ${cards}
      </div>`;
  }

  // ── Score badge ───────────────────────────────
  function scoreBadge() {
    if (!isCompleted) return '';
    const { correct, total } = computeScore();
    if (total === 0) return '';
    const pct = Math.round((correct / total) * 100);
    const cls = pct >= 70 ? 'great' : pct >= 50 ? 'ok' : 'poor';
    return `<div class="pk-score pk-score-${cls}">${correct}/${total} correct <span>${pct}%</span></div>`;
  }

  // ── Render page ───────────────────────────────
  function render() {
    const mainSection    = buildSection('Main Card',     event.mainCard,     'main',   true);
    const prelimSection  = buildSection('Prelims',       event.prelims,      'prelims',false);
    const earlySection   = buildSection('Early Prelims', event.earlyPrelims, 'early',  false);

    const pickedCount = Object.keys(myPicks).length;
    const totalFights = (event.mainCard||[]).length + (event.prelims||[]).length + (event.earlyPrelims||[]).length;

    root.innerHTML = `
      <div class="pk-header">
        <a href="events.html?id=${encodeURIComponent(eventId)}" class="pk-back">
          <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><polyline points="7,1 2,7 7,13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back to Event
        </a>
        <div class="pk-header-info">
          <div class="pk-event-type">${esc(event.type || 'UFC')}</div>
          <h1 class="pk-event-name">${esc(event.name || '')}</h1>
          <div class="pk-event-meta">
            ${event.date ? `<span>${esc(event.date)}</span>` : ''}
            ${event.location ? `<span class="pk-meta-dot">·</span><span>${esc(event.location)}</span>` : ''}
          </div>
        </div>
        <div class="pk-header-right">
          ${scoreBadge()}
          ${!isCompleted && myId ? `
            <div class="pk-progress-wrap">
              <div class="pk-progress-bar" style="width:${totalFights ? Math.round((pickedCount/totalFights)*100) : 0}%"></div>
            </div>
            <div class="pk-progress-label">${pickedCount} of ${totalFights} fights picked</div>
          ` : ''}
        </div>
      </div>

      ${!myId ? `
        <div class="pk-signin-banner">
          <span>Sign in to save your picks and track your record</span>
          <a href="auth.html" class="pk-signin-link">Sign In</a>
        </div>` : ''}

      ${isCompleted ? `<div class="pk-completed-banner">This event has completed — showing your pick results</div>` : ''}

      <div class="pk-body">
        ${mainSection}${prelimSection}${earlySection}
      </div>`;

    // Sticky save bar (only for upcoming + logged-in users)
    if (!isCompleted && myId) {
      const saveBar = document.createElement('div');
      saveBar.id = 'pkSaveBar';
      saveBar.className = 'pk-save-bar';
      const isSaved = pickedCount > 0;
      saveBar.innerHTML = `
        <div class="pk-save-info"><strong>${pickedCount}</strong> of <strong>${totalFights}</strong> fights picked</div>
        <button class="pk-save-btn${isSaved ? ' saved' : ''}" id="pkSaveBtn">
          ${isSaved ? `✓ ${pickedCount} Picks Saved` : 'Save Picks'}
        </button>`;
      document.body.appendChild(saveBar);

      document.getElementById('pkSaveBtn').addEventListener('click', () => {
        showToast('All picks saved ✓');
        setTimeout(() => { window.location.href = `events.html?id=${encodeURIComponent(eventId)}`; }, 800);
      });
    }

    bindInteractions();
  }

  // ── Bind click interactions ───────────────────
  function bindInteractions() {
    if (isCompleted) return;

    // Fighter side clicks
    root.querySelectorAll('.pk-side').forEach(side => {
      const activate = async () => {
        const key   = side.dataset.key;
        const pick  = side.dataset.pick;
        const fa    = side.dataset.fa;
        const fb    = side.dataset.fb;
        const fight = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;

        const wasSelected = side.classList.contains('selected');

        fight.querySelectorAll('.pk-side').forEach(s => {
          s.classList.remove('selected');
          s.querySelector('.pk-pick-label')?.remove();
        });

        if (!wasSelected) {
          side.classList.add('selected');
          const lbl = document.createElement('div');
          lbl.className = 'pk-pick-label';
          lbl.textContent = 'Your pick';
          side.appendChild(lbl);

          if (!myId) { showToast('Sign in to save picks', 'err'); return; }

          const saved = myPicks[key] || {};
          await savePick(key, fa, fb, pick, saved.base || null, saved.round || null);
        } else {
          if (myId && sb) {
            try {
              await sb.from('picks').delete()
                .eq('user_id', myId).eq('event_id', eventId).eq('fight_key', key);
              delete myPicks[key];
              updateSaveBar();
            } catch {}
          }
        }
      };

      side.addEventListener('click', activate);
      side.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });

    // Method buttons
    root.querySelectorAll('.pk-method-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key    = btn.dataset.key;
        const method = btn.dataset.method;
        const fight  = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;

        const saved = myPicks[key];
        if (!saved) { showToast('Pick a fighter first', 'err'); return; }

        const alreadyActive = btn.classList.contains('active');

        // Clear all method btns
        fight.querySelectorAll('.pk-method-btn').forEach(b => {
          b.classList.remove('active', 'ko', 'sub', 'dec');
        });

        const roundRow = document.getElementById(`pkRounds-${key}`);
        const newBase = alreadyActive ? '' : method;
        const newRound = alreadyActive ? '' : (saved.round || '');
        const methodCls = method === 'KO/TKO' ? 'ko' : method === 'SUB' ? 'sub' : 'dec';

        if (!alreadyActive) {
          btn.classList.add('active', methodCls);
        }

        // Show/hide round row
        if (roundRow) {
          const showRound = !alreadyActive && (method === 'KO/TKO' || method === 'SUB');
          roundRow.style.display = showRound ? '' : 'none';
          // Update round button classes
          if (showRound) {
            fight.querySelectorAll('.pk-round-btn').forEach(rb => {
              rb.classList.remove('active', 'ko', 'sub');
              if (rb.dataset.round === saved.round) rb.classList.add('active', methodCls);
              rb.dataset.methodCls = methodCls;
            });
          } else {
            fight.querySelectorAll('.pk-round-btn').forEach(rb => rb.classList.remove('active','ko','sub'));
          }
        }

        const fa = fight.querySelector('.pk-side-a')?.dataset?.fa || '';
        const fb = fight.querySelector('.pk-side-a')?.dataset?.fb || '';
        await savePick(key, fa, fb, saved.pick, newBase || null, showRound ? newRound : null);
      });
    });

    // Round buttons
    root.querySelectorAll('.pk-round-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key   = btn.dataset.key;
        const round = btn.dataset.round;
        const fight = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;

        const saved = myPicks[key];
        if (!saved || !saved.base) { showToast('Pick a method first', 'err'); return; }

        const alreadyActive = btn.classList.contains('active');
        const methodCls = saved.base === 'KO/TKO' ? 'ko' : 'sub';

        fight.querySelectorAll('.pk-round-btn').forEach(rb => rb.classList.remove('active','ko','sub'));

        const newRound = alreadyActive ? '' : round;
        if (!alreadyActive) btn.classList.add('active', methodCls);

        const fa = fight.querySelector('.pk-side-a')?.dataset?.fa || '';
        const fb = fight.querySelector('.pk-side-a')?.dataset?.fb || '';
        await savePick(key, fa, fb, saved.pick, saved.base, newRound || null);
      });
    });
  }

  render();

})();
