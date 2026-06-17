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

  // ── Pick tap sound (Web Audio, no file needed) ──
  let _ac;
  function playPickSound() {
    try {
      _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
      const osc = _ac.createOscillator(), gain = _ac.createGain();
      osc.connect(gain); gain.connect(_ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210, _ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(85, _ac.currentTime + 0.042);
      gain.gain.setValueAtTime(0.065, _ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + 0.055);
      osc.start(_ac.currentTime); osc.stop(_ac.currentTime + 0.06);
    } catch(e) {}
  }

  root.innerHTML = `
  <div class="pk-skeleton-wrap">
    <div class="pk-skel-hd">
      <div class="pk-skel pk-skel-eyebrow"></div>
      <div class="pk-skel pk-skel-title"></div>
      <div class="pk-skel pk-skel-meta"></div>
    </div>
    ${Array(5).fill(0).map(() => `
      <div class="pk-skel-card">
        <div class="pk-skel pk-skel-card-head"></div>
        <div class="pk-skel-matchup">
          <div class="pk-skel pk-skel-fighter"></div>
          <div class="pk-skel pk-skel-vs"></div>
          <div class="pk-skel pk-skel-fighter"></div>
        </div>
      </div>`).join('')}
  </div>`;

  const [eventsData, fightersData, user] = await Promise.all([
    fetch('./events.json?v=' + Date.now()).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json?v=' + Date.now()).then(r => r.ok ? r.json() : []).catch(() => []),
    getAuthUser(),
  ]);

  // Merge admin-entered fight results from Supabase into events data
  if (sb) {
    try {
      const { data: dbResults } = await sb.from('fight_results')
        .select('event_id, fight_key, winner, method, fotn');
      (dbResults || []).forEach(r => {
        const ev = eventsData.find(e => e.id === r.event_id);
        if (!ev) return;
        const sections = [
          { key: 'main',    fights: ev.mainCard     || [] },
          { key: 'prelims', fights: ev.prelims      || [] },
          { key: 'early',   fights: ev.earlyPrelims || [] },
        ];
        sections.forEach(({ key, fights }) => {
          fights.forEach((f, i) => {
            if (`${key}-${i}` === r.fight_key) {
              if (r.winner) f.winner = r.winner;
              if (r.method) f.method = r.method;
            }
          });
        });
        if (r.fight_key === '__fotn__' && r.fotn) ev.fotn = r.fotn;
      });
    } catch {}
  }

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

  // Auto-redirect to next upcoming event when no event specified
  if (!eventId) {
    const today = new Date().toISOString().slice(0, 10);
    const next = eventsData.find(e => e.status !== 'completed' && (e.isoDate || '') >= today)
                 || eventsData.find(e => e.status !== 'completed');
    if (next) { window.location.replace(`picks.html?id=${encodeURIComponent(next.id)}`); return; }
    root.innerHTML = `<div class="pk-error">No upcoming events. <a href="events.html" style="color:#00e5ff;text-decoration:none;">Browse events →</a></div>`;
    return;
  }

  const event = eventsData.find(e => e.id === eventId || slugify(e.name || '') === eventId);
  if (!event) { root.innerHTML = `<div class="pk-error">Event not found. <a href="events.html" style="color:#00e5ff;text-decoration:none;">Browse events →</a></div>`; return; }

  // Dynamic page title + OG image
  if (event.name) {
    document.title = `${event.name} — Picks | MMA Bridge`;
    const ogT = document.querySelector('meta[property="og:title"]');
    if (ogT) ogT.content = `${event.name} — Picks | MMA Bridge`;
  }
  if (event.poster) {
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg) ogImg.content = event.poster;
    const twImg = document.querySelector('meta[name="twitter:image"]');
    if (twImg) twImg.content = event.poster;
  }

  const isCompleted = event.status === 'completed';
  const isLocked = !isCompleted && !!event.start_time && new Date() >= new Date(event.start_time);
  let myId = user?.id || null;

  /* Live polling — auto-start on fight night */
  if (!isCompleted && event.isoDate && window.MMALive) {
    const today = new Date().toISOString().slice(0, 10);
    if (event.isoDate === today) window.MMALive.start(event.isoDate);
  }

  // ── State ─────────────────────────────────────
  let myPicks    = {};   // confirmed DB state
  let localPicks = {};   // pending local state (includes 'fotn' key)
  let hypeAvg    = 0;
  let hypeCount  = 0;
  let localHype  = parseInt(localStorage.getItem(`hype_${eventId}`) || '0', 10);
  let careerCorrect = 0;
  let careerJudged  = 0;
  let fotnPickMode  = false;  // cursor-mode FOTN selection active
  let fotnCursorEl  = null;
  let followFeedData = {};

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
    const isDD = myPicks['__dd__']?.pick === fightKey;
    if (!p || !fightData?.winner) return { pts: 0, breakdown: [], isDD };
    const correct = (p.pick || '').toLowerCase() === fightData.winner.toLowerCase();
    if (!correct) {
      if (isDD) return { pts: -10, breakdown: ['-10 double down miss'], isDD };
      return { pts: 0, breakdown: [], isDD };
    }
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
    if (isDD) { pts *= 2; breakdown.push('×2 double down'); }
    return { pts, breakdown, isDD };
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

  // ── New results notification ──────────────────
  // Show a banner the first time a user sees results for an event they picked
  if (isCompleted && myId) {
    const seenKey = `pk_seen_results_${eventId}`;
    const hasSeen = localStorage.getItem(seenKey);
    const myJudgedPicks = Object.entries(myPicks).filter(([k]) => k !== 'fotn' && k !== '__dd__');
    if (!hasSeen && myJudgedPicks.length > 0) {
      localStorage.setItem(seenKey, '1');
      // Banner injected after render()
      setTimeout(() => {
        const { correct, total } = computeScore ? computeScore() : { correct: 0, total: 0 };
        if (total > 0) {
          const pct = Math.round((correct / total) * 100);
          const verdict = pct >= 70 ? 'Sharp.' : pct >= 50 ? 'Solid.' : 'Keep grinding.';
          showToast(`Results in — ${correct}/${total} correct (${pct}%). ${verdict}`, 'ok');
          if (pct >= 50 && correct >= 2 && typeof confetti === 'function') {
            setTimeout(() => confetti({
              particleCount: Math.min(correct * 25, 180),
              spread: 80,
              origin: { y: 0.55 },
              colors: ['#00e5ff', '#c8a84b', '#ffffff', '#00ff88', '#a78bfa'],
              disableForReducedMotion: true
            }), 400);
          }
        }
      }, 800);
    }
  }

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
    localStorage.setItem(`hype_${eventId}`, String(val));
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
  let groupPicks = {};     // same shape but only group members
  let myGroupCode = null;
  let groupMemberIds = new Set();
  let groupMembers = [];        // [{ id, display_name }]
  let groupMembersWhoPickedIds = new Set(); // members who submitted ≥1 pick this event

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

  async function loadGroupContext() {
    if (!myId || !sb) return;
    try {
      const { data: prof } = await sb.from('profiles').select('group_code').eq('id', myId).single();
      myGroupCode = prof?.group_code || null;
      if (!myGroupCode) return;
      const { data: members } = await sb.from('profiles').select('id, display_name').eq('group_code', myGroupCode);
      groupMembers = members || [];
      groupMemberIds = new Set(groupMembers.map(m => m.id));
      if (!groupMemberIds.size) return;
      const { data: gpicks } = await sb.from('picks')
        .select('user_id, fight_key, pick')
        .eq('event_id', eventId)
        .in('user_id', [...groupMemberIds])
        .neq('fight_key', 'fotn')
        .neq('fight_key', '__dd__');
      groupPicks = {};
      groupMembersWhoPickedIds = new Set();
      (gpicks || []).forEach(p => {
        groupMembersWhoPickedIds.add(p.user_id);
        if (!groupPicks[p.fight_key]) groupPicks[p.fight_key] = {};
        groupPicks[p.fight_key][p.pick] = (groupPicks[p.fight_key][p.pick] || 0) + 1;
      });
    } catch {}
  }

  // ── Next upcoming event ────────────────────────
  let nextEventData = null;

  async function prefetchNextEvent() {
    if (!isCompleted) return;
    try {
      const all  = await fetch('./events.json?v=' + Date.now()).then(r => r.json());
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

  await Promise.all([loadChallenge(), loadEventExtras(), loadCommunityPicks(), loadGroupContext(), prefetchNextEvent(), loadCareerStats(), loadOdds(eventId)]);
  loadFollowFeed();

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

  // Count real picks (exclude fotn and __dd__ keys)
  function pickCount() { return Object.keys(localPicks).filter(k => k !== 'fotn' && k !== '__dd__').length; }
  function savedPickCount() { return Object.keys(myPicks).filter(k => k !== 'fotn' && k !== '__dd__').length; }

  // ── Unsaved changes? ──────────────────────────
  function hasUnsavedChanges() {
    const lKeys = Object.keys(localPicks);
    const mKeys = Object.keys(myPicks);
    if (lKeys.length !== mKeys.length) return true;
    for (const k of lKeys) {
      const l = localPicks[k], m = myPicks[k];
      if (!m || l.pick !== m.pick || (l.base||'') !== (m.base||'')) return true;
    }
    return false;
  }

  // ── Bulk save all picks to DB ─────────────────
  async function saveAllPicks() {
    if (!myId || !sb) { showToast('Sign in to save picks', 'err'); return; }
    const btn = document.getElementById('pkSaveBtn');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Saving…'; }
    try {
      const toDelete = Object.keys(myPicks).filter(k => !localPicks[k]);
      if (toDelete.length > 0) {
        await sb.from('picks').delete()
          .eq('user_id', myId).eq('event_id', eventId)
          .in('fight_key', toDelete);
      }
      const toSave = Object.entries(localPicks).map(([fightKey, p]) => ({
        user_id: myId, event_id: eventId,
        fight_key: fightKey,
        pick: p.pick,
        method: combineMethod(p.base, p.round) || null,
      }));
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
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  // ── Save bar ──────────────────────────────────
  function updateSaveBar() {
    const picked = pickCount();
    const bar = document.getElementById('pkSaveBar');
    if (!bar) return;
    const btn  = bar.querySelector('.pk-save-btn');
    const dirty = hasUnsavedChanges();
    if (btn) {
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
    // Show Share Your Picks button as soon as all main card picks are selected (localPicks)
    const mainCount = (event.mainCard || []).length;
    const localMainCount = (event.mainCard || []).map((_, i) => localPicks[`main-${i}`]).filter(Boolean).length;
    let shareBtn = bar.querySelector('.pk-share-picks-btn');
    if (localMainCount >= mainCount && mainCount > 0) {
      if (!shareBtn) {
        shareBtn = document.createElement('button');
        shareBtn.className = 'pk-share-picks-btn';
        shareBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share Your Picks`;
        shareBtn.type = 'button';
        shareBtn.addEventListener('click', shareMyPicks);
        bar.appendChild(shareBtn);
      }
    } else if (shareBtn) {
      shareBtn.remove();
    }
  }

  function shareMyPicks() {
    const canvas = buildMyPicksCanvas();
    const url  = `https://mmabridge.com/picks.html?id=${eventId}`;
    const text = `My picks for ${event.name || 'UFC'} 🥊\nCan you beat me?\n${url}`;
    canvas.toBlob(blob => {
      const file = new File([blob], 'my-picks.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ title: `My Picks — ${event.name}`, text, files: [file] }).catch(() => {
          showShareModal(canvas.toDataURL(), text, url);
        });
      } else {
        showShareModal(canvas.toDataURL(), text, url);
      }
    }, 'image/png');
  }

  function buildMyPicksCanvas() {
    const mainCard = event.mainCard || [];
    const W = 700;
    const headerH = 88, footerH = 52, rowH = 72;
    const H = headerH + mainCard.length * rowH + footerH;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }

    // Gold top bar
    const bar = ctx.createLinearGradient(0,0,W,0);
    bar.addColorStop(0,'#c8960c'); bar.addColorStop(1,'rgba(200,150,12,0.15)');
    ctx.fillStyle = bar; ctx.fillRect(0,0,W,4);

    // Header
    ctx.font = '900 12px sans-serif'; ctx.fillStyle = 'rgba(200,150,12,0.55)';
    ctx.letterSpacing = '3px'; ctx.textBaseline = 'top';
    ctx.fillText('MMA BRIDGE', 40, 22); ctx.letterSpacing = '0px';
    ctx.font = '900 26px sans-serif'; ctx.fillStyle = '#fff';
    const evShort = (event.name || '').length > 38 ? (event.name||'').slice(0,36)+'…' : (event.name || '');
    ctx.fillText('MY PICKS — ' + evShort.toUpperCase(), 40, 48);

    mainCard.forEach((fight, i) => {
      const p = localPicks[`main-${i}`] || myPicks[`main-${i}`];
      const y = headerH + i * rowH;
      const isMain = i === 0;

      // Alternating row bg
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent';
      ctx.fillRect(0, y, W, rowH);

      const midY = y + rowH / 2;

      // Tick
      ctx.font = `bold ${isMain ? 20 : 16}px sans-serif`;
      ctx.fillStyle = p ? '#c8960c' : 'rgba(255,255,255,0.12)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(p ? '✓' : '·', 28, midY);

      if (p) {
        // Picked fighter name
        const pickedName = p.pick || '';
        const lastName = pickedName.split(' ').pop();
        ctx.font = `900 ${isMain ? 28 : 22}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(lastName.toUpperCase(), 56, midY - 8);

        // "vs other"
        const other = (pickedName === fight.a ? fight.b : fight.a).split(' ').pop();
        ctx.font = '500 13px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillText(`vs ${other}`, 56, midY + 14);

        // Method + Round (right side)
        if (p.method) {
          ctx.textAlign = 'right';
          ctx.font = `bold ${isMain ? 20 : 16}px sans-serif`;
          ctx.fillStyle = '#c8960c';
          ctx.fillText(p.method, W - 36, midY - 6);
          ctx.font = '500 11px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText(fight.weight || '', W - 36, midY + 12);
          ctx.textAlign = 'left';
        } else {
          ctx.textAlign = 'right';
          ctx.font = '500 11px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText(fight.weight || '', W - 36, midY + 4);
          ctx.textAlign = 'left';
        }
      } else {
        // No pick
        ctx.font = '500 14px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillText(`${fight.a.split(' ').pop()} vs ${fight.b.split(' ').pop()}`, 56, midY);
        ctx.textAlign = 'right';
        ctx.fillText('no pick', W - 36, midY);
        ctx.textAlign = 'left';
      }

      // Row divider
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y + rowH - 1, W, 1);
    });

    // Footer
    ctx.font = '700 13px sans-serif'; ctx.fillStyle = 'rgba(200,150,12,0.5)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('mmabridge.com', W/2, H - footerH/2);

    return c;
  }

  // ── Update hype widget ────────────────────────
  const HYPE_LABELS = ['', 'MEH', 'SLEEPER', 'LOW KEY', 'BUILDING', 'DECENT', 'SOLID', 'HYPED', 'VERY HYPED', 'ELITE', 'MUST-SEE'];

  function updateHypeWidget() {
    const pct = localHype ? ((localHype - 1) / 9) * 100 : 0;
    const fill     = document.getElementById('pkHypeFill');
    const thumb    = document.getElementById('pkHypeThumb');
    const labelEl  = document.getElementById('pkHypeLabel');
    const avgBadge = document.getElementById('pkHypeAvgBadge');
    const hdBadge  = document.getElementById('pkHdHypeBadge');

    if (fill)  fill.style.width = pct + '%';
    if (thumb) { thumb.style.left = pct + '%'; thumb.style.display = pct > 0 ? 'block' : 'none'; }
    if (labelEl) {
      labelEl.textContent = localHype ? (HYPE_LABELS[localHype] || '') : 'Rate this event';
    }
    if (avgBadge) {
      avgBadge.style.opacity = hypeCount > 0 ? '1' : '0';
      if (hypeCount > 0) avgBadge.innerHTML = `${hypeAvg.toFixed(1)}<span class="pk-hype-denom">/10</span>`;
    }
    if (hdBadge) {
      if (hypeCount > 0) {
        hdBadge.style.display = '';
        hdBadge.innerHTML = `
          <div class="pk-hdb-num">${hypeAvg.toFixed(1)}<span class="pk-hdb-denom">/10</span></div>
          <div class="pk-hdb-label">Community Hype</div>
          <div class="pk-hdb-count">${hypeCount} rating${hypeCount !== 1 ? 's' : ''}</div>`;
      } else {
        hdBadge.style.display = 'none';
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
          <div class="pk-fotn-bar-badge">FOTN <button class="pk-info-btn pk-info-btn-sm pk-info-btn-dark" data-info="fotn" type="button" aria-label="What is FOTN?">?</button></div>
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

  // ── Build one fight card (prediction slip design) ─
  function buildFight(f, sectionKey, idx, isMain, isMainCard) {
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
    const showComm  = commTotal > 0 && (isCompleted || isLocked || hasPick);
    const isDD      = (isCompleted ? myPicks['__dd__']?.pick : localPicks['__dd__']?.pick) === key;
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
    const recA  = fighterRecord(f.a);
    const recB  = fighterRecord(f.b);

    // Card-level classes
    const cardCls = ['sb-fight fc-card',
      isMain ? 'fc-main' : isMainCard ? 'fc-maincrd' : '',
      hasPick ? 'has-pick' : '',
      isDD ? 'pk-dd-card' : '',
      isCompleted ? 'is-completed' : '',
      isMain ? 'is-main' : isMainCard ? 'is-main-card' : '',
    ].filter(Boolean).join(' ');

    // Fighter side A classes
    const sideACls = ['sb-side sb-side-a fc-fighter',
      pickedA ? 'selected' : '',
      pickedB ? 'fc-other' : '',
      resultA ? `result-${resultA}` : '',
    ].filter(Boolean).join(' ');

    // Fighter side B classes
    const sideBCls = ['sb-side sb-side-b fc-fighter fc-fighter-b',
      pickedB ? 'selected' : '',
      pickedA ? 'fc-other' : '',
      resultB ? `result-${resultB}` : '',
    ].filter(Boolean).join(' ');

    // Photos — fc-photo wrapper with img + sil fallback
    const photoA = `<div class="fc-photo">${
      f.imgA
        ? `<img src="${esc(f.imgA)}" alt="${esc(f.a)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="fc-sil" style="display:none">${SILHOUETTE}</div>`
        : `<div class="fc-sil">${SILHOUETTE}</div>`
    }</div>`;
    const photoB = `<div class="fc-photo">${
      f.imgB
        ? `<img src="${esc(f.imgB)}" alt="${esc(f.b)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="fc-sil" style="display:none">${SILHOUETTE}</div>`
        : `<div class="fc-sil">${SILHOUETTE}</div>`
    }</div>`;

    // Odds tags
    let oddsTagA = '', oddsTagB = '';
    if (odds) {
      const aFav = odds.odds_a < odds.odds_b;
      oddsTagA = `<span class="fc-odds${aFav ? ' fc-fav' : ' fc-dog'}">${formatOdds(odds.odds_a)}</span>`;
      oddsTagB = `<span class="fc-odds${!aFav ? ' fc-fav' : ' fc-dog'}">${formatOdds(odds.odds_b)}</span>`;
    }

    // Badges
    const ddTag = isDD ? ' <span class="pk-dd-badge-tag">⚡×2</span>' : '';
    const winShareBtn = (winner, loser, pts, commPct) =>
      `<button class="fc-win-share" data-winner="${esc(winner)}" data-loser="${esc(loser)}" data-pts="${pts}" data-comm="${commPct ?? ''}" data-event="${esc(event?.name || '')}" title="Share your win">🎉 Share</button>`;
    const badgeA = correctA
      ? `<div class="fc-badge fc-badge-correct">✓ +${ptsA}pts${isDD ? ' ⚡' : ''}${winShareBtn(f.a, f.b, ptsA, commPctA)}</div>`
      : (isCompleted && pickedA ? `<div class="fc-badge fc-badge-wrong">✗ ${ptsA < 0 ? ptsA + 'pts ⚡' : '0pts'}</div>` : '')
      + (!isCompleted && pickedA ? `<div class="fc-badge fc-badge-pick${isSavedA ? '' : ' unsaved'}">${isSavedA ? 'YOUR PICK ✓' : 'YOUR PICK •'}${ddTag}</div>` : '');
    const badgeB = correctB
      ? `<div class="fc-badge fc-badge-correct">✓ +${ptsB}pts${isDD ? ' ⚡' : ''}${winShareBtn(f.b, f.a, ptsB, commPctB)}</div>`
      : (isCompleted && pickedB ? `<div class="fc-badge fc-badge-wrong">✗ ${ptsB < 0 ? ptsB + 'pts ⚡' : '0pts'}</div>` : '')
      + (!isCompleted && pickedB ? `<div class="fc-badge fc-badge-pick${isSavedB ? '' : ' unsaved'}">${isSavedB ? 'YOUR PICK ✓' : 'YOUR PICK •'}${ddTag}</div>` : '');

    // Opponent badges
    const oppBadgeA = oppPickedA ? `<div class="fc-opp">${esc(oppName)}'s pick</div>` : '';
    const oppBadgeB = oppPickedB ? `<div class="fc-opp">${esc(oppName)}'s pick</div>` : '';

    // Head strip — weight, rounds, title pip, card label
    const cardLblTxt = isMain ? 'MAIN EVENT' : (isMainCard && idx === 0 ? 'CO-MAIN' : '');
    const headHtml = `
      <div class="fc-head">
        <div class="fc-head-left">
          ${f.weight ? `<span class="fc-weight">${esc(f.weight)}</span>` : ''}
          ${f.rounds ? `<span class="fc-rds">· ${esc(f.rounds)}</span>` : ''}
          ${f.titleFight ? `<span class="fc-title-pip">TITLE FIGHT</span>` : ''}
        </div>
        ${cardLblTxt ? `<span class="fc-card-lbl">${cardLblTxt}</span>` : ''}
      </div>`;

    // VS center column — just VS + result method, comm % moved to fighter sides
    let vsColHtml = `<span class="fc-vs">VS</span>`;
    if (isCompleted && winner) {
      let methodStr = f.method ? f.method.toUpperCase() : '';
      if (methodStr === 'KO' || methodStr === 'TKO' || methodStr.startsWith('KO ') || methodStr.startsWith('TKO')) methodStr = 'KO/TKO';
      const roundStr = f.round ? ` · R${f.round}` : '';
      vsColHtml += `<div class="fc-result-verdict"><span class="fc-result-method-big">${esc(methodStr)}${esc(roundStr)}</span></div>`;
    }

    // Community % labels for each side
    const commLabelA = (showComm && commPctA !== null)
      ? `<div class="fc-comm-pct${commPctA >= 50 ? ' fc-comm-majority' : ''}"><span class="fc-comm-lbl">COMMUNITY</span><span class="fc-comm-num">${commPctA}%</span><span class="fc-comm-sub">picked this</span></div>` : '';
    const commLabelB = (showComm && commPctB !== null)
      ? `<div class="fc-comm-pct${commPctB >= 50 ? ' fc-comm-majority' : ''}"><span class="fc-comm-lbl">COMMUNITY</span><span class="fc-comm-num">${commPctB}%</span><span class="fc-comm-sub">picked this</span></div>` : '';

    // Group pick count labels (show when user has a group)
    const gComm = groupPicks[key] || {};
    const gCountA = gComm[f.a] || 0;
    const gCountB = gComm[f.b] || 0;
    const gSize = groupMemberIds.size;
    const showGroup = gSize > 0 && (gCountA > 0 || gCountB > 0);
    const groupLabelA = showGroup ? `<div class="fc-group-breakdown"><span class="fc-group-bd-num">${gCountA}/${gSize}</span><span class="fc-group-bd-txt">in group</span></div>` : '';
    const groupLabelB = showGroup ? `<div class="fc-group-breakdown"><span class="fc-group-bd-num">${gCountB}/${gSize}</span><span class="fc-group-bd-txt">in group</span></div>` : '';

    // Method row (slides in when picked) — keep sb-method-wrap + add fc-method-row
    const methodWrap = !isCompleted ? `
      <div class="sb-method-wrap fc-method-row${hasPick ? ' visible' : ''}" id="pkMethod-${esc(key)}">
        <div class="pk-seg-row">
          <button class="pk-seg-btn pk-seg-ko${savedBase === 'KO/TKO' ? ' active' : ''}" data-key="${esc(key)}" data-method="KO/TKO" type="button">KO / TKO</button>
          <button class="pk-seg-btn pk-seg-sub${savedBase === 'SUB' ? ' active' : ''}" data-key="${esc(key)}" data-method="SUB" type="button">Submission</button>
          <button class="pk-seg-btn pk-seg-dec${savedBase === 'DEC' ? ' active' : ''}" data-key="${esc(key)}" data-method="DEC" type="button">Decision</button>
        </div>
        <div class="pk-round-row${needsRound ? ' pk-round-row-visible' : ''}" id="pkRounds-${esc(key)}">
          <span class="pk-round-label">Rd</span>
          ${roundBtns}
        </div>
      </div>` : '';

    const ddBtnHtml = (!isCompleted && !isLocked) ? `
      <div class="pk-dd-wrap">
        <button class="pk-dd-btn${isDD ? ' pk-dd-active' : ''}" data-key="${esc(key)}" type="button">
          <svg class="pk-dd-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span class="pk-dd-label">${isDD ? 'UNDO DOUBLE DOWN' : 'DOUBLE DOWN'}</span>
          <span class="pk-dd-mult">×2</span>
        </button>
        <button class="pk-info-btn" data-info="dd" type="button" aria-label="What is Double Down?">?</button>
      </div>` : '';

    const aFav = odds && odds.odds_a < odds.odds_b;
    const extOddsA = odds ? `<div class="fc-odds-col fc-odds-col-a">
      <span class="fc-odds-num${aFav ? ' fc-fav' : ' fc-dog'}">${formatOdds(odds.odds_a)}</span>
    </div>` : '';
    const extOddsB = odds ? `<div class="fc-odds-col fc-odds-col-b">
      <span class="fc-odds-num${!aFav ? ' fc-fav' : ' fc-dog'}">${formatOdds(odds.odds_b)}</span>
    </div>` : '';

    return `
      <div class="${cardCls}" data-key="${esc(key)}">
        ${headHtml}
        <div class="fc-matchup${odds ? ' fc-matchup-odds' : ''}">
          ${extOddsA}
          <div class="${sideACls}" data-key="${esc(key)}" data-pick="${esc(f.a)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            ${photoA}
            <div class="fc-info">
              <div class="fc-name">${esc(f.a)}</div>
              ${recA ? `<div class="fc-sub-row"><span class="fc-record">${esc(recA)}</span></div>` : ''}
              ${commLabelA}
              ${groupLabelA}
              ${badgeA}
              ${oppBadgeA}
            </div>
          </div>
          <div class="fc-vs-col">
            ${vsColHtml}
          </div>
          <div class="${sideBCls}" data-key="${esc(key)}" data-pick="${esc(f.b)}" data-fa="${esc(f.a)}" data-fb="${esc(f.b)}" role="button" tabindex="0">
            <div class="fc-info fc-info-b">
              <div class="fc-name">${esc(f.b)}</div>
              ${recB ? `<div class="fc-sub-row fc-sub-row-b"><span class="fc-record">${esc(recB)}</span></div>` : ''}
              ${commLabelB}
              ${groupLabelB}
              ${badgeB}
              ${oppBadgeB}
            </div>
            ${photoB}
          </div>
          ${extOddsB}
        </div>
        ${methodWrap}
        ${ddBtnHtml}
        ${buildCommentSection(key)}
      </div>`;
  }

  function buildSection(title, fights, sectionKey, isMainCard) {
    if (!fights || !fights.length) return '';
    const cards = fights.map((f, i) => buildFight(f, sectionKey, i, isMainCard && i === 0, isMainCard)).join('');
    return `
      <div class="fc-section">
        <div class="fc-section-lbl">${esc(title)}</div>
        ${cards}
      </div>`;
  }

  // ── Per-fight comment section ─────────────────
  function buildCommentSection(fightKey) {
    return `
      <div class="pk-comments-wrap" id="pkComments-${esc(fightKey)}">
        <button class="pk-comments-toggle" data-key="${esc(fightKey)}" data-open="0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="pk-comments-count" data-key="${esc(fightKey)}">Comments</span>
        </button>
        <div class="pk-comments-body" id="pkCommentsBody-${esc(fightKey)}" style="display:none">
          <div class="pk-comments-list" id="pkCommentsList-${esc(fightKey)}"></div>
          <div class="pk-comment-form" id="pkCommentForm-${esc(fightKey)}">
            <textarea class="pk-comment-input" placeholder="Add a comment…" maxlength="500" rows="2"></textarea>
            <button class="pk-comment-submit" data-key="${esc(fightKey)}">Post</button>
          </div>
        </div>
      </div>`;
  }

  function getAllFightKeys() {
    const keys = [];
    ['mainCard', 'prelims', 'earlyPrelims'].forEach(sec => {
      const sKey = sec === 'mainCard' ? 'main' : sec === 'prelims' ? 'prelims' : 'early';
      (event[sec] || []).forEach((_, i) => keys.push(`${sKey}-${i}`));
    });
    return keys;
  }

  function pkTimeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function loadComments(fightKey) {
    const listEl = document.getElementById(`pkCommentsList-${fightKey}`);
    if (!listEl || !sb) return;

    listEl.innerHTML = '<div class="pk-comments-loading">Loading…</div>';

    try {
      const { data } = await sb.from('fight_comments')
        .select('id, content, created_at, profiles!user_id(display_name, avatar_url)')
        .eq('event_id', eventId)
        .eq('fight_key', fightKey)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!data?.length) {
        listEl.innerHTML = '<div class="pk-comments-empty">No comments yet. Be first!</div>';
        return;
      }

      listEl.innerHTML = data.map(c => {
        const name = esc(c.profiles?.display_name || 'Fan');
        const initials = name.slice(0, 2).toUpperCase();
        const timeStr = pkTimeAgo(c.created_at);
        return `
          <div class="pk-comment">
            <div class="pk-comment-avatar">${c.profiles?.avatar_url ? `<img src="${esc(c.profiles.avatar_url)}" onerror="this.style.display='none'">` : initials}</div>
            <div class="pk-comment-body">
              <div class="pk-comment-header">
                <span class="pk-comment-name">${name}</span>
                <span class="pk-comment-time">${timeStr}</span>
              </div>
              <div class="pk-comment-text">${esc(c.content)}</div>
            </div>
          </div>`;
      }).join('');
    } catch { listEl.innerHTML = '<div class="pk-comments-empty">Could not load comments.</div>'; }
  }

  // Called once after render — pre-loads counts, wires toggle + submit
  let _commentsSetup = false;
  async function setupComments() {
    if (_commentsSetup) return;
    _commentsSetup = true;
    if (!sb) return;

    const allFightKeys = getAllFightKeys();
    if (!allFightKeys.length) return;

    // Pre-load comment counts
    try {
      const { data: countRows } = await sb.from('fight_comments')
        .select('fight_key')
        .eq('event_id', eventId)
        .in('fight_key', allFightKeys);

      const counts = {};
      (countRows || []).forEach(r => { counts[r.fight_key] = (counts[r.fight_key] || 0) + 1; });

      allFightKeys.forEach(key => {
        const countEl = document.querySelector(`.pk-comments-count[data-key="${key}"]`);
        if (countEl) {
          const n = counts[key] || 0;
          countEl.textContent = n > 0 ? `${n} Comment${n !== 1 ? 's' : ''}` : 'Comments';
        }
      });
    } catch {}

    // Toggle handler (event delegation)
    document.addEventListener('click', async e => {
      const winShare = e.target.closest('.fc-win-share');
      if (winShare) {
        e.stopPropagation();
        const { winner, loser, pts, comm, event: evName } = winShare.dataset;
        showWinCard(winner, loser, pts, comm, evName);
        return;
      }

      const toggleBtn = e.target.closest('.pk-comments-toggle');
      if (toggleBtn) {
        e.stopPropagation();
        const key = toggleBtn.dataset.key;
        const body = document.getElementById(`pkCommentsBody-${key}`);
        const isOpen = toggleBtn.dataset.open === '1';
        if (!isOpen) {
          toggleBtn.dataset.open = '1';
          body.style.display = 'block';
          await loadComments(key);
        } else {
          toggleBtn.dataset.open = '0';
          body.style.display = 'none';
        }
        return;
      }

      const submitBtn = e.target.closest('.pk-comment-submit');
      if (submitBtn) {
        const key = submitBtn.dataset.key;
        const form = document.getElementById(`pkCommentForm-${key}`);
        const input = form?.querySelector('.pk-comment-input');
        const content = input?.value.trim();
        if (!content) return;

        const { data: { session } } = await sb.auth.getSession();
        if (!session?.user) { alert('Sign in to comment'); return; }

        submitBtn.disabled = true;
        try {
          await sb.from('fight_comments').insert({
            event_id: eventId, fight_key: key,
            user_id: session.user.id, content,
          });
          input.value = '';
          await loadComments(key);
          // Update count label
          const countEl = document.querySelector(`.pk-comments-count[data-key="${key}"]`);
          if (countEl) {
            const listEl = document.getElementById(`pkCommentsList-${key}`);
            const n = listEl?.querySelectorAll('.pk-comment').length || 0;
            countEl.textContent = `${n} Comment${n !== 1 ? 's' : ''}`;
          }
        } catch(err) { console.error(err); }
        submitBtn.disabled = false;
      }
    });
  }

  function careerBadgeHtml() { return ''; }

  // ── Who's Picked tracker ─────────────────────
  function whoPickedHtml() {
    if (!myGroupCode || groupMembers.length < 2 || isCompleted) return '';
    const hasPicked  = groupMembers.filter(m => groupMembersWhoPickedIds.has(m.id));
    const notPicked  = groupMembers.filter(m => !groupMembersWhoPickedIds.has(m.id));
    const iLocked = isLocked;
    const pickedRows = hasPicked.map(m => {
      const isMe = m.id === myId;
      return `<span class="pk-wp-pip pk-wp-done" title="${esc(m.display_name||'User')}">${esc((m.display_name||'?').slice(0,2).toUpperCase())}${isMe?'<span class="pk-wp-you">you</span>':''}</span>`;
    }).join('');
    const notRows = notPicked.map(m => {
      const isMe = m.id === myId;
      return `<span class="pk-wp-pip pk-wp-pending" title="${esc(m.display_name||'User')}">${esc((m.display_name||'?').slice(0,2).toUpperCase())}${isMe?'<span class="pk-wp-you">you</span>':''}</span>`;
    }).join('');
    const label = iLocked
      ? `${hasPicked.length}/${groupMembers.length} picked before lock`
      : notPicked.length === 0
        ? `Everyone in the group has picked 🎉`
        : `${notPicked.length} still need${notPicked.length===1?'s':''} to pick`;
    return `
      <div class="pk-who-picked">
        <div class="pk-wp-label">${label}</div>
        <div class="pk-wp-pips">${pickedRows}${notRows}</div>
      </div>`;
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
        ${fotnPts > 0 ? `<div class="pk-score-hero-fotn-bonus">+${fotnPts} FOTN Bonus</div>` : ''}
        ${careerPct !== null ? `<div class="pk-score-hero-career">All-time: ${careerCorrect}/${careerJudged} picks · ${careerPct}%</div>` : ''}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center">
          <button class="pk-share-hero-btn" id="pkShareHeroBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share Result
          </button>
        </div>
      </div>`;
  }

  function initReplayBtn() { /* removed */ }

  // ── Share picks card ──────────────────────────────────────────────
  function initShareBtn() {
    document.getElementById('pkShareHeroBtn')?.addEventListener('click', () => {
      const { correct, total, totalPts, fotnPts } = computeScore();
      const pct = Math.round((correct / total) * 100);
      const verdict = pct >= 70 ? 'Sharp' : pct >= 50 ? 'Solid' : 'Rough Night';
      const evName = event.name || 'UFC Event';
      const evId   = event.id || eventId;
      triggerShare(evName, correct, total, pct, verdict, totalPts, evId);
    });
  }

  function initConsensusBtn() {
    const btn = document.getElementById('pkConsensusBtn');
    if (!btn) return;
    const hasComm = Object.keys(communityPicks).length > 0;
    if (hasComm) btn.style.display = '';
    btn.addEventListener('click', () => {
      const canvas = buildConsensusCanvas(event.name || '', event.mainCard || [], communityPicks);
      const url = `https://mmabridge.com/picks.html?id=${eventId}`;
      const text = `Community picks for ${event.name || 'UFC'} — see how MMA Bridge fans voted 👇\n${url}`;
      canvas.toBlob(blob => {
        const file = new File([blob], 'community-picks.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          navigator.share({ title: `Community Picks — ${event.name}`, text, files: [file] }).catch(() => {
            showShareModal(canvas.toDataURL(), text, url);
          });
        } else {
          showShareModal(canvas.toDataURL(), text, url);
        }
      }, 'image/png');
    });
  }

  function buildConsensusCanvas(evName, mainCard, picks) {
    const W = 700, rowH = 68, headerH = 80, footerH = 48;
    const fights = mainCard.slice(0, 8);
    const H = headerH + fights.length * rowH + footerH;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }

    // Gold top bar
    const bar = ctx.createLinearGradient(0,0,W,0);
    bar.addColorStop(0,'#c8960c'); bar.addColorStop(1,'rgba(200,150,12,0.15)');
    ctx.fillStyle = bar; ctx.fillRect(0,0,W,4);

    // Header
    ctx.font = '900 13px sans-serif'; ctx.fillStyle = 'rgba(200,150,12,0.55)';
    ctx.letterSpacing = '3px'; ctx.fillText('MMA BRIDGE', 40, 30); ctx.letterSpacing = '0px';
    ctx.font = '900 22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const short = evName.length > 36 ? evName.slice(0,34)+'…' : evName;
    ctx.fillText('COMMUNITY PICKS — ' + short.toUpperCase(), 40, 62);

    let totalPickRows = 0;

    fights.forEach((fight, i) => {
      const y = headerH + i * rowH;
      const fKey = `main-${i}`;
      const comm = picks[fKey] || {};
      const countA = comm[fight.a] || 0;
      const countB = comm[fight.b] || 0;
      const total2 = countA + countB || 1;
      const pctA = Math.round((countA / total2) * 100);
      const pctB = 100 - pctA;
      totalPickRows += countA + countB;

      // Row bg
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
      ctx.fillRect(0, y, W, rowH);

      const midY = y + rowH / 2;
      const barX = 200, barW = W - 400;

      // Fighter A name
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const nameA = fight.a.split(' ').pop();
      ctx.fillText(nameA.toUpperCase(), 28, midY - 8);
      // pct A
      ctx.font = `bold 18px sans-serif`;
      ctx.fillStyle = pctA >= 50 ? '#c8960c' : 'rgba(255,255,255,0.35)';
      ctx.fillText(`${pctA}%`, 28, midY + 12);

      // Fighter B name
      ctx.textAlign = 'right';
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff';
      const nameB = fight.b.split(' ').pop();
      ctx.fillText(nameB.toUpperCase(), W - 28, midY - 8);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = pctB >= 50 ? '#c8960c' : 'rgba(255,255,255,0.35)';
      ctx.fillText(`${pctB}%`, W - 28, midY + 12);

      // Progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(barX, midY - 5, barW, 10, 5); ctx.fill();
      if (pctA > 0) {
        const fillGrad = ctx.createLinearGradient(barX,0,barX+barW,0);
        fillGrad.addColorStop(0,'#c8960c'); fillGrad.addColorStop(1,'rgba(200,150,12,0.3)');
        ctx.fillStyle = fillGrad;
        ctx.beginPath(); ctx.roundRect(barX, midY - 5, (barW * pctA) / 100, 10, 5); ctx.fill();
      }
      // Divider
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y + rowH - 1, W, 1);
    });

    // Footer
    ctx.font = '13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${totalPickRows} picks recorded · mmabridge.com`, W/2, H - footerH/2);

    return c;
  }

  function triggerShare(evName, correct, total, pct, verdict, totalPts, evId) {
    const text   = `I went ${correct}/${total} on ${evName} (${pct}% · ${verdict})\nCan you beat me?`;
    const url    = `https://mmabridge.com/picks.html?id=${evId}`;
    try {
      const canvas = buildShareCanvas(evName, correct, total, pct, verdict, totalPts);
      canvas.toBlob(blob => {
        const file = new File([blob], 'mmabridge-picks.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          navigator.share({ title: `MMA Bridge — ${evName}`, text, files: [file] }).catch(() => {});
        } else {
          showShareModal(canvas.toDataURL(), text, url);
        }
      });
    } catch {
      if (navigator.share) navigator.share({ title: 'MMA Bridge', text, url }).catch(() => {});
      else showShareModal(null, text, url);
    }
  }

  function buildShareCanvas(evName, correct, total, pct, verdict, totalPts) {
    const W = 800, H = 420;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Background
    ctx.fillStyle = '#0a0a0d';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Gold top bar
    const bar = ctx.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, '#c8960c'); bar.addColorStop(1, 'rgba(200,150,12,0.2)');
    ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 4);

    // Brand label
    ctx.font = '800 12px sans-serif';
    ctx.fillStyle = 'rgba(200,150,12,0.55)';
    ctx.fillText('MMA BRIDGE', 48, 58);

    // Event name
    const short = evName.length > 40 ? evName.slice(0, 38) + '…' : evName;
    ctx.font = '900 26px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(short.toUpperCase(), 48, 100);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(48, 124); ctx.lineTo(W - 48, 124); ctx.stroke();

    // Big correct count
    ctx.font = '900 100px sans-serif';
    ctx.fillStyle = '#c8960c';
    ctx.fillText(`${correct}`, 48, 258);
    const cw = ctx.measureText(`${correct}`).width;
    ctx.font = '900 52px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText(`/ ${total}`, 48 + cw + 6, 248);

    // PCT right-aligned
    ctx.textAlign = 'right';
    ctx.font = '900 68px sans-serif';
    ctx.fillStyle = pct >= 70 ? '#c8960c' : pct >= 50 ? 'rgba(200,150,12,0.7)' : 'rgba(255,100,100,0.8)';
    ctx.fillText(`${pct}%`, W - 48, 228);
    ctx.font = '700 18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillText(verdict.toUpperCase(), W - 48, 258);
    ctx.textAlign = 'left';

    // Points
    ctx.font = '500 13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillText(`${totalPts} PTS`, 48, 296);

    // Bottom divider + CTA
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(48, 336); ctx.lineTo(W - 48, 336); ctx.stroke();
    ctx.font = '500 13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText('Can you beat me?', 48, 374);
    ctx.textAlign = 'right';
    ctx.font = '700 13px sans-serif';
    ctx.fillStyle = 'rgba(200,150,12,0.65)';
    ctx.fillText('mmabridge.com', W - 48, 374);
    ctx.textAlign = 'left';

    return c;
  }

  function showWinCard(winner, loser, pts, commPct, evName) {
    const W = 800, H = 440;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Background
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);

    // Gold glow top-left
    const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 480);
    g1.addColorStop(0, 'rgba(200,150,12,0.15)'); g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

    // Gold top bar
    const bar = ctx.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, '#c8960c'); bar.addColorStop(1, 'rgba(200,150,12,0.15)');
    ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 4);

    // "I CALLED IT ✓"
    ctx.font = '900 13px sans-serif';
    ctx.fillStyle = 'rgba(200,150,12,0.6)';
    ctx.letterSpacing = '4px';
    ctx.textBaseline = 'top';
    ctx.fillText('MMA BRIDGE', 48, 32);
    ctx.letterSpacing = '0px';

    ctx.font = '900 48px sans-serif';
    ctx.fillStyle = '#c8960c';
    ctx.fillText('I CALLED IT ✓', 48, 72);

    // Winner name
    ctx.font = '900 80px sans-serif';
    ctx.fillStyle = '#ffffff';
    const winShort = winner.length > 18 ? winner.split(' ').pop() : winner;
    ctx.fillText(winShort.toUpperCase(), 48, 140);

    // "defeated loser"
    ctx.font = '500 22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    const loserShort = loser.length > 22 ? loser.split(' ').pop() : loser;
    ctx.fillText(`defeated ${loserShort}`, 48, 250);

    // Event name
    ctx.font = '700 16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText((evName || '').toUpperCase(), 48, 284);

    // Points badge
    if (pts && parseInt(pts) > 0) {
      ctx.font = '900 40px sans-serif';
      ctx.fillStyle = '#c8960c';
      ctx.textAlign = 'right';
      ctx.fillText(`+${pts}pts`, W - 48, 200);
      if (commPct) {
        ctx.font = '600 16px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(`${commPct}% of fans picked ${winner.split(' ').pop()}`, W - 48, 248);
      }
      ctx.textAlign = 'left';
    }

    // Divider + CTA
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(48, 334); ctx.lineTo(W - 48, 334); ctx.stroke();
    ctx.font = '500 13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText('Think you can do better?', 48, 376);
    ctx.font = '700 13px sans-serif';
    ctx.fillStyle = 'rgba(200,150,12,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('mmabridge.com', W - 48, 376);
    ctx.textAlign = 'left';

    const imgUrl = c.toDataURL('image/png');
    const tweetText = `I called it — ${winner} wins 🥊\n${evName ? evName + '\n' : ''}Can you beat my picks?\nmmabridge.com/picks.html?id=${eventId}`;

    showShareModal(imgUrl, tweetText, `https://mmabridge.com/picks.html?id=${eventId}`);
  }

  function showShareModal(imgDataUrl, text, url) {
    document.getElementById('pkShareModal')?.remove();
    const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    const el = document.createElement('div');
    el.id = 'pkShareModal';
    el.className = 'pk-shr-overlay';
    el.innerHTML = `
      <div class="pk-shr-panel">
        <button class="pk-shr-close" id="pkShrClose">✕</button>
        <div class="pk-shr-title">Share Your Result</div>
        ${imgDataUrl ? `<img class="pk-shr-img" src="${imgDataUrl}" alt="My picks card">` : ''}
        <div class="pk-shr-actions">
          ${imgDataUrl ? `<a class="pk-shr-btn pk-shr-save" href="${imgDataUrl}" download="mmabridge-picks.png">⬇ Save Image</a>` : ''}
          <a class="pk-shr-btn pk-shr-tweet" href="${tweetHref}" target="_blank" rel="noopener">Post on X</a>
          <button class="pk-shr-btn pk-shr-copy" id="pkShrCopy">Copy Link</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.getElementById('pkShrClose')?.addEventListener('click', close);
    document.getElementById('pkShrCopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(url).then(() => {
        const btn = document.getElementById('pkShrCopy');
        if (btn) { btn.textContent = 'Copied! ✓'; setTimeout(() => { if (btn) btn.textContent = 'Copy Link'; }, 2000); }
      }).catch(() => {});
    });
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
    const pct = localHype ? ((localHype - 1) / 9) * 100 : 0;
    const label = localHype ? (HYPE_LABELS[localHype] || '') : 'Rate this event';
    return `
      <div class="pk-hype-slim" id="pkHypeWidget">
        <span class="pk-hype-slim-label" id="pkHypeLabel">${label}</span>
        <div class="pk-hype-slim-track" id="pkHypeTrack">
          <div class="pk-hype-slim-fill" id="pkHypeFill" style="width:${pct}%" data-target-pct="${pct}"></div>
          <div class="pk-hype-slim-thumb" id="pkHypeThumb" style="left:${pct}%;display:${pct > 0 ? 'block' : 'none'}"></div>
        </div>
        ${hypeCount > 0 ? `<span class="pk-hype-slim-avg" id="pkHypeAvgBadge">${hypeAvg.toFixed(1)}<span class="pk-hype-denom">/10</span></span>` : `<span class="pk-hype-slim-avg" id="pkHypeAvgBadge" style="opacity:0">—</span>`}
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

    // Save bar button label/class (inline in ctrl panel)
    let saveBtnLabel = 'Save Picks', saveBtnCls = '';
    if (dirty && picked > 0) { saveBtnLabel = `Save ${picked} Pick${picked !== 1 ? 's' : ''}`; saveBtnCls = 'dirty'; }
    else if (!dirty && picked > 0) { saveBtnLabel = `✓ ${picked} Picks Saved`; saveBtnCls = 'saved'; }

    // Control panel (hype + fotn + save) — only for upcoming unlocked signed-in
    const showCtrl = !isCompleted && !isLocked;
    const ctrlHtml = showCtrl ? `
      <div class="pk-ctrl">
        ${hypeMeterHtml()}
        ${fotnBarHtml()}
        ${myId ? `
        <div class="pk-ctrl-save pk-save-bar" id="pkSaveBar">
          <button class="pk-save-btn${saveBtnCls ? ' '+saveBtnCls : ''}" id="pkSaveBtn" type="button">${saveBtnLabel}</button>
        </div>` : ''}
      </div>` : '';

    root.innerHTML = `
      ${hasPoster ? `<div class="pk-poster-bg" style="--poster:url('${esc(event.poster)}')"></div>` : ''}
      <div class="pk-shell">
        <div class="pk-nav">
          <a href="events.html?id=${encodeURIComponent(eventId)}" class="pk-back">
            <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><polyline points="7,1 2,7 7,13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Events
          </a>
          <button class="pk-switch-btn" id="pkSwitchBtn" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Switch Event
          </button>
          <a class="pk-lb-btn" href="leaderboard.html?event=${encodeURIComponent(eventId)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Leaderboard
          </a>
        </div>

        <div class="pk-hd">
          ${hypeCount > 0 ? `
          <div class="pk-hd-hype-badge" id="pkHdHypeBadge">
            <div class="pk-hdb-num">${hypeAvg.toFixed(1)}<span class="pk-hdb-denom">/10</span></div>
            <div class="pk-hdb-label">Community Hype</div>
            <div class="pk-hdb-count">${hypeCount} rating${hypeCount !== 1 ? 's' : ''}</div>
          </div>` : `<div class="pk-hd-hype-badge" id="pkHdHypeBadge" style="display:none"></div>`}
          <div class="pk-hd-eyebrow">${!isCompleted && !isLocked ? 'Make Your Picks' : (isCompleted ? 'Results' : 'Picks Locked')}</div>
          <h1 class="pk-hd-title">${esc(event.name || '')}</h1>
          <div class="pk-hd-meta">
            ${event.date ? `<span>${esc(event.date)}</span>` : ''}
            ${event.location ? `<span class="pk-meta-dot">·</span><span>${esc(event.location)}</span>` : ''}
            ${countdownHtml()}
          </div>
          <div class="pk-hd-actions">
            ${careerBadgeHtml()}
            <button class="pk-hiw-icon-btn" id="pkHowItWorks" type="button" aria-label="How it works" title="How scoring works">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
            </button>
          </div>
        </div>

        ${isLocked ? `
          <div class="pk-banner pk-locked-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Picks are locked — the event has started
          </div>` : ''}
        ${!myId && !isCompleted && !isLocked ? `
          <div class="pk-banner pk-signin-banner">
            <span>Sign in to save your picks and track your record</span>
            <a href="auth.html" class="pk-signin-link">Sign In →</a>
          </div>` : ''}
        ${challenge ? `
          <div class="pk-banner pk-challenge-banner">
            <div class="pk-ch-info">
              <div class="pk-ch-vs">H2H vs <strong>${esc(oppName.split(' ')[0])}</strong></div>
              <div class="pk-ch-tally">You ${picked} · ${esc(oppName.split(' ')[0])} ${oppPickCount} picks</div>
            </div>
          </div>` : ''}

        ${whoPickedHtml()}

        ${scoreHero()}

        ${ctrlHtml}

        <div class="pk-fights">
          ${mainSection}${prelimSection}${earlySection}
        </div>

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
            <div class="pk-switcher-title" id="pkSwitcherTitle">Pick Another Event</div>
            <button class="pk-switcher-close" id="pkSwitcherClose" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="pk-switcher-list" id="pkSwitcherList"></div>
        </div>
      </div>`;

    // Bind save button (inline in ctrl panel)
    document.getElementById('pkSaveBtn')?.addEventListener('click', saveAllPicks);

    // ── How It Works modal ──
    document.getElementById('pkHowItWorks')?.addEventListener('click', () => {
      const el = document.createElement('div');
      el.className = 'lb-modal-backdrop';
      el.id = 'pkHiwModal';
      el.innerHTML = `
        <div class="lb-modal pk-hiw-modal">
          <div class="lb-modal-header">
            <span class="lb-modal-title">How Scoring Works</span>
            <button class="lb-modal-close" id="pkHiwClose">✕</button>
          </div>
          <div class="lb-modal-body pk-hiw-body">
            <div class="pk-hiw-rows">
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-cyan">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Pick the Winner</div>
                  <div class="pk-hiw-sub">Correct fighter — +10 pts</div>
                </div>
                <span class="pk-hiw-pts">+10</span>
              </div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-amber">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Method Bonus</div>
                  <div class="pk-hiw-sub">KO · Sub · Decision — +5 pts</div>
                </div>
                <span class="pk-hiw-pts">+5</span>
              </div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-amber">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v20M2 12h20"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Round Bonus</div>
                  <div class="pk-hiw-sub">Exact round (needs correct method) — +5 pts</div>
                </div>
                <span class="pk-hiw-pts">+5</span>
              </div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-red">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Fight of the Night</div>
                  <div class="pk-hiw-sub">Pick which fight earns FOTN — +15 pts</div>
                </div>
                <span class="pk-hiw-pts">+15</span>
              </div>
              <div class="pk-hiw-divider"></div>
              <div class="pk-hiw-row pk-hiw-dd-row">
                <span class="pk-hiw-icon pk-hiw-gold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Double Down</div>
                  <div class="pk-hiw-sub">One per event · correct = ×2 pts · wrong = −10 pts</div>
                </div>
                <span class="pk-hiw-pts pk-hiw-pts-gold">×2</span>
              </div>
            </div>
            <div class="pk-hiw-max">Perfect pick: winner + method + round = <strong>20 pts</strong> &nbsp;·&nbsp; with Double Down = <strong>40 pts</strong></div>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el) el.remove(); });
      document.getElementById('pkHiwClose').addEventListener('click', () => el.remove());
    });

    bindInteractions();
    bindHoverCards();
    bindInfoBtns();
    bindHype();
    bindFotn();
    updateFotnBar();
    initShareBtn();
    initReplayBtn();

    // FOTN reminder pill scrolls to FOTN section
    document.querySelector('.pk-fotn-reminder')?.addEventListener('click', () => {
      document.getElementById('pkFotnBar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    requestAnimationFrame(() => {
      initSpine();
      animateFightEntrance();
    });
  }

  // ── Fighter hover card (desktop only) ────────
  function bindHoverCards() {
    if (!window.matchMedia('(hover: hover)').matches) return;

    let hc = document.getElementById('fc-hov');
    if (!hc) {
      hc = document.createElement('div');
      hc.id = 'fc-hov';
      hc.className = 'fc-hov';
      document.body.appendChild(hc);
    }

    let hideT, showT;
    const hide = () => hc.classList.remove('fc-hov-on');

    const show = side => {
      const fd = lookupFighter(side.dataset.pick);
      if (!fd) return;
      const rec = fd.record ? `${fd.record.wins}-${fd.record.losses}${fd.record.draws?`-${fd.record.draws}`:''}` : '';
      const rows = (fd.last5 || []).slice(0, 5).map(f => {
        const r = (f.result || '').toUpperCase();
        const cls = r === 'W' ? 'w' : r === 'L' ? 'l' : 'nc';
        return `<div class="fc-hov-row">
          <span class="fc-hov-res fc-hov-${cls}">${r}</span>
          <span class="fc-hov-opp">${esc(f.opponent || '')}</span>
          <span class="fc-hov-mth">${esc(f.method || '')}${f.round ? ` R${f.round}` : ''}</span>
        </div>`;
      }).join('');

      hc.innerHTML =
        `<div class="fc-hov-name">${esc(fd.name)}</div>` +
        (rec ? `<div class="fc-hov-rec">${rec}</div>` : '') +
        (rows ? `<div class="fc-hov-fights">${rows}</div>` : '') +
        (fd.id ? `<a class="fc-hov-link" href="fighter.html?id=${esc(fd.id)}" onclick="event.stopPropagation()">View Profile →</a>` : '');

      hc.classList.add('fc-hov-on');

      // Position above the element, fall back to below
      const r = side.getBoundingClientRect();
      const h = hc.getBoundingClientRect();
      let top  = r.top - h.height - 10;
      if (top < 8) top = r.bottom + 10;
      let left = r.left + r.width / 2 - h.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - h.width - 8));
      hc.style.top  = top  + 'px';
      hc.style.left = left + 'px';
    };

    root.querySelectorAll('.sb-side[data-pick]').forEach(side => {
      if (!lookupFighter(side.dataset.pick)) return;
      side.addEventListener('mouseenter', () => { clearTimeout(hideT); showT = setTimeout(() => show(side), 220); });
      side.addEventListener('mouseleave', () => { clearTimeout(showT); hideT = setTimeout(hide, 140); });
    });
    hc.addEventListener('mouseenter', () => clearTimeout(hideT));
    hc.addEventListener('mouseleave', () => { hideT = setTimeout(hide, 140); });
  }

  // ── Bind hype drag bar ────────────────────────
  function bindHype() {
    const track = document.getElementById('pkHypeTrack');
    if (!track) return;

    function valFromX(clientX) {
      const rect = track.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.max(1, Math.min(10, Math.round(pct * 9) + 1));
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

  // ── Info popup content ────────────────────────
  const INFO_CONTENT = {
    dd: {
      title: 'Double Down',
      body: `<p>Pick <strong>one fight per event</strong> to Double Down on. If you're right, all points for that fight are <strong>doubled (×2)</strong>. If you're wrong, you lose <strong>10 pts</strong>.</p>
<p>Only one Double Down allowed per event. You can change or undo it any time before the event locks.</p>
<div class="pk-info-examples">
  <div class="pk-info-ex pk-info-ex-good"><span class="pk-info-ex-icon">+</span> Correct pick → ×2 all points (max 40 pts)</div>
  <div class="pk-info-ex pk-info-ex-bad"><span class="pk-info-ex-icon">−</span> Wrong pick → −10 pts</div>
</div>`,
    },
    hype: {
      title: 'Hype Rating',
      body: `<p>Rate how hyped you are for this event on a scale of <strong>1–10</strong> before it locks.</p>
<p>Drag the bar to set your score. The <strong>community average</strong> appears once enough fans have rated.</p>
<p style="color:rgba(255,255,255,.35);font-size:.78rem;margin-top:8px">Hype ratings don't affect your pick score — it's just the vibe check for the event.</p>`,
    },
    fotn: {
      title: 'Fight of the Night',
      body: `<p>Pick which fight you think will earn the <strong>Fight of the Night bonus</strong> — the most entertaining bout on the card.</p>
<p>This is a separate pick from your winner predictions. Get it right and you earn <strong>+15 pts</strong>.</p>
<p style="color:rgba(255,255,255,.35);font-size:.78rem;margin-top:8px">FOTN is awarded by the UFC after the event. Only one fight can win it.</p>`,
    },
  };

  function showInfoPop(btn, infoKey) {
    document.querySelectorAll('.pk-info-pop').forEach(p => p.remove());
    const data = INFO_CONTENT[infoKey];
    if (!data) return;
    const pop = document.createElement('div');
    pop.className = 'pk-info-pop';
    pop.innerHTML = `
      <div class="pk-info-pop-head">
        <span class="pk-info-pop-title">${data.title}</span>
        <button class="pk-info-pop-close" type="button">✕</button>
      </div>
      <div class="pk-info-pop-body">${data.body}</div>`;
    document.body.appendChild(pop);

    // Position near button
    const rect = btn.getBoundingClientRect();
    const popW = 260;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
    let top = rect.top - 12;
    pop.style.width = popW + 'px';
    pop.style.left = left + 'px';
    // Show above or below depending on space
    pop.style.visibility = 'hidden';
    pop.style.display = 'block';
    const popH = pop.offsetHeight;
    if (rect.top - popH - 16 > 0) {
      pop.style.top = (rect.top + window.scrollY - popH - 10) + 'px';
    } else {
      pop.style.top = (rect.bottom + window.scrollY + 10) + 'px';
    }
    pop.style.visibility = '';

    pop.querySelector('.pk-info-pop-close').addEventListener('click', () => pop.remove());
    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('click', outside); }
      });
    }, 10);
  }

  function bindInfoBtns() {
    document.querySelectorAll('[data-info]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showInfoPop(btn, btn.dataset.info);
      });
    });
  }

  // ── Update Double Down state across all cards ──
  function updateDDState() {
    const currentDD = localPicks['__dd__']?.pick || null;
    root.querySelectorAll('.sb-fight[data-key]').forEach(card => {
      const key     = card.dataset.key;
      const btn     = card.querySelector('.pk-dd-btn');
      const isDD    = currentDD === key;
      const blocked = currentDD && !isDD; // another fight is doubled
      card.classList.toggle('pk-dd-card', isDD);
      if (btn) {
        btn.classList.toggle('pk-dd-active', isDD);
        btn.classList.toggle('pk-dd-blocked', blocked);
        btn.disabled = blocked;
        const lbl = btn.querySelector('.pk-dd-label');
        if (lbl) lbl.textContent = isDD ? 'UNDO DOUBLE DOWN' : 'DOUBLE DOWN';
      }
    });
    updateSaveBar();
  }

  // ── Bind fighter/method/round clicks ──────────
  function bindInteractions() {
    if (!isCompleted && !isLocked) {
      // ── Fighter side click → pick ──
      root.querySelectorAll('.sb-side[data-key]').forEach(side => {
        const applyPick = (key, pick, fight, side) => {
          fight.querySelectorAll('.pk-change-confirm').forEach(el => el.remove());
          fight.querySelectorAll('.sb-side').forEach(s => s.classList.remove('selected', 'dimmed', 'sb-tap'));
          side.classList.add('selected');
          void side.offsetWidth;
          side.classList.add('sb-tap');
          setTimeout(() => side.classList.remove('sb-tap'), 300);
          playPickSound();
          fight.querySelectorAll('.sb-side').forEach(s => { if (s !== side) s.classList.add('dimmed'); });
          const cur = localPicks[key] || {};
          localPicks[key] = { pick, base: cur.base || '', round: cur.round || '' };
          sessionStorage.setItem(`pk_draft_${eventId}`, JSON.stringify(localPicks));
          const methodWrap = document.getElementById(`pkMethod-${key}`);
          if (methodWrap) methodWrap.classList.add('visible');
          fight.classList.toggle('has-pick', true);
          updateSaveBar();
          updateSpine();
        };

        const activate = () => {
          if (fotnPickMode) return;
          const key  = side.dataset.key;
          const pick = side.dataset.pick;
          const fight = root.querySelector(`.sb-fight[data-key="${key}"]`);
          if (!fight) return;
          if (!myId) { showToast('Sign in to save picks', 'err'); return; }

          const wasSelected = side.classList.contains('selected');

          // Dismiss any existing confirm on this fight
          if (wasSelected) {
            // Tap selected fighter again → deselect
            fight.querySelectorAll('.pk-change-confirm').forEach(el => el.remove());
            fight.querySelectorAll('.sb-side').forEach(s => s.classList.remove('selected', 'dimmed'));
            delete localPicks[key];
            if (localPicks['__dd__']?.pick === key) { delete localPicks['__dd__']; updateDDState(); }
            sessionStorage.setItem(`pk_draft_${eventId}`, JSON.stringify(localPicks));
            const methodWrap = document.getElementById(`pkMethod-${key}`);
            if (methodWrap) methodWrap.classList.remove('visible');
            const strip = document.getElementById(`pkDrumStrip-${key}`);
            if (strip) { strip.style.transition = 'none'; strip.style.transform = 'translateY(0)'; }
            document.getElementById(`pkRounds-${key}`)?.classList.remove('pk-round-row-visible');
            fight.classList.toggle('has-pick', false);
            updateSaveBar(); updateSpine();
            return;
          }

          const currentPick = localPicks[key]?.pick;

          if (currentPick && currentPick !== pick) {
            // Switching to a different fighter — show confirmation
            fight.querySelectorAll('.pk-change-confirm').forEach(el => el.remove());
            const confirm = document.createElement('div');
            confirm.className = 'pk-change-confirm';
            confirm.innerHTML = `
              <div class="pk-change-msg">Switch to <strong>${esc(pick)}</strong>?</div>
              <div class="pk-change-btns">
                <button class="pk-change-yes">Switch</button>
                <button class="pk-change-no">Keep ${esc(currentPick)}</button>
              </div>`;
            fight.appendChild(confirm);
            const t = setTimeout(() => confirm.remove(), 5000);
            confirm.querySelector('.pk-change-yes').addEventListener('click', e => {
              e.stopPropagation();
              clearTimeout(t);
              confirm.remove();
              applyPick(key, pick, fight, side);
            });
            confirm.querySelector('.pk-change-no').addEventListener('click', e => {
              e.stopPropagation();
              clearTimeout(t);
              confirm.remove();
            });
            return;
          }

          applyPick(key, pick, fight, side);
        };
        side.addEventListener('click', activate);
        side.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      });

      // ── Segmented method buttons ────────────────
      root.querySelectorAll('.pk-seg-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const key = btn.dataset.key;
          const method = btn.dataset.method;
          if (!localPicks[key]) { showToast('Pick a fighter first', 'err'); return; }
          const methodWrap = document.getElementById(`pkMethod-${key}`);
          const alreadyActive = btn.classList.contains('active');
          methodWrap?.querySelectorAll('.pk-seg-btn').forEach(b => b.classList.remove('active'));
          const newBase = alreadyActive ? '' : method;
          if (!alreadyActive) btn.classList.add('active');
          const showRound = !alreadyActive && (method === 'KO/TKO' || method === 'SUB');
          const roundRow = document.getElementById(`pkRounds-${key}`);
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

      // ── Drum window touch events (scroll drum) ──────────────────────────
      // Handles .pk-drum-window elements: touchstart/move/end for iOS-style snap scroll
      root.querySelectorAll('.pk-drum-window[data-key]').forEach(win => {
        const key   = win.dataset.key;
        const strip = win.querySelector('.pk-drum-strip');
        if (!strip) return;

        // Disable native scroll on the drum so we own all touch events
        win.style.touchAction = 'none';

        let touchStartY    = 0;
        let currentOffset  = 0;   // translateY value in px at touch start
        let activeOffset   = 0;   // live offset during drag

        function getOffsetFromTransform() {
          const t = strip.style.transform;
          const m = t ? t.match(/translateY\((-?[\d.]+)px\)/) : null;
          return m ? parseFloat(m[1]) : 0;
        }

        function clampOffset(offset) {
          const min = -((DRUM_ITEMS.length - 1) * DRUM_H);
          return Math.max(min, Math.min(0, offset));
        }

        function snapToNearest(offset) {
          const idx   = Math.round(-offset / DRUM_H);
          const snapped = -(Math.max(0, Math.min(DRUM_ITEMS.length - 1, idx)) * DRUM_H);
          strip.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
          strip.style.transform  = `translateY(${snapped}px)`;
          // Update pick state
          const item = DRUM_ITEMS[Math.max(0, Math.min(DRUM_ITEMS.length - 1, idx))];
          if (!item || !localPicks[key]) return;
          const newBase  = item.method;
          const showRound = newBase === 'KO/TKO' || newBase === 'SUB';
          const roundRow  = document.getElementById(`pkRounds-${key}`);
          if (roundRow) roundRow.classList.toggle('pk-round-row-visible', showRound);
          // Sync active state on any seg buttons
          const methodWrap = document.getElementById(`pkMethod-${key}`);
          if (methodWrap) {
            methodWrap.querySelectorAll('.pk-seg-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.method === newBase);
            });
          }
          localPicks[key] = { ...localPicks[key], base: newBase, round: showRound ? (localPicks[key].round || '') : '' };
          updateSaveBar();
        }

        win.addEventListener('touchstart', e => {
          if (e.touches.length !== 1) return;
          touchStartY   = e.touches[0].clientY;
          currentOffset = getOffsetFromTransform();
          strip.style.transition = 'none';
          e.preventDefault();
        }, { passive: false });

        win.addEventListener('touchmove', e => {
          if (e.touches.length !== 1) return;
          const deltaY  = e.touches[0].clientY - touchStartY;
          activeOffset  = clampOffset(currentOffset + deltaY);
          strip.style.transform = `translateY(${activeOffset}px)`;
          e.preventDefault();
        }, { passive: false });

        win.addEventListener('touchend', () => {
          snapToNearest(activeOffset);
        });

        win.addEventListener('touchcancel', () => {
          snapToNearest(activeOffset);
        });
      });

      // ── Seg-row horizontal swipe → cycle method on mobile ───────────────
      // Swipe left/right on the method segment row to cycle KO/SUB/DEC
      root.querySelectorAll('.pk-seg-row').forEach(row => {
        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeLocked = false;

        const METHODS = ['KO/TKO', 'SUB', 'DEC'];

        row.addEventListener('touchstart', e => {
          swipeStartX = e.touches[0].clientX;
          swipeStartY = e.touches[0].clientY;
          swipeLocked = false;
        }, { passive: true });

        row.addEventListener('touchmove', e => {
          if (swipeLocked) return;
          const dx = e.touches[0].clientX - swipeStartX;
          const dy = Math.abs(e.touches[0].clientY - swipeStartY);
          // Only lock as horizontal swipe if dx dominates
          if (Math.abs(dx) > 10 && Math.abs(dx) > dy * 1.5) {
            swipeLocked = true;
            e.preventDefault();
          }
        }, { passive: false });

        row.addEventListener('touchend', e => {
          if (!swipeLocked) return;
          const dx = e.changedTouches[0].clientX - swipeStartX;
          if (Math.abs(dx) < 30) return; // too short
          // Find which fight card this belongs to
          const fight = row.closest('.sb-fight[data-key]');
          if (!fight) return;
          const key = fight.dataset.key;
          if (!localPicks[key]) return;
          const curBase    = localPicks[key].base || '';
          const curIdx     = METHODS.indexOf(curBase);
          const nextIdx    = dx < 0
            ? (curIdx + 1) % METHODS.length          // swipe left → next
            : (curIdx - 1 + METHODS.length) % METHODS.length; // swipe right → prev
          const newBase    = METHODS[nextIdx];
          const showRound  = newBase === 'KO/TKO' || newBase === 'SUB';
          row.querySelectorAll('.pk-seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.method === newBase);
          });
          const roundRow = document.getElementById(`pkRounds-${key}`);
          if (roundRow) roundRow.classList.toggle('pk-round-row-visible', showRound);
          localPicks[key] = { ...localPicks[key], base: newBase, round: showRound ? (localPicks[key].round || '') : '' };
          updateSaveBar();
        });
      });

      // ── Double Down toggle ────────────────────────
      root.querySelectorAll('.pk-dd-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const key = btn.dataset.key;
          if (!localPicks[key]?.pick) return;
          if (localPicks['__dd__']?.pick === key) {
            delete localPicks['__dd__'];
          } else {
            localPicks['__dd__'] = { pick: key, base: '', round: '' };
          }
          sessionStorage.setItem(`pk_draft_${eventId}`, JSON.stringify(localPicks));
          updateDDState();
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

  // ── Follow feed ───────────────────────────────
  async function loadFollowFeed() {
    if (!myId || isCompleted || isLocked) return;
    try {
      // Get who the current user follows
      const { data: followData } = await sb.from('follows').select('following_id').eq('follower_id', myId);
      if (!followData?.length) return;
      const followingIds = followData.map(f => f.following_id);

      // Get their picks for this event
      const { data: friendPicks } = await sb.from('picks')
        .select('user_id, fight_key, pick, profiles(display_name, avatar_url)')
        .eq('event_id', eventId)
        .in('user_id', followingIds)
        .neq('fight_key', 'fotn')
        .neq('fight_key', '__dd__');

      if (!friendPicks?.length) return;

      // Group by user
      const byUser = {};
      friendPicks.forEach(p => {
        if (!byUser[p.user_id]) byUser[p.user_id] = { name: p.profiles?.display_name || 'Fighter', avatar: p.profiles?.avatar_url, picks: {} };
        byUser[p.user_id].picks[p.fight_key] = p.pick;
      });

      followFeedData = byUser;
      renderFollowFeed();
    } catch {}
  }

  function renderFollowFeed() {
    const existing = document.getElementById('pkFollowFeed');
    if (existing) existing.remove();
    if (!Object.keys(followFeedData).length) return;

    const section = document.createElement('div');
    section.id = 'pkFollowFeed';
    section.className = 'pk-follow-feed';
    section.innerHTML = `
      <div class="pk-follow-feed-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        From Your Circle
      </div>
      <div class="pk-follow-list">
        ${Object.values(followFeedData).slice(0, 5).map(u => {
          const initials = (u.name||'?').slice(0,2).toUpperCase();
          const pickCount = Object.keys(u.picks).length;
          return `<div class="pk-follow-row">
            <div class="pk-follow-av">${u.avatar ? `<img src="${esc(u.avatar)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none" class="pk-follow-av-init">${initials}</div>` : `<div class="pk-follow-av-init">${initials}</div>`}</div>
            <div class="pk-follow-name">${esc(u.name)}</div>
            <div class="pk-follow-count">${pickCount} pick${pickCount !== 1 ? 's' : ''} in</div>
          </div>`;
        }).join('')}
      </div>`;

    // Insert before the save bar area or after fights
    const saveBar = document.getElementById('pkSaveBar');
    if (saveBar?.parentElement) saveBar.parentElement.insertBefore(section, saveBar);
    else root.appendChild(section);
  }

  // ── Cascade entrance animation ────────────────
  function animateFightEntrance() {
    root.querySelectorAll('.sb-fight').forEach((card, i) => {
      // Clear any leftover clip-path from a previous run
      card.style.clipPath = '';
      card.classList.remove('fc-entering');
      card.style.animationDelay = (i * 72) + 'ms';
      void card.offsetWidth; // reflow to restart animation
      card.classList.add('fc-entering');
    });
    // Animate hype fill bar from 0 → target after cards enter
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fill = document.getElementById('pkHypeFill');
        if (fill) {
          const pct = parseFloat(fill.dataset.targetPct || '0');
          fill.style.width = pct + '%';
        }
      });
    });
  }

  render();
  initPkCountdown();
  setupComments();

  // Retry hype fetch in background (handles Render cold-start delay)
  if (hypeCount === 0) {
    setTimeout(async () => {
      await loadEventExtras();
      updateHypeWidget();
    }, 3000);
  }

  // ── Auto-open event switcher if ?picker=1 ────
  if (new URLSearchParams(location.search).get('picker') === '1') {
    setTimeout(() => {
      const title = document.getElementById('pkSwitcherTitle');
      if (title) title.textContent = 'Choose an Event';
      document.getElementById('pkSwitchBtn')?.click();
    }, 400);
  }

  // ── Unsaved picks warning ─────────────────────
  window.addEventListener('beforeunload', e => {
    if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
  });

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
