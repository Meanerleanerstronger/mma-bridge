// ==============================================
// MMA BRIDGE — FIGHT PICKS (manual save + hype + FOTN)
// ==============================================

// ── Betting odds helpers ──────────────────────
let _oddsCache = [];
async function loadOdds(eventId) {
  try {
    const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG?.API?.BASE_URL) || 'https://mmabridge-backend.onrender.com/api';
    const res = await fetch(`${API_BASE}/odds/${eventId}`);
    if (res.ok) {
      const data = await res.json();
      _oddsCache = data.odds || [];
    }
  } catch {}
}

function getOddsForFight(nameA, nameB) {
  const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
  const match = _oddsCache.find(o =>
    (norm(o.a).includes(norm(nameA)) || norm(nameA).includes(norm(o.a))) ||
    (norm(o.b).includes(norm(nameB)) || norm(nameB).includes(norm(o.b)))
  );
  if (!match) return null;
  return match;
}

function formatOdds(n) {
  if (!n) return '';
  return n > 0 ? `+${n}` : `${n}`;
}

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

  const root  = document.getElementById('pkRoot');
  const toast = document.getElementById('pkToast');
  const sb    = window._sb;

  // Persist event ID so refresh / direct navigation works
  let eventId = getParam('id');
  if (!eventId) {
    const stored = sessionStorage.getItem('pk_last_event');
    if (stored) {
      history.replaceState(null, '', location.pathname + '?id=' + encodeURIComponent(stored));
      eventId = stored;
    }
  }
  if (eventId) sessionStorage.setItem('pk_last_event', eventId);

  function apiBase() {
    if (window.CONFIG && window.CONFIG.API && window.CONFIG.API.BASE_URL) return window.CONFIG.API.BASE_URL;
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

  if (!eventId) { root.innerHTML = `<div class="pk-error">No event selected. <a href="events.html" style="color:#00e5ff;text-decoration:none;">Browse events →</a></div>`; return; }
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
  function fighterForm(name) {
    const fd = lookupFighter(name);
    if (!fd?.last5?.length) return '';
    const dots = fd.last5.slice(0, 5).map(f => {
      const r = (f.result || '').toUpperCase();
      const cls = r === 'W' ? 'w' : r === 'L' ? 'l' : 'nc';
      return `<span class="pk-form-dot pk-form-dot-${cls}">${r}</span>`;
    }).join('');
    return `<div class="pk-form-strip">${dots}</div>`;
  }

  const event = eventsData.find(e => e.id === eventId || slugify(e.name || '') === eventId);
  if (!event) { root.innerHTML = `<div class="pk-error">Event not found. <a href="events.html" style="color:#00e5ff;text-decoration:none;">Browse events →</a></div>`; return; }

  const isCompleted = event.status === 'completed';
  // Picks lock the moment the event start time passes (even before UFC marks it completed)
  const isLocked = !isCompleted && !!event.start_time && new Date() >= new Date(event.start_time);
  let myId = user?.id || null;

  // ── State ─────────────────────────────────────
  let myPicks    = {};   // confirmed DB state
  let localPicks = {};   // pending local state (includes 'fotn' key)
  let hypeAvg    = 0;
  let hypeCount  = 0;
  let localHype  = 0;   // user's hype rating (0 = not rated)
  let careerCorrect = 0;
  let careerJudged  = 0;
  let fotnPickMode  = false;  // cursor-mode FOTN selection active
  let fotnCursorEl  = null;

  // ── Method drum constants ─────────────────────
  const DRUM_ITEMS = [
    { method: '', label: 'Method' },
    { method: 'KO/TKO', label: 'KO / TKO' },
    { method: 'SUB', label: 'Submission' },
    { method: 'DEC', label: 'Decision' },
  ];
  const DRUM_H = 44;

  // ── Points system ─────────────────────────────
  const POINTS = { WINNER: 10, METHOD: 5, ROUND: 5, FOTN: 15 };

  function normalizeMethodBase(m) {
    if (!m) return '';
    const u = m.toUpperCase();
    if (u.includes('KO') || u.includes('TKO')) return 'KO/TKO';
    if (u.includes('SUB') || u.includes('CHOKE') || u.includes('RNC') ||
        u.includes('TRIANGLE') || u.includes('ARMBAR') || u.includes('GUILLOTINE') ||
        u.includes('KIMURA') || u.includes('REAR NAKED')) return 'SUB';
    if (u.includes('DECISION') || u === 'DEC' || u === 'UD' || u === 'SD' || u === 'MD' ||
        u.endsWith(' UD') || u.endsWith(' SD') || u.endsWith(' MD')) return 'DEC';
    return '';
  }

  function extractRoundNum(m) {
    const match = String(m || '').match(/R\s*(\d)/i);
    return match ? match[1] : '';
  }

  function computePickPoints(fightKey, fightData) {
    const p = myPicks[fightKey];
    if (!p || !fightData?.winner) return { pts: 0, breakdown: [] };
    if ((p.pick || '').toLowerCase() !== fightData.winner.toLowerCase()) return { pts: 0, breakdown: [] };
    let pts = POINTS.WINNER;
    const breakdown = ['+10 winner'];
    if (p.method && fightData.method) {
      const pickedBase = normalizeMethodBase(p.method);
      const actualBase = normalizeMethodBase(fightData.method);
      if (pickedBase && actualBase && pickedBase === actualBase) {
        pts += POINTS.METHOD;
        breakdown.push('+5 method');
        if (pickedBase === 'KO/TKO' || pickedBase === 'SUB') {
          const pr = extractRoundNum(p.method);
          const ar = extractRoundNum(fightData.method);
          if (pr && ar && pr === ar) {
            pts += POINTS.ROUND;
            breakdown.push('+5 round');
          }
        }
      }
    }
    return { pts, breakdown };
  }

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
    // Overlay any unsaved draft changes from sessionStorage
    try {
      const draft = sessionStorage.getItem(`pk_draft_${eventId}`);
      if (draft) {
        const d = JSON.parse(draft);
        Object.entries(d).forEach(([k, v]) => { localPicks[k] = v; });
      }
    } catch {}
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

  // ── Career accuracy ──────────────────────────
  async function loadCareerStats() {
    if (!myId || !sb) return;
    try {
      const { data } = await sb.from('picks')
        .select('event_id, fight_key, pick')
        .eq('user_id', myId)
        .neq('fight_key', 'fotn');
      const wMap = {};
      eventsData.filter(e => e.status === 'completed').forEach(ev => {
        [
          ...(ev.mainCard     || []).map((f, i) => ({ f, k: `main-${i}` })),
          ...(ev.prelims      || []).map((f, i) => ({ f, k: `prelims-${i}` })),
          ...(ev.earlyPrelims || []).map((f, i) => ({ f, k: `early-${i}` })),
        ].forEach(({ f, k }) => { if (f.winner) wMap[`${ev.id}:${k}`] = f.winner.toLowerCase(); });
      });
      let correct = 0, judged = 0;
      (data || []).forEach(p => {
        const w = wMap[`${p.event_id}:${p.fight_key}`];
        if (w === undefined) return;
        judged++;
        if (p.pick?.toLowerCase() === w) correct++;
      });
      careerCorrect = correct;
      careerJudged  = judged;
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

  await Promise.all([loadChallenge(), loadEventExtras(), loadCommunityPicks(), prefetchNextEvent(), loadCareerStats(), loadOdds(eventId)]);

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
    if (!localHype) {
      showToast('Rate the hype before saving', 'err');
      document.getElementById('pkHypeTrack')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('pkHypeWidget')?.classList.add('pk-hype-shake');
      setTimeout(() => document.getElementById('pkHypeWidget')?.classList.remove('pk-hype-shake'), 600);
      return;
    }
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
      sessionStorage.removeItem(`pk_draft_${eventId}`);
      const n = pickCount();
      // Crowd alignment summary
      let withCrowd = 0, upsets = 0;
      Object.entries(localPicks).forEach(([k, p]) => {
        if (k === 'fotn') return;
        const comm = communityPicks[k] || {};
        const ct = Object.values(comm).reduce((s, v) => s + v, 0);
        if (ct < 5) return;
        const myPct = Math.round(((comm[p.pick] || 0) / ct) * 100);
        if (myPct >= 60) withCrowd++;
        else if (myPct <= 40) upsets++;
      });
      let toastMsg = `${n} pick${n !== 1 ? 's' : ''} locked in`;
      if (withCrowd + upsets >= 3) toastMsg += ` · ${upsets} upset${upsets !== 1 ? 's' : ''}`;
      showToast(toastMsg);
      // Brief locked glow on save bar
      const bar = document.getElementById('pkSaveBar');
      if (bar) { bar.classList.add('pk-save-bar-locked'); setTimeout(() => bar.classList.remove('pk-save-bar-locked'), 1400); }
      updateSaveBar();
      updateSpine();
      updateFotnSection();
    } catch (e) {
      console.error('saveAllPicks:', e);
      showToast('Could not save picks — please try again', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Save bar ──────────────────────────────────
  function updateSaveBar() {
    const picked = pickCount();
    const bar = document.getElementById('pkSaveBar');
    if (!bar) return;
    const btn  = bar.querySelector('.pk-save-btn');
    if (btn) {
      const dirty = hasUnsavedChanges();
      let btnLabel = 'Save Picks', btnCls = '';
      if (dirty && picked > 0) {
        btnLabel = `Save ${picked} Pick${picked !== 1 ? 's' : ''}`;
        btnCls = 'dirty';
      } else if (!dirty && picked > 0) {
        btnLabel = `✓ ${picked} Picks Saved`;
        btnCls = 'saved';
      }
      btn.className = `pk-save-btn${btnCls ? ' '+btnCls : ''}`;
      btn.textContent = btnLabel;
      btn.disabled = false;
    }
  }

  // ── Update hype widget ────────────────────────
  const HYPE_LABELS = ['', 'SLEEPER', 'LOW KEY', 'BUILDING', 'HYPED', 'MUST-SEE'];

  function updateHypeWidget() {
    const pct = localHype ? localHype * 20 : 0;
    const fill = document.getElementById('pkHypeFill');
    const thumb = document.getElementById('pkHypeThumb');
    const labelEl = document.getElementById('pkHypeLabel');
    const avgEl = document.getElementById('pkHypeAvg');
    if (fill) fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (labelEl) labelEl.textContent = localHype ? (HYPE_LABELS[localHype] || '') : 'Rate the hype';
    if (avgEl) {
      if (hypeCount > 0) {
        avgEl.innerHTML = `<span class="pk-hm-score">${hypeAvg.toFixed(1)}</span> avg · ${hypeCount} ${hypeCount === 1 ? 'rating' : 'ratings'}`;
      } else {
        avgEl.textContent = 'Be the first to rate';
      }
    }
  }

  // ── FOTN mode helpers ─────────────────────────
  function fotnLastNames(fightName) {
    const parts = (fightName || '').split(' vs ');
    const last = n => (n||'').trim().split(' ').pop().toUpperCase();
    return `${last(parts[0])} vs ${last(parts[1])}`;
  }

  function fotnBarInnerHtml() {
    const localFotn = localPicks['fotn']?.pick || null;
    const savedFotn = myPicks['fotn']?.pick || null;
    if (fotnPickMode) {
      return {
        cls: 'pk-fotn-bar pk-fotn-bar-picking',
        html: `
          <div class="pk-fotn-bar-left">
            <div class="pk-fotn-bar-badge pk-fotn-bar-badge-live">FOTN</div>
            <div class="pk-fotn-pick-hint">Click any fight card</div>
          </div>
          <button class="pk-fotn-cancel-btn" id="pkFotnPickBtn" type="button">✕ Cancel</button>`,
      };
    }
    if (localFotn) {
      const isSaved = localFotn === savedFotn;
      return {
        cls: `pk-fotn-bar pk-fotn-bar-has-pick${isSaved ? ' saved' : ''}`,
        html: `
          <div class="pk-fotn-bar-left">
            <div class="pk-fotn-bar-badge">FOTN</div>
            <div class="pk-fotn-bar-names">${esc(fotnLastNames(localFotn))}</div>
            ${!isSaved ? '<span class="pk-fotn-bar-dot">unsaved</span>' : ''}
          </div>
          <button class="pk-fotn-change-btn" id="pkFotnPickBtn" type="button">Change</button>`,
      };
    }
    return {
      cls: 'pk-fotn-bar pk-fotn-bar-empty',
      html: `
        <div class="pk-fotn-bar-left">
          <div class="pk-fotn-bar-badge">FOTN</div>
          <div class="pk-fotn-bar-hint">Which fight steals the show?</div>
        </div>
        <button class="pk-fotn-pick-btn" id="pkFotnPickBtn" type="button">Pick Fight of the Night</button>`,
    };
  }

  function updateFotnBar() {
    const bar = document.getElementById('pkFotnBar');
    if (!bar) return;
    const { cls, html } = fotnBarInnerHtml();
    bar.className = cls;
    bar.innerHTML = html;
    const btn = document.getElementById('pkFotnPickBtn');
    if (btn) btn.onclick = fotnPickMode ? exitFotnMode : enterFotnMode;
  }

  // Legacy alias so saveAllPicks → updateFotnSection still works
  function updateFotnSection() { updateFotnBar(); }

  function enterFotnMode() {
    if (isCompleted || isLocked) return;
    fotnPickMode = true;
    root.classList.add('pk-fotn-picking');
    document.body.classList.add('pk-fotn-picking-body');
    if (!fotnCursorEl) {
      fotnCursorEl = document.createElement('div');
      fotnCursorEl.id = 'pkFotnCursor';
      fotnCursorEl.className = 'pk-fotn-cursor';
      document.body.appendChild(fotnCursorEl);
      document.addEventListener('mousemove', e => {
        if (!fotnCursorEl) return;
        fotnCursorEl.style.left = e.clientX + 'px';
        fotnCursorEl.style.top  = e.clientY + 'px';
      });
    }
    fotnCursorEl.style.display = 'block';
    updateFotnBar();
  }

  function exitFotnMode() {
    fotnPickMode = false;
    root.classList.remove('pk-fotn-picking');
    document.body.classList.remove('pk-fotn-picking-body');
    if (fotnCursorEl) fotnCursorEl.style.display = 'none';
    hideFotnConfirm();
    updateFotnBar();
  }

  function showFotnConfirm(fightName) {
    let el = document.getElementById('pkFotnConfirmBar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pkFotnConfirmBar';
      el.className = 'pk-fotn-confirm-bar';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="pk-fotn-confirm-name">${esc(fotnLastNames(fightName))}</div>
      <div class="pk-fotn-confirm-q">Save as your Fight of the Night pick?</div>
      <div class="pk-fotn-confirm-btns">
        <button class="pk-fotn-confirm-yes" id="pkFotnYes" type="button">Yes, that's my pick</button>
        <button class="pk-fotn-confirm-no" id="pkFotnNo" type="button">Cancel</button>
      </div>`;
    el.style.display = 'flex';
    document.getElementById('pkFotnYes').onclick = () => {
      localPicks['fotn'] = { pick: fightName, base: '', round: '' };
      exitFotnMode();
      updateSaveBar();
      showToast('FOTN pick set — save to lock it in');
    };
    document.getElementById('pkFotnNo').onclick = hideFotnConfirm;
  }

  function hideFotnConfirm() {
    const el = document.getElementById('pkFotnConfirmBar');
    if (el) el.style.display = 'none';
  }

  // ── Score if completed ────────────────────────
  function computeScore() {
    const allFights = [
      ...(event.mainCard     || []).map((f, i) => ({ f, key: `main-${i}` })),
      ...(event.prelims      || []).map((f, i) => ({ f, key: `prelims-${i}` })),
      ...(event.earlyPrelims || []).map((f, i) => ({ f, key: `early-${i}` })),
    ];
    let correct = 0, judged = 0, totalPts = 0;
    allFights.forEach(({ f, key }) => {
      if (!myPicks[key] || !f.winner) return;
      judged++;
      const { pts } = computePickPoints(key, f);
      totalPts += pts;
      if (pts >= POINTS.WINNER) correct++;
    });
    // FOTN bonus
    let fotnPts = 0;
    const fotnPick = myPicks['fotn']?.pick;
    if (fotnPick && event.fotn && fotnPick.toLowerCase() === event.fotn.toLowerCase()) {
      fotnPts = POINTS.FOTN;
      totalPts += fotnPts;
    }
    return { correct, total: judged, totalPts, fotnPts };
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

  // ── Build one fight row (broadcast scoreboard) ─
  function buildFight(f, sectionKey, idx, isMain) {
    const key      = `${sectionKey}-${idx}`;
    const saved    = localPicks[key] || {};
    const opp      = oppPicks[key] || {};
    const pickedA  = saved.pick === f.a;
    const pickedB  = saved.pick === f.b;
    const isSavedA = myPicks[key]?.pick === f.a;
    const isSavedB = myPicks[key]?.pick === f.b;
    const savedBase  = saved.base  || '';
    const savedRound = saved.round || '';
    const rounds   = maxRounds(f.rounds);
    const winner   = f.winner || null;
    const resultA  = isCompleted && winner ? (winner === f.a ? 'win' : 'loss') : '';
    const resultB  = isCompleted && winner ? (winner === f.b ? 'win' : 'loss') : '';
    const correctA = isCompleted && pickedA && resultA === 'win';
    const correctB = isCompleted && pickedB && resultB === 'win';
    const { pts: ptsA } = (isCompleted && pickedA) ? computePickPoints(key, f) : { pts: 0 };
    const { pts: ptsB } = (isCompleted && pickedB) ? computePickPoints(key, f) : { pts: 0 };
    const comm      = communityPicks[key] || {};
    const commTotal = Object.values(comm).reduce((s, v) => s + v, 0);
    const hasPick   = pickedA || pickedB;
    const showComm  = commTotal > 0 && (isCompleted || hasPick);
    const commPctA  = showComm ? Math.round(((comm[f.a] || 0) / commTotal) * 100) : null;
    const commPctB  = showComm ? Math.round(((comm[f.b] || 0) / commTotal) * 100) : null;
    const oppPickedA = challenge && opp.pick === f.a;
    const oppPickedB = challenge && opp.pick === f.b;
    const drumIdx    = savedBase ? Math.max(0, DRUM_ITEMS.findIndex(d => d.method === savedBase)) : 0;
    const drumOffset = -(drumIdx * DRUM_H);
    const needsRound = savedBase === 'KO/TKO' || savedBase === 'SUB';
    const roundCls   = savedBase === 'KO/TKO' ? 'ko' : 'sub';
    const roundBtns  = Array.from({length: rounds}, (_, i) => i + 1).map(r =>
      `<button class="pk-round-btn${savedRound === String(r) ? ` active ${roundCls}` : ''}" data-round="${r}" data-key="${esc(key)}" data-method-cls="${roundCls}">R${r}</button>`
    ).join('');
    const odds = getOddsForFight(f.a, f.b);

    // Side A classes
    const sideACls = ['sb-side sb-side-a', pickedA ? 'selected' : '', pickedB ? 'dimmed' : '', resultA ? `result-${resultA}` : ''].filter(Boolean).join(' ');
    // Side B classes
    const sideBCls = ['sb-side sb-side-b', pickedB ? 'selected' : '', pickedA ? 'dimmed' : '', resultB ? `result-${resultB}` : ''].filter(Boolean).join(' ');

    // Photos
    const photoA = f.imgA
      ? `<div class="sb-photo"><img src="${esc(f.imgA)}" alt="${esc(f.a)}" loading="lazy" onerror="this.parentNode.innerHTML='${SILHOUETTE}'"></div>`
      : `<div class="sb-photo sb-photo-empty">${SILHOUETTE}</div>`;
    const photoB = f.imgB
      ? `<div class="sb-photo"><img src="${esc(f.imgB)}" alt="${esc(f.b)}" loading="lazy" onerror="this.parentNode.innerHTML='${SILHOUETTE}'"></div>`
      : `<div class="sb-photo sb-photo-empty">${SILHOUETTE}</div>`;

    const recA = fighterRecord(f.a);
    const recB = fighterRecord(f.b);

    // Pick/result badges
    const badgeA = correctA
      ? `<div class="sb-correct-badge">✓ +${ptsA}pts</div>`
      : (isCompleted && pickedA ? `<div class="sb-wrong-badge">✗ 0pts</div>` : '')
      + (!isCompleted && pickedA ? `<div class="sb-pick-badge${isSavedA ? '' : ' unsaved'}">${isSavedA ? 'YOUR PICK ✓' : 'YOUR PICK •'}</div>` : '');
    const badgeB = correctB
      ? `<div class="sb-correct-badge">✓ +${ptsB}pts</div>`
      : (isCompleted && pickedB ? `<div class="sb-wrong-badge">✗ 0pts</div>` : '')
      + (!isCompleted && pickedB ? `<div class="sb-pick-badge${isSavedB ? '' : ' unsaved'}">${isSavedB ? 'YOUR PICK ✓' : 'YOUR PICK •'}</div>` : '');

    // Center column
    let centerHtml = `<div class="sb-vs">VS</div>`;
    if (f.titleFight) centerHtml += `<div class="sb-title-pip">TITLE</div>`;
    if (f.weight) centerHtml += `<div class="sb-weight-tag">${esc(f.weight)}</div>`;
    if (odds) {
      const aFav = odds.odds_a < odds.odds_b;
      centerHtml += `<div class="sb-odds">
        <span class="sb-odds-a${aFav ? ' fav' : ''}">${formatOdds(odds.odds_a)}</span>
        <span class="sb-odds-sep">/</span>
        <span class="sb-odds-b${!aFav ? ' fav' : ''}">${formatOdds(odds.odds_b)}</span>
      </div>`;
    }
    if (isCompleted && winner) {
      centerHtml += `<div class="sb-method-result">${esc(f.method || '')}</div>`;
    }
    if (showComm && commPctA !== null) {
      centerHtml += `
        <div class="sb-comm-bar"><div class="sb-comm-fill" style="width:${commPctA}%"></div></div>
        <div class="sb-comm-pcts"><span>${commPctA}%</span><span>${commPctB}%</span></div>`;
    }

    // Method row (slides in when picked)
    const methodWrap = !isCompleted ? `
      <div class="sb-method-wrap${hasPick ? ' visible' : ''}" id="pkMethod-${esc(key)}">
        <div class="pk-method-drum" id="pkDrum-${esc(key)}" data-key="${esc(key)}">
          <div class="pk-drum-window">
            <div class="pk-drum-strip" id="pkDrumStrip-${esc(key)}" style="transform:translateY(${drumOffset}px)">
              ${DRUM_ITEMS.map(d => `<div class="pk-drum-item pk-drum-${(d.method||'none').replace('/','-').toLowerCase()}">${esc(d.label)}</div>`).join('')}
            </div>
          </div>
          <div class="pk-drum-hint">↕ tap to cycle</div>
        </div>
        <div class="pk-round-row${needsRound ? ' pk-round-row-visible' : ''}" id="pkRounds-${esc(key)}">
          <span class="pk-round-label">Round</span>
          ${roundBtns}
        </div>
      </div>` : '';

    return `
      <div class="sb-fight${hasPick ? ' has-pick' : ''}${isMain ? ' is-main' : ''}${isCompleted ? ' is-completed' : ''}" data-key="${esc(key)}">
        <div class="sb-fight-row">
          <div class="${sideACls}" data-key="${esc(key)}" data-pick="${esc(f.a)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            ${photoA}
            <div class="sb-info">
              <div class="sb-name">${esc(f.a)}</div>
              <div class="sb-details">
                ${recA ? `<span>${esc(recA)}</span>` : ''}
                ${fighterForm(f.a)}
              </div>
              ${badgeA}
              ${oppPickedA ? `<div class="sb-opp-badge">${esc(oppName)}'s pick</div>` : ''}
            </div>
          </div>
          <div class="sb-center">${centerHtml}</div>
          <div class="${sideBCls}" data-key="${esc(key)}" data-pick="${esc(f.b)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="sb-info">
              <div class="sb-name">${esc(f.b)}</div>
              <div class="sb-details">
                ${recB ? `<span>${esc(recB)}</span>` : ''}
                ${fighterForm(f.b)}
              </div>
              ${badgeB}
              ${oppPickedB ? `<div class="sb-opp-badge">${esc(oppName)}'s pick</div>` : ''}
            </div>
            ${photoB}
          </div>
        </div>
        ${methodWrap}
      </div>`;
  }

  function buildSection(title, fights, sectionKey, isMainCard) {
    if (!fights || !fights.length) return '';
    const cards = fights.map((f, i) => buildFight(f, sectionKey, i, isMainCard && i === 0)).join('');
    return `
      <div class="sb-section">
        <div class="sb-section-header">
          <div class="sb-section-line"></div>
          <div class="sb-section-label">${esc(title)}</div>
          <div class="sb-section-line"></div>
        </div>
        <div class="sb-section-fights">${cards}</div>
      </div>`;
  }

  // Small header badge — for upcoming events showing career record
  function careerBadgeHtml() {
    if (!myId || careerJudged < 3) return '';
    const pct = Math.round((careerCorrect / careerJudged) * 100);
    const cls = pct >= 65 ? 'great' : pct >= 50 ? 'ok' : 'poor';
    return `<div class="pk-career-badge pk-career-badge-${cls}">${careerCorrect}/${careerJudged} all-time · ${pct}%</div>`;
  }

  // Full score hero for completed events
  function scoreHero() {
    if (!isCompleted) return '';
    const { correct, total, totalPts, fotnPts } = computeScore();
    if (!myId) return `<div class="pk-score-hero pk-score-hero-anon"><div class="pk-score-hero-anon-title">Sign in to track your picks</div><a href="auth.html" class="pk-score-hero-anon-link">Sign In →</a></div>`;
    if (total === 0) return `<div class="pk-score-hero pk-score-hero-empty"><div class="pk-score-hero-empty-title">No picks recorded</div><div class="pk-score-hero-empty-sub">Make picks on upcoming events to track your accuracy</div></div>`;
    const pct = Math.round((correct / total) * 100);
    const cls = pct >= 70 ? 'great' : pct >= 50 ? 'ok' : 'poor';
    const verdict = pct >= 70 ? 'Sharp' : pct >= 50 ? 'Solid' : 'Rough Night';
    const careerPct = careerJudged >= 3 ? Math.round((careerCorrect / careerJudged) * 100) : null;
    return `
      <div class="pk-score-hero pk-score-hero-${cls}">
        <div class="pk-score-hero-inner">
          <div class="pk-score-hero-pts-block">
            <div class="pk-score-hero-pts">${totalPts}</div>
            <div class="pk-score-hero-pts-lbl">PTS</div>
          </div>
          <div class="pk-score-hero-divider"></div>
          <div class="pk-score-hero-nums">
            <span class="pk-score-hero-n">${correct}</span><span class="pk-score-hero-of">/${total}</span>
          </div>
          <div class="pk-score-hero-right">
            <div class="pk-score-hero-pct">${pct}%</div>
            <div class="pk-score-hero-verdict">${verdict}</div>
          </div>
        </div>
        ${fotnPts > 0 ? `<div class="pk-score-hero-fotn-bonus">⚡ +${fotnPts} FOTN Bonus</div>` : ''}
        ${careerPct !== null ? `<div class="pk-score-hero-career">All-time: ${careerCorrect}/${careerJudged} picks · ${careerPct}%</div>` : ''}
      </div>`;
  }

  // Countdown pill for upcoming events
  function countdownHtml() {
    if (isCompleted || !event.start_time) return '';
    return `<span class="pk-countdown" id="pkCountdown"></span>`;
  }

  var _pkCdStop = null;
  function initPkCountdown() {
    if (isCompleted || !event.start_time) return;
    var el = document.getElementById('pkCountdown');
    if (!el) return;
    if (_pkCdStop) { _pkCdStop(); _pkCdStop = null; }
    _pkCdStop = window.initCountdown ? window.initCountdown(el, event.start_time) : null;
  }

  // ── Hype meter — horizontal amber drag bar ──
  function hypeMeterHtml() {
    if (isCompleted || isLocked) return '';
    const pct = localHype ? localHype * 20 : 0;
    const label = localHype ? (HYPE_LABELS[localHype] || '') : 'Rate the hype';
    const avgStr = hypeCount > 0
      ? `<span class="pk-hm-score">${hypeAvg.toFixed(1)}</span> avg · ${hypeCount} ${hypeCount === 1 ? 'rating' : 'ratings'}`
      : 'Be the first to rate';
    return `
      <div class="pk-hype-meter" id="pkHypeWidget">
        <div class="pk-hm-label">HYPE</div>
        <div class="pk-hm-track" id="pkHypeTrack">
          <div class="pk-hm-fill" id="pkHypeFill" style="width:${pct}%"></div>
          <div class="pk-hm-thumb" id="pkHypeThumb" style="left:${pct}%"></div>
        </div>
        <div class="pk-hm-right">
          <div id="pkHypeLabel">${label}</div>
          <div id="pkHypeAvg">${avgStr}</div>
        </div>
      </div>`;
  }

  // ── FOTN bar at top of body ────────────────────
  function fotnBarHtml() {
    if (isCompleted || isLocked) return '';
    const { cls, html } = fotnBarInnerHtml();
    return `<div class="${cls}" id="pkFotnBar">${html}</div>`;
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
        <div class="pk-nav-row">
          <a href="events.html?id=${encodeURIComponent(eventId)}" class="pk-back">
            <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><polyline points="7,1 2,7 7,13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Events
          </a>
          <button class="pk-switch-btn" id="pkSwitchBtn" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Switch Event
          </button>
        </div>
        <div class="pk-header-info">
          <div class="pk-event-type">${esc(event.type || 'UFC')} · ${isCompleted ? 'Results' : isLocked ? 'Picks Locked' : 'Pick Your Fights'}</div>
          <h1 class="pk-event-name">${esc(event.name || '')}</h1>
          <div class="pk-event-meta">
            ${event.date ? `<span>${esc(event.date)}</span>` : ''}
            ${event.location ? `<span class="pk-meta-dot">·</span><span>${esc(event.location)}</span>` : ''}
            ${countdownHtml()}
          </div>
          ${!isCompleted && !isLocked ? careerBadgeHtml() : ''}
        </div>
        <div class="pk-header-right">
          ${!isCompleted && !isLocked && myId && careerJudged >= 3 ? careerBadgeHtml() : ''}
        </div>
      </div>

      ${isLocked ? `
        <div class="pk-locked-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Picks are locked — the event has started
        </div>` : ''}
      ${!myId && !isCompleted && !isLocked ? `
        <div class="pk-signin-banner">
          <span>Sign in to save your picks and track your record</span>
          <a href="auth.html" class="pk-signin-link">Sign In →</a>
        </div>` : ''}

      ${challenge ? `
      <div class="pk-challenge-banner">
        <div class="pk-ch-info">
          <div class="pk-ch-vs">H2H vs <strong>${esc(oppName)}</strong></div>
          <div class="pk-ch-tally">You: ${picked} picks · ${esc(oppName)}: ${oppPickCount} picks</div>
        </div>
      </div>` : ''}

      <div class="pk-body">
        ${scoreHero()}
        ${fotnBarHtml()}
        ${hypeMeterHtml()}
        ${mainSection}${prelimSection}${earlySection}
        ${isCompleted && nextEventData ? `
        <div class="pk-next-event">
          <div class="pk-next-label">Up Next</div>
          <div class="pk-next-name">${esc(nextEventData.name)}</div>
          <div class="pk-next-meta">${esc(nextEventData.date || '')}${nextEventData.location ? ' · ' + esc(nextEventData.location) : ''}</div>
          <a class="pk-next-btn" href="picks.html?id=${encodeURIComponent(nextEventData.id)}">Make Your Picks</a>
        </div>` : ''}
      </div>

      <div class="pk-switcher-overlay" id="pkSwitcherOverlay" aria-hidden="true">
        <div class="pk-switcher-backdrop" id="pkSwitcherBackdrop"></div>
        <div class="pk-switcher-panel">
          <div class="pk-switcher-head">
            <div class="pk-switcher-title">Pick Another Event</div>
            <button class="pk-switcher-close" id="pkSwitcherClose" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="pk-switcher-list" id="pkSwitcherList"></div>
        </div>
      </div>`;

    // Sticky save bar
    document.getElementById('pkSaveBar')?.remove();
    if (!isCompleted && !isLocked && myId) {
      const saveBar = document.createElement('div');
      saveBar.id = 'pkSaveBar';
      saveBar.className = 'pk-save-bar';
      let btnLabel = 'Save Picks', btnCls = '';
      if (dirty && picked > 0) { btnLabel = `Save ${picked} Pick${picked !== 1 ? 's' : ''}`; btnCls = 'dirty'; }
      else if (!dirty && picked > 0) { btnLabel = `✓ ${picked} Picks Saved`; btnCls = 'saved'; }
      saveBar.innerHTML = `<button class="pk-save-btn${btnCls ? ' '+btnCls : ''}" id="pkSaveBtn">${btnLabel}</button>`;
      document.body.appendChild(saveBar);
      document.getElementById('pkSaveBtn').addEventListener('click', saveAllPicks);
    }

    bindInteractions();
    bindHype();
    bindFotn();
    updateFotnBar();
    requestAnimationFrame(() => {
      initSpine();
      animateFightEntrance();
    });
  }

  // ── Bind hype drag bar ────────────────────────
  function bindHype() {
    const track = document.getElementById('pkHypeTrack');
    if (!track) return;

    function valFromX(clientX) {
      const rect = track.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.max(1, Math.min(5, Math.round(pct * 5)));
    }

    let dragging = false;

    track.addEventListener('mousedown', e => {
      dragging = true;
      track.classList.add('dragging');
      localHype = valFromX(e.clientX);
      updateHypeWidget();
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      localHype = valFromX(e.clientX);
      updateHypeWidget();
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('dragging');
      if (localHype) saveHype(localHype);
    });

    track.addEventListener('touchstart', e => {
      localHype = valFromX(e.touches[0].clientX);
      updateHypeWidget();
      e.preventDefault();
    }, { passive: false });

    track.addEventListener('touchmove', e => {
      localHype = valFromX(e.touches[0].clientX);
      updateHypeWidget();
      e.preventDefault();
    }, { passive: false });

    track.addEventListener('touchend', () => {
      if (localHype) saveHype(localHype);
    });
  }

  // ── Bind FOTN ─────────────────────────────────
  function bindFotn() {
    const btn = document.getElementById('pkFotnPickBtn');
    if (btn) btn.onclick = fotnPickMode ? exitFotnMode : enterFotnMode;

    root.querySelectorAll('.sb-fight[data-key]').forEach(card => {
      card.addEventListener('click', e => {
        if (!fotnPickMode) return;
        const key = card.dataset.key;
        const fd = getFightData(key);
        if (!fd) return;
        e.stopPropagation();
        showFotnConfirm(`${fd.a} vs ${fd.b}`);
      }, true);
    });
  }

  // ── Bind fighter/method/round clicks ──────────
  function bindInteractions() {
    if (!isCompleted && !isLocked) {
      // ── Fighter side click → pick ──
      root.querySelectorAll('.sb-side[data-key]').forEach(side => {
        const activate = () => {
          if (fotnPickMode) return;
          const key  = side.dataset.key;
          const pick = side.dataset.pick;
          const fight = root.querySelector(`.sb-fight[data-key="${key}"]`);
          if (!fight) return;
          if (!myId) { showToast('Sign in to save picks', 'err'); return; }

          const wasSelected = side.classList.contains('selected');
          fight.querySelectorAll('.sb-side').forEach(s => s.classList.remove('selected', 'dimmed'));

          if (!wasSelected) {
            side.classList.add('selected');
            fight.querySelectorAll('.sb-side').forEach(s => { if (s !== side) s.classList.add('dimmed'); });
            const cur = localPicks[key] || {};
            localPicks[key] = { pick, base: cur.base || '', round: cur.round || '' };
            sessionStorage.setItem(`pk_draft_${eventId}`, JSON.stringify(localPicks));
            const methodWrap = document.getElementById(`pkMethod-${key}`);
            if (methodWrap) methodWrap.classList.add('visible');
          } else {
            delete localPicks[key];
            sessionStorage.setItem(`pk_draft_${eventId}`, JSON.stringify(localPicks));
            const methodWrap = document.getElementById(`pkMethod-${key}`);
            if (methodWrap) methodWrap.classList.remove('visible');
            const strip = document.getElementById(`pkDrumStrip-${key}`);
            if (strip) { strip.style.transition = 'none'; strip.style.transform = 'translateY(0)'; }
            const roundRow = document.getElementById(`pkRounds-${key}`);
            if (roundRow) roundRow.classList.remove('pk-round-row-visible');
          }
          fight.classList.toggle('has-pick', !!localPicks[key]);
          updateSaveBar();
          updateSpine();
        };
        side.addEventListener('click', activate);
        side.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      });

      // ── Drum click ─────────────────────────────
      root.querySelectorAll('.pk-method-drum').forEach(drum => {
        drum.addEventListener('click', e => {
          e.stopPropagation();
          const key = drum.dataset.key;
          if (!localPicks[key]) { showToast('Pick a fighter first', 'err'); return; }
          const strip = document.getElementById(`pkDrumStrip-${key}`);
          const curIdx = DRUM_ITEMS.findIndex(d => d.method === (localPicks[key].base || ''));
          const nextIdx = (curIdx + 1) % DRUM_ITEMS.length;
          const newBase = DRUM_ITEMS[nextIdx].method;
          const newOffset = -(nextIdx * DRUM_H);
          drum.classList.add('blurring');
          strip.style.transition = `transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)`;
          strip.style.transform  = `translateY(${newOffset}px)`;
          setTimeout(() => drum.classList.remove('blurring'), 120);
          const showRound = newBase === 'KO/TKO' || newBase === 'SUB';
          const roundRow  = document.getElementById(`pkRounds-${key}`);
          if (roundRow) roundRow.classList.toggle('pk-round-row-visible', showRound);
          localPicks[key] = { ...localPicks[key], base: newBase, round: showRound ? (localPicks[key].round || '') : '' };
          updateSaveBar();
        });
      });

      root.querySelectorAll('.pk-round-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const key   = btn.dataset.key;
          const round = btn.dataset.round;
          const fight = root.querySelector(`.sb-fight[data-key="${key}"]`);
          if (!fight) return;
          if (!localPicks[key]?.base) { showToast('Pick a method first', 'err'); return; }
          const alreadyActive = btn.classList.contains('active');
          const methodCls = localPicks[key].base === 'KO/TKO' ? 'ko' : 'sub';
          fight.querySelectorAll('.pk-round-btn').forEach(rb => rb.classList.remove('active', 'ko', 'sub'));
          if (!alreadyActive) btn.classList.add('active', methodCls);
          localPicks[key] = { ...localPicks[key], round: alreadyActive ? '' : round };
          updateSaveBar();
        });
      });
    }

    // ── Event switcher ────────────────────────────
    const switchBtn      = document.getElementById('pkSwitchBtn');
    const switchOverlay  = document.getElementById('pkSwitcherOverlay');
    const switchClose    = document.getElementById('pkSwitcherClose');
    const switchBackdrop = document.getElementById('pkSwitcherBackdrop');
    const switchList     = document.getElementById('pkSwitcherList');

    function openSwitcher() {
      const upcoming = eventsData
        .filter(e => e.status === 'upcoming' && e.id)
        .sort((a, b) => new Date(a.isoDate || 0) - new Date(b.isoDate || 0));
      if (!upcoming.length) {
        switchList.innerHTML = `<div class="pk-switcher-empty">No upcoming events found</div>`;
      } else {
        switchList.innerHTML = upcoming.map(e => {
          const isCurrent = e.id === eventId;
          const main = e.mainCard?.[0];
          const matchup = main ? `${main.a.split(' ').pop()} vs ${main.b.split(' ').pop()}` : '';
          const days = e.isoDate ? Math.ceil((new Date(e.isoDate) - new Date()) / 86400000) : null;
          const dayLabel = days === null ? '' : days <= 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `${days}d away`;
          return `
            <a class="pk-switcher-item${isCurrent ? ' current' : ''}" href="picks.html?id=${encodeURIComponent(e.id)}">
              ${e.poster ? `<img class="pk-switcher-thumb" src="${esc(e.poster)}" alt="" onerror="this.style.display='none'">` : `<div class="pk-switcher-thumb pk-switcher-thumb-empty"></div>`}
              <div class="pk-switcher-info">
                <div class="pk-switcher-name">${esc(e.name || '')}</div>
                <div class="pk-switcher-sub">${matchup ? esc(matchup) + (e.date ? ' · ' : '') : ''}${esc(e.date || '')}</div>
              </div>
              <div class="pk-switcher-right">
                ${dayLabel ? `<span class="pk-switcher-days${days <= 1 ? ' soon' : ''}">${dayLabel}</span>` : ''}
                ${isCurrent ? `<span class="pk-switcher-cur">Current</span>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`}
              </div>
            </a>`;
        }).join('');
      }
      switchOverlay.classList.add('open');
      switchOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
    }

    function closeSwitcher() {
      switchOverlay.classList.remove('open');
      switchOverlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
    }

    switchBtn?.addEventListener('click', openSwitcher);
    switchClose?.addEventListener('click', closeSwitcher);
    switchBackdrop?.addEventListener('click', closeSwitcher);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSwitcher(); });
  }

  function initSpine() {}
  function updateSpine() {}

  // ── Cascade entrance animation ────────────────
  function animateFightEntrance() {
    root.querySelectorAll('.sb-fight').forEach((card, i) => {
      card.style.clipPath = 'inset(0 100% 0 0)';
      card.style.transition = 'none';
      requestAnimationFrame(() => {
        setTimeout(() => {
          card.style.transition = `clip-path 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${i * 80}ms`;
          card.style.clipPath = 'inset(0 0% 0 0)';
        }, 30);
      });
    });
  }

  render();
  initPkCountdown();

  // ── Auth late-arrival ─────────────────────────
  if (sb && !isCompleted) {
    sb.auth.onAuthStateChange(async (ev, session) => {
      const uid = session?.user?.id;
      if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && uid && uid !== myId) {
        myId = uid;
        await Promise.all([loadPicks(), loadChallenge(), loadCommunityPicks()]);
        render();
        initPkCountdown();
      }
    });
  }

})();
