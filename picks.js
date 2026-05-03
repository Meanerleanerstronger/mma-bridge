// ==============================================
// MMA BRIDGE — FIGHT PICKS (manual save + hype + FOTN)
// ==============================================
(async function () {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function getParam(k) { return new URLSearchParams(location.search).get(k) || ''; }
  function slugify(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

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

  function apiBase() {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? 'http://localhost:5001/api' : 'https://mmabridge-backend.onrender.com/api';
  }

  async function getAuthUser() {
    if (!sb) return null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      return session?.user || null;
    } catch { return null; }
  }

  const SILHOUETTE = `
    <svg class="pk-silhouette" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="30" r="20" fill="rgba(255,255,255,0.07)"/>
      <path d="M4 105 C4 72 20 62 40 62 C60 62 76 72 76 105Z" fill="rgba(255,255,255,0.07)"/>
    </svg>`;

  let toastTimer;
  function showToast(msg, type = 'ok') {
    toast.textContent = msg;
    toast.className = `pk-toast pk-toast-${type}`;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
  }

  if (!eventId) { root.innerHTML = `<div class="pk-error">No event specified.</div>`; return; }
  root.innerHTML = `<div class="pk-loading"><div class="pk-spinner"></div>Loading card…</div>`;

  const [eventsData, fightersData, user] = await Promise.all([
    fetch('./events.json').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json').then(r => r.ok ? r.json() : []).catch(() => []),
    getAuthUser(),
  ]);

  const fighterDB = {};
  (Array.isArray(fightersData) ? fightersData : []).forEach(f => {
    if (f.id) fighterDB[f.id] = f;
    if (f.name) fighterDB[slugify(f.name)] = f;
  });
  function lookupFighter(name) {
    return fighterDB[slugify(name)] || fighterDB[name?.toLowerCase()] || null;
  }
  function fighterRecord(name) {
    const fd = lookupFighter(name);
    if (!fd?.record) return '';
    const { wins = 0, losses = 0, draws = 0 } = fd.record;
    return `${wins}-${losses}${draws ? `-${draws}` : ''}`;
  }
  function maxRounds(roundsStr) {
    const m = String(roundsStr || '').match(/(\d+)/);
    return m ? parseInt(m[1]) : 3;
  }

  const event = eventsData.find(e => e.id === eventId || slugify(e.name || '') === eventId);
  if (!event) { root.innerHTML = `<div class="pk-error">Event not found.</div>`; return; }

  const isCompleted = event.status === 'completed';
  let myId = user?.id || null;

  // ── State ─────────────────────────────────────
  let myPicks    = {};   // confirmed DB state
  let localPicks = {};   // pending local state (includes 'fotn' key)
  let hypeAvg    = 0;
  let hypeCount  = 0;
  let localHype  = 0;   // user's hype rating (0 = not rated)

  // ── Load picks from DB ────────────────────────
  async function loadPicks() {
    if (!myId || !sb) return;
    try {
      const { data, error } = await sb.from('picks')
        .select('fight_key, pick, method')
        .eq('user_id', myId)
        .eq('event_id', eventId);
      if (error) throw error;
      myPicks = {};
      (data || []).forEach(p => {
        const { base, round } = parseMethod(p.method);
        myPicks[p.fight_key] = { pick: p.pick, method: p.method, base, round };
      });
    } catch (e) { console.error('loadPicks:', e); }
    localPicks = {};
    Object.entries(myPicks).forEach(([k, v]) => {
      localPicks[k] = { pick: v.pick, base: v.base || '', round: v.round || '' };
    });
  }

  await loadPicks();

  // ── Load community hype avg from backend ──────
  async function loadEventExtras() {
    try {
      const res = await fetch(`${apiBase()}/ratings/${encodeURIComponent(eventId)}`);
      if (res.ok) {
        const d = await res.json();
        hypeAvg   = parseFloat(d.avg_hype || 0);
        hypeCount = parseInt(d.total_ratings || 0);
      }
    } catch {}
  }

  // ── Save hype rating (instant) ────────────────
  async function saveHype(val) {
    localHype = val;
    updateHypeWidget();
    try {
      await fetch(`${apiBase()}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, event_name: event.name || '', hype_rating: val, fotn_prediction: null }),
      });
      await loadEventExtras();
      updateHypeWidget();
    } catch {}
  }

  // ── Community picks ───────────────────────────
  let communityPicks = {}; // { 'main-0': { 'Fighter A': 5, 'Fighter B': 3 } }

  async function loadCommunityPicks() {
    if (!sb) return;
    try {
      const { data } = await sb.from('picks')
        .select('fight_key, pick')
        .eq('event_id', eventId)
        .neq('fight_key', 'fotn');
      communityPicks = {};
      (data || []).forEach(p => {
        if (!communityPicks[p.fight_key]) communityPicks[p.fight_key] = {};
        communityPicks[p.fight_key][p.pick] = (communityPicks[p.fight_key][p.pick] || 0) + 1;
      });
    } catch {}
  }

  // ── Next upcoming event ────────────────────────
  let nextEventData = null;

  async function prefetchNextEvent() {
    if (!isCompleted) return;
    try {
      const all  = await fetch('./events.json').then(r => r.json());
      const today = new Date().toISOString().slice(0, 10);
      nextEventData = all.find(e => e.status === 'upcoming' && (e.isoDate || '') > today) || null;
    } catch {}
  }

  // ── Challenge ──────────────────────────────────
  let challenge    = null;
  let oppPicks     = {};
  let oppName      = '';
  let oppPickCount = 0;

  async function loadChallenge() {
    if (!myId || !sb) return;
    try {
      const { data } = await sb.from('challenges')
        .select('id, challenger_id, opponent_id, status')
        .eq('event_id', eventId)
        .or(`challenger_id.eq.${myId},opponent_id.eq.${myId}`)
        .in('status', ['pending', 'active'])
        .limit(1);
      if (!data?.length) return;
      challenge = data[0];
      const oppId = challenge.challenger_id === myId ? challenge.opponent_id : challenge.challenger_id;
      const { data: prof } = await sb.from('profiles').select('display_name').eq('id', oppId).single();
      oppName = prof?.display_name || 'Opponent';
      const { data: oppData } = await sb.from('picks').select('fight_key, pick, method').eq('user_id', oppId).eq('event_id', eventId);
      oppPicks = {};
      (oppData || []).forEach(p => { oppPicks[p.fight_key] = { pick: p.pick }; });
      oppPickCount = Object.keys(oppPicks).length;
      if (challenge.opponent_id === myId && challenge.status === 'pending') {
        await sb.from('challenges').update({ status: 'active' }).eq('id', challenge.id);
      }
    } catch {}
  }

  await Promise.all([loadChallenge(), loadEventExtras(), loadCommunityPicks(), prefetchNextEvent()]);

  // ── Get fight data from key ───────────────────
  function getFightData(key) {
    if (key === 'fotn') return null;
    const dash = key.lastIndexOf('-');
    const section = key.slice(0, dash);
    const idx = parseInt(key.slice(dash + 1));
    const arr = section === 'main' ? (event.mainCard || [])
      : section === 'prelims' ? (event.prelims || [])
      : (event.earlyPrelims || []);
    return arr[idx] || null;
  }

  // Count real picks (exclude fotn key)
  function pickCount() { return Object.keys(localPicks).filter(k => k !== 'fotn').length; }
  function savedPickCount() { return Object.keys(myPicks).filter(k => k !== 'fotn').length; }

  // ── Unsaved changes? ──────────────────────────
  function hasUnsavedChanges() {
    const lKeys = Object.keys(localPicks);
    const mKeys = Object.keys(myPicks);
    if (lKeys.length !== mKeys.length) return true;
    for (const k of lKeys) {
      const l = localPicks[k], m = myPicks[k];
      if (!m || l.pick !== m.pick || (l.base||'') !== (m.base||'') || (l.round||'') !== (m.round||'')) return true;
    }
    return false;
  }

  // ── Bulk save all picks to DB ─────────────────
  async function saveAllPicks() {
    if (!myId || !sb) { showToast('Sign in to save picks', 'err'); return; }
    const btn = document.getElementById('pkSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const toDelete = Object.keys(myPicks).filter(k => !localPicks[k]);
      if (toDelete.length > 0) {
        await sb.from('picks').delete()
          .eq('user_id', myId).eq('event_id', eventId)
          .in('fight_key', toDelete);
      }
      const toSave = Object.entries(localPicks).map(([fightKey, p]) => {
        const fd = getFightData(fightKey);
        return {
          user_id: myId, event_id: eventId,
          event_name: event.name || '',
          fight_key: fightKey,
          fighter_a: fd?.a || fightKey,
          fighter_b: fd?.b || fightKey,
          pick: p.pick,
          method: combineMethod(p.base, p.round) || null,
        };
      });
      if (toSave.length > 0) {
        const { error } = await sb.from('picks').upsert(toSave, { onConflict: 'user_id,event_id,fight_key' });
        if (error) throw error;
      }
      myPicks = {};
      Object.entries(localPicks).forEach(([k, v]) => {
        myPicks[k] = { pick: v.pick, base: v.base, round: v.round, method: combineMethod(v.base, v.round) };
      });
      const n = pickCount();
      showToast(`${n} pick${n !== 1 ? 's' : ''} saved ✓`);
      updateSaveBar();
      updateFotnSection();
    } catch (e) {
      console.error('saveAllPicks:', e);
      showToast('Could not save — check connection', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Save bar ──────────────────────────────────
  function updateSaveBar() {
    const total = (event.mainCard||[]).length + (event.prelims||[]).length + (event.earlyPrelims||[]).length;
    const picked = pickCount();
    const bar = document.getElementById('pkSaveBar');
    if (!bar) return;
    const info = bar.querySelector('.pk-save-info');
    const btn  = bar.querySelector('.pk-save-btn');
    const pBar = root.querySelector('.pk-progress-bar');
    const pLbl = root.querySelector('.pk-progress-label');
    if (info) info.innerHTML = `<strong>${picked}</strong> of <strong>${total}</strong> fights picked`;
    if (pBar) pBar.style.width = `${total ? Math.round((picked/total)*100) : 0}%`;
    if (pLbl) pLbl.textContent = `${picked} of ${total} fights picked`;
    if (btn) {
      const dirty = hasUnsavedChanges();
      if (dirty && picked > 0) {
        btn.classList.remove('saved'); btn.classList.add('dirty');
        btn.textContent = `Save ${picked} Pick${picked !== 1 ? 's' : ''}`;
      } else if (!dirty && picked > 0) {
        btn.classList.add('saved'); btn.classList.remove('dirty');
        btn.textContent = `✓ ${picked} Picks Saved`;
      } else {
        btn.classList.remove('saved', 'dirty');
        btn.textContent = 'Save Picks';
      }
      btn.disabled = false;
    }
  }

  // ── Update hype widget ────────────────────────
  function updateHypeWidget() {
    const widget = document.getElementById('pkHypeWidget');
    if (!widget) return;
    widget.querySelectorAll('.pk-hype-num-btn').forEach(b => {
      const v = +b.dataset.val;
      b.classList.toggle('active', v === localHype);
      b.classList.toggle('lit', v < localHype);
      b.classList.remove(v === localHype ? 'lit' : '');
    });
    const avgEl = widget.querySelector('.pk-hype-avg');
    if (avgEl) {
      if (hypeCount > 0) {
        avgEl.textContent = `${hypeAvg.toFixed(1)} avg · ${hypeCount} rating${hypeCount !== 1 ? 's' : ''}`;
      } else {
        avgEl.textContent = 'Be the first to rate';
      }
    }
  }

  // ── Update FOTN section ───────────────────────
  function updateFotnSection() {
    const section = document.getElementById('pkFotnSection');
    if (!section) return;
    const savedFotn = myPicks['fotn']?.pick || null;
    const localFotn = localPicks['fotn']?.pick || null;
    section.querySelectorAll('.pk-fotn-fight').forEach(el => {
      const name = el.dataset.fight;
      const isSelected = name === localFotn;
      const isSaved = name === savedFotn;
      el.classList.toggle('selected', isSelected);
      el.classList.toggle('saved', isSaved && isSelected);
    });
    const lbl = section.querySelector('.pk-fotn-selected-lbl');
    if (lbl) {
      if (localFotn) {
        const isSaved = localFotn === savedFotn;
        lbl.innerHTML = `FOTN: <strong>${esc(localFotn)}</strong>${isSaved ? ' <span class="pk-fotn-saved-tick">saved</span>' : ' <span class="pk-fotn-unsaved-dot">unsaved</span>'}`;
        lbl.style.display = '';
      } else {
        lbl.style.display = 'none';
      }
    }
  }

  // ── Score if completed ────────────────────────
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

  // ── Fighter photo ─────────────────────────────
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
    const saved  = localPicks[key] || {};
    const opp    = oppPicks[key] || {};
    const oppPickedA = challenge && opp.pick === f.a;
    const oppPickedB = challenge && opp.pick === f.b;
    const pickedA = saved.pick === f.a;
    const pickedB = saved.pick === f.b;
    const isSavedA = myPicks[key]?.pick === f.a;
    const isSavedB = myPicks[key]?.pick === f.b;
    const savedBase  = saved.base  || '';
    const savedRound = saved.round || '';
    const rounds = maxRounds(f.rounds);

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
        data-round="${r}" data-key="${esc(key)}" data-method-cls="${roundCls}">R${r}</button>
    `).join('');

    const titleBadge  = f.titleFight ? `<div class="pk-title-badge">Title Fight</div>` : '';
    const rankedBadge = f.ranked && !f.titleFight ? `<div class="pk-ranked-badge">Ranked</div>` : '';

    const methodBannerA = isCompleted && winner === f.a && f.method
      ? `<div class="pk-method-banner">${esc(f.method)}</div>` : '';
    const methodBannerB = isCompleted && winner === f.b && f.method
      ? `<div class="pk-method-banner">${esc(f.method)}</div>` : '';

    // Community pick % — shown on completed, or upcoming only after user picked this fight
    const comm = communityPicks[key] || {};
    const commTotal = Object.values(comm).reduce((s, v) => s + v, 0);
    const showComm = commTotal > 0 && (isCompleted || pickedA || pickedB);
    const commPctA = showComm ? Math.round(((comm[f.a] || 0) / commTotal) * 100) : null;
    const commPctB = showComm ? Math.round(((comm[f.b] || 0) / commTotal) * 100) : null;

    const pickLabelA = pickedA
      ? `<div class="pk-pick-label${isSavedA ? '' : ' pk-pick-unsaved'}">Your pick${isSavedA ? ' ✓' : ' •'}</div>` : '';
    const pickLabelB = pickedB
      ? `<div class="pk-pick-label${isSavedB ? '' : ' pk-pick-unsaved'}">Your pick${isSavedB ? ' ✓' : ' •'}</div>` : '';

    return `
      <div class="pk-fight${isMain ? ' pk-fight-main' : ''}" data-key="${esc(key)}">
        ${titleBadge}${rankedBadge}
        ${(f.weight || f.rounds) ? `
        <div class="pk-fight-meta">
          ${f.weight ? `<span>${esc(f.weight)}</span>` : ''}
          ${f.weight && f.rounds ? `<span class="pk-fight-meta-dot">·</span>` : ''}
          ${f.rounds ? `<span>${esc(f.rounds)}</span>` : ''}
        </div>` : ''}
        <div class="pk-fight-fighters">
          <div class="pk-side pk-side-a${pickedA ? ' selected' : ''}${resultA ? ` result-${resultA}` : ''}${correctA ? ' correct' : ''}${wrongA ? ' wrong' : ''}"
               data-key="${esc(key)}" data-pick="${esc(f.a)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="pk-fighter-photo">
              ${methodBannerA}
              ${fighterPhoto(f.imgA || '', f.a, 'a')}
            </div>
            <div class="pk-fighter-name pk-fighter-name-a${resultA === 'win' ? ' pk-winner-name' : ''}">${esc(f.a)}</div>
            ${fighterRecord(f.a) ? `<div class="pk-record">${esc(fighterRecord(f.a))}</div>` : ''}
            ${pickLabelA}
            ${oppPickedA ? `<div class="pk-opp-label">${esc(oppName)}</div>` : ''}
            ${correctA ? `<div class="pk-pick-result correct">Correct</div>` : ''}
            ${wrongA   ? `<div class="pk-pick-result wrong">Wrong</div>` : ''}
          </div>
          <div class="pk-fight-vs">
            <div class="pk-vs">VS</div>
          </div>
          <div class="pk-side pk-side-b${pickedB ? ' selected' : ''}${resultB ? ` result-${resultB}` : ''}${correctB ? ' correct' : ''}${wrongB ? ' wrong' : ''}"
               data-key="${esc(key)}" data-pick="${esc(f.b)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="pk-fighter-photo">
              ${methodBannerB}
              ${fighterPhoto(f.imgB || '', f.b, 'b')}
            </div>
            <div class="pk-fighter-name pk-fighter-name-b${resultB === 'win' ? ' pk-winner-name' : ''}">${esc(f.b)}</div>
            ${fighterRecord(f.b) ? `<div class="pk-record">${esc(fighterRecord(f.b))}</div>` : ''}
            ${pickLabelB}
            ${oppPickedB ? `<div class="pk-opp-label">${esc(oppName)}</div>` : ''}
            ${correctB ? `<div class="pk-pick-result correct">Correct</div>` : ''}
            ${wrongB   ? `<div class="pk-pick-result wrong">Wrong</div>` : ''}
          </div>
        </div>
        ${showComm ? `
        <div class="pk-comm-row">
          <span class="pk-comm-pct pk-comm-pct-a">${commPctA}%</span>
          <div class="pk-comm-bar"><div class="pk-comm-bar-fill" style="width:${commPctA}%"></div></div>
          <span class="pk-comm-pct pk-comm-pct-b">${commPctB}%</span>
        </div>` : ''}
        ${!isCompleted ? `
        <div class="pk-methods-section">
          <div class="pk-method-label">Pick Method</div>
          <div class="pk-method-row">${methodBtns}</div>
          <div class="pk-round-row" id="pkRounds-${esc(key)}" style="${needsRound ? '' : 'display:none'}">
            <span class="pk-round-label">Round</span>
            ${roundBtns}
          </div>
        </div>` : ''}
      </div>`;
  }

  function buildSection(title, fights, sectionKey, isMainCard) {
    if (!fights || !fights.length) return '';
    const cards = fights.map((f, i) => buildFight(f, sectionKey, i, isMainCard && i === 0)).join('');
    return `<div class="pk-section"><div class="pk-section-label">${esc(title)}</div>${cards}</div>`;
  }

  function scoreBadge() {
    if (!isCompleted) return '';
    const { correct, total } = computeScore();
    if (total === 0) return `<div class="pk-score-wrap"><div class="pk-score-empty">Make picks before events to track your record</div></div>`;
    const pct = Math.round((correct / total) * 100);
    const cls = pct >= 70 ? 'great' : pct >= 50 ? 'ok' : 'poor';
    const label = pct >= 70 ? 'Solid Call' : pct >= 50 ? 'Average' : 'Rough Night';
    return `
      <div class="pk-score-wrap">
        <div class="pk-score pk-score-${cls}">
          <span class="pk-score-fraction">${correct}<span class="pk-score-denom">/${total}</span></span>
          <div class="pk-score-right">
            <div class="pk-score-pct">${pct}%</div>
            <div class="pk-score-label">${label}</div>
          </div>
        </div>
      </div>`;
  }

  // ── Hype widget HTML ──────────────────────────
  function hypeWidgetHtml() {
    if (isCompleted) return '';
    const avgStr = hypeCount > 0 ? `${hypeAvg.toFixed(1)} avg · ${hypeCount} rating${hypeCount !== 1 ? 's' : ''}` : 'Be first to rate';
    const btns = [1,2,3,4,5].map(n =>
      `<button class="pk-hype-num-btn${localHype === n ? ' active' : localHype > n ? ' lit' : ''}" data-val="${n}" type="button">${n}</button>`
    ).join('');
    return `
      <div class="pk-hype-widget" id="pkHypeWidget">
        <div class="pk-hype-label">Hype</div>
        <div class="pk-hype-nums">${btns}</div>
        <div class="pk-hype-avg">${avgStr}</div>
      </div>`;
  }

  // ── FOTN section HTML ─────────────────────────
  function fotnSectionHtml() {
    if (isCompleted) return '';
    const allFights = [
      ...(event.mainCard || []).map((f, i) => ({ name: `${f.a} vs ${f.b}`, key: `main-${i}` })),
      ...(event.prelims || []).map((f, i) => ({ name: `${f.a} vs ${f.b}`, key: `prelims-${i}` })),
    ];
    if (!allFights.length) return '';
    const localFotn = localPicks['fotn']?.pick || null;
    const savedFotn = myPicks['fotn']?.pick || null;
    const fotnCards = allFights.map(f => {
      const isSelected = f.name === localFotn;
      const isSaved = f.name === savedFotn;
      return `<button class="pk-fotn-fight${isSelected ? ' selected' : ''}${isSelected && isSaved ? ' saved' : ''}" data-fight="${esc(f.name)}" type="button">
        <span class="pk-fotn-fight-name">${esc(f.name)}</span>
      </button>`;
    }).join('');
    return `
      <div class="pk-fotn-section" id="pkFotnSection">
        <div class="pk-section-label pk-fotn-title">
          <span>Fight of the Night Prediction</span>
          <span class="pk-fotn-hint">Pick a fight from the main card. Correct = bonus points.</span>
        </div>
        <div class="pk-fotn-fights">${fotnCards}</div>
        <div class="pk-fotn-selected-lbl" style="display:none"></div>
      </div>`;
  }

  // ── Render ────────────────────────────────────
  function render() {
    const mainSection   = buildSection('Main Card',     event.mainCard,     'main',    true);
    const prelimSection = buildSection('Prelims',       event.prelims,      'prelims', false);
    const earlySection  = buildSection('Early Prelims', event.earlyPrelims, 'early',   false);

    const picked = pickCount();
    const total  = (event.mainCard||[]).length + (event.prelims||[]).length + (event.earlyPrelims||[]).length;
    const dirty  = hasUnsavedChanges();
    const hasPoster = !!event.poster;

    root.innerHTML = `
      ${hasPoster ? `<div class="pk-poster-bg" style="--poster:url('${esc(event.poster)}')"></div>` : ''}
      <div class="pk-header">
        <a href="events.html?id=${encodeURIComponent(eventId)}" class="pk-back">
          <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><polyline points="7,1 2,7 7,13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </a>
        <div class="pk-header-info">
          <div class="pk-event-type">${esc(event.type || 'UFC')} · Pick Your Fights</div>
          <h1 class="pk-event-name">${esc(event.name || '')}</h1>
          <div class="pk-event-meta">
            ${event.date ? `<span>${esc(event.date)}</span>` : ''}
            ${event.location ? `<span class="pk-meta-dot">·</span><span>${esc(event.location)}</span>` : ''}
          </div>
        </div>
        <div class="pk-header-right">
          ${scoreBadge()}
          ${hypeWidgetHtml()}
          ${!isCompleted && myId ? `
            <div class="pk-progress-wrap">
              <div class="pk-progress-bar" style="width:${total ? Math.round((picked/total)*100) : 0}%"></div>
            </div>
            <div class="pk-progress-label">${picked} of ${total} picked</div>
          ` : ''}
        </div>
      </div>

      ${!myId ? `
        <div class="pk-signin-banner">
          <span>Sign in to save your picks and track your record</span>
          <a href="auth.html" class="pk-signin-link">Sign In →</a>
        </div>` : ''}

      ${isCompleted ? `<div class="pk-completed-banner">Event Complete — Results</div>` : ''}

      ${challenge ? `
      <div class="pk-challenge-banner">
        <div class="pk-ch-info">
          <div class="pk-ch-vs">H2H vs <strong>${esc(oppName)}</strong></div>
          <div class="pk-ch-tally">You: ${picked} picks · ${esc(oppName)}: ${oppPickCount} picks</div>
        </div>
      </div>` : ''}

      <div class="pk-body">
        ${mainSection}${prelimSection}${earlySection}
        ${fotnSectionHtml()}
        ${isCompleted && nextEventData ? `
        <div class="pk-next-event">
          <div class="pk-next-label">Up Next</div>
          <div class="pk-next-name">${esc(nextEventData.name)}</div>
          <div class="pk-next-meta">${esc(nextEventData.date || '')}${nextEventData.location ? ' · ' + esc(nextEventData.location) : ''}</div>
          <a class="pk-next-btn" href="picks.html?id=${encodeURIComponent(nextEventData.id)}">Make Your Picks</a>
        </div>` : ''}
      </div>`;

    // Sticky save bar
    document.getElementById('pkSaveBar')?.remove();
    if (!isCompleted && myId) {
      const saveBar = document.createElement('div');
      saveBar.id = 'pkSaveBar';
      saveBar.className = 'pk-save-bar';
      let btnLabel = 'Save Picks', btnCls = '';
      if (dirty && picked > 0) { btnLabel = `Save ${picked} Pick${picked !== 1 ? 's' : ''}`; btnCls = 'dirty'; }
      else if (!dirty && picked > 0) { btnLabel = `✓ ${picked} Picks Saved`; btnCls = 'saved'; }
      saveBar.innerHTML = `
        <div class="pk-save-info"><strong>${picked}</strong> of <strong>${total}</strong> fights picked</div>
        <button class="pk-save-btn${btnCls ? ' '+btnCls : ''}" id="pkSaveBtn">${btnLabel}</button>`;
      document.body.appendChild(saveBar);
      document.getElementById('pkSaveBtn').addEventListener('click', saveAllPicks);
    }

    bindInteractions();
    bindHype();
    bindFotn();
    updateFotnSection();
  }

  // ── Bind hype flames ──────────────────────────
  function bindHype() {
    const widget = document.getElementById('pkHypeWidget');
    if (!widget) return;
    widget.querySelectorAll('.pk-hype-num-btn').forEach(b => {
      b.addEventListener('click', () => saveHype(+b.dataset.val));
    });
  }

  // ── Bind FOTN section ─────────────────────────
  function bindFotn() {
    const section = document.getElementById('pkFotnSection');
    if (!section) return;
    section.querySelectorAll('.pk-fotn-fight').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.fight;
        const alreadySelected = localPicks['fotn']?.pick === name;
        if (alreadySelected) {
          delete localPicks['fotn'];
        } else {
          localPicks['fotn'] = { pick: name, base: '', round: '' };
        }
        updateFotnSection();
        updateSaveBar();
      });
    });
  }

  // ── Bind fighter/method/round clicks ──────────
  function bindInteractions() {
    if (isCompleted) return;

    root.querySelectorAll('.pk-side').forEach(side => {
      const activate = () => {
        const key  = side.dataset.key;
        const pick = side.dataset.pick;
        const fight = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;
        if (!myId) { showToast('Sign in to save picks', 'err'); return; }

        const wasSelected = side.classList.contains('selected');
        fight.querySelectorAll('.pk-side').forEach(s => {
          s.classList.remove('selected');
          s.querySelector('.pk-pick-label')?.remove();
        });

        if (!wasSelected) {
          side.classList.add('selected');
          const lbl = document.createElement('div');
          lbl.className = 'pk-pick-label pk-pick-unsaved';
          lbl.textContent = 'Your pick •';
          side.appendChild(lbl);
          const cur = localPicks[key] || {};
          localPicks[key] = { pick, base: cur.base || '', round: cur.round || '' };
        } else {
          delete localPicks[key];
          fight.querySelectorAll('.pk-method-btn').forEach(b => b.classList.remove('active', 'ko', 'sub', 'dec'));
          const roundRow = fight.querySelector(`[id^="pkRounds-"]`);
          if (roundRow) roundRow.style.display = 'none';
        }
        updateSaveBar();
      };
      side.addEventListener('click', activate);
      side.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });

    root.querySelectorAll('.pk-method-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const key    = btn.dataset.key;
        const method = btn.dataset.method;
        const fight  = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;
        if (!localPicks[key]) { showToast('Pick a fighter first', 'err'); return; }

        const alreadyActive = btn.classList.contains('active');
        const methodCls = method === 'KO/TKO' ? 'ko' : method === 'SUB' ? 'sub' : 'dec';
        const newBase   = alreadyActive ? '' : method;
        const showRound = !alreadyActive && (method === 'KO/TKO' || method === 'SUB');
        const newRound  = showRound ? (localPicks[key].round || '') : '';

        fight.querySelectorAll('.pk-method-btn').forEach(b => b.classList.remove('active', 'ko', 'sub', 'dec'));
        if (!alreadyActive) btn.classList.add('active', methodCls);

        const roundRow = document.getElementById(`pkRounds-${key}`);
        if (roundRow) {
          roundRow.style.display = showRound ? '' : 'none';
          fight.querySelectorAll('.pk-round-btn').forEach(rb => {
            rb.classList.remove('active', 'ko', 'sub');
            if (showRound && rb.dataset.round === localPicks[key].round) rb.classList.add('active', methodCls);
          });
        }
        localPicks[key] = { ...localPicks[key], base: newBase, round: showRound ? newRound : '' };
        updateSaveBar();
      });
    });

    root.querySelectorAll('.pk-round-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const key   = btn.dataset.key;
        const round = btn.dataset.round;
        const fight = root.querySelector(`.pk-fight[data-key="${key}"]`);
        if (!fight) return;
        if (!localPicks[key]?.base) { showToast('Pick a method first', 'err'); return; }

        const alreadyActive = btn.classList.contains('active');
        const methodCls = localPicks[key].base === 'KO/TKO' ? 'ko' : 'sub';
        fight.querySelectorAll('.pk-round-btn').forEach(rb => rb.classList.remove('active','ko','sub'));
        const newRound = alreadyActive ? '' : round;
        if (!alreadyActive) btn.classList.add('active', methodCls);
        localPicks[key] = { ...localPicks[key], round: newRound };
        updateSaveBar();
      });
    });
  }

  render();

  // ── Auth late-arrival ─────────────────────────
  if (sb && !isCompleted) {
    sb.auth.onAuthStateChange(async (ev, session) => {
      const uid = session?.user?.id;
      if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && uid && uid !== myId) {
        myId = uid;
        await Promise.all([loadPicks(), loadChallenge(), loadCommunityPicks()]);
        render();
      }
    });
  }

})();
