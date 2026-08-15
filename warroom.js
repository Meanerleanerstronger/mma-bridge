// ==============================================
// MMA BRIDGE — WAR ROOM
// Live group scoring during an event. Subscribes to the same
// `fight_results` table the admin panel writes to (already used by
// leaderboard.js for post-hoc scoring) and re-scores everyone in your
// group in real time as each fight gets graded.
// ==============================================
(async function () {

  const root = document.getElementById('wrRoot');
  if (!root) return;
  const sb = window._sb;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function waitForAuth(ms = 5000) {
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

  const params  = new URLSearchParams(location.search);
  const eventId = params.get('event') || params.get('id') || '';

  if (!eventId) {
    root.innerHTML = `<div class="wr-empty-state">
      <div class="wr-empty-title">No event selected</div>
      <p>Open the War Room from an event's page during fight night.</p>
      <a href="events.html" class="wr-empty-link icon-arrow">Browse events</a>
    </div>`;
    return;
  }

  root.innerHTML = `<div class="wr-loading"><div class="wr-loading-bar"></div><div class="wr-loading-text">Entering the War Room…</div></div>`;

  const _cv = Math.floor(Date.now() / 3600000);
  const allEvents = await fetch(`events.json?v=${_cv}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []);
  const ev = allEvents.find(e => e.id === eventId);
  if (!ev) {
    root.innerHTML = `<div class="wr-empty-state">
      <div class="wr-empty-title">Event not found</div>
      <a href="events.html" class="wr-empty-link icon-arrow">Browse events</a>
    </div>`;
    return;
  }

  // Ordered fight list with the same fight_key convention leaderboard.js
  // and admin.html already use: main-0, main-1, prelims-0, early-0, ...
  const fights = [
    ...(ev.mainCard     || []).map((f, i) => ({ ...f, key: `main-${i}`,    slotLabel: 'Main Card' })),
    ...(ev.prelims      || []).map((f, i) => ({ ...f, key: `prelims-${i}`, slotLabel: 'Prelims' })),
    ...(ev.earlyPrelims || []).map((f, i) => ({ ...f, key: `early-${i}`,   slotLabel: 'Early Prelims' })),
  ];
  const fightByKey = {};
  fights.forEach(f => { fightByKey[f.key] = f; });

  if (!sb) {
    root.innerHTML = `<div class="wr-empty-state"><div class="wr-empty-title">Sign in to enter the War Room</div></div>`;
    return;
  }

  const user = await waitForAuth();
  const myId = user?.id || null;
  if (!myId) {
    root.innerHTML = `<div class="wr-empty-state">
      <div class="wr-empty-title">Sign in to enter the War Room</div>
      <p>You need an account and a group to see live scores side by side.</p>
      <a href="auth.html" class="wr-empty-link icon-arrow">Sign in</a>
    </div>`;
    return;
  }

  const { data: myProfile } = await sb.from('profiles').select('group_code, group_name').eq('id', myId).single();
  const groupCode = myProfile?.group_code || null;

  if (!groupCode) {
    root.innerHTML = `<div class="wr-empty-state">
      <div class="wr-empty-title">You're not in a group yet</div>
      <p>War Room shows live scores for everyone in a group, side by side. Create or join one first.</p>
      <a href="leaderboard.html" class="wr-empty-link icon-arrow">Create or join a group</a>
    </div>`;
    return;
  }

  const { data: members } = await sb.from('profiles')
    .select('id, display_name, avatar_url')
    .eq('group_code', groupCode);
  const memberList = members && members.length ? members : [{ id: myId, display_name: user?.email?.split('@')[0] || 'You', avatar_url: '' }];
  const memberIds = memberList.map(m => m.id);

  const { data: picksData } = await sb.from('picks')
    .select('user_id, fight_key, pick, method')
    .eq('event_id', eventId)
    .in('user_id', memberIds);

  let winnerMap = {}, methodMap = {}, fotnActual = (ev.fotn || '').toLowerCase();
  fights.forEach(f => {
    if (f.winner) winnerMap[f.key] = f.winner.toLowerCase();
    if (f.method) methodMap[f.key] = f.method;
  });
  async function loadResults() {
    const { data } = await sb.from('fight_results').select('fight_key, winner, method, fotn').eq('event_id', eventId);
    (data || []).forEach(r => {
      if (r.fight_key === '__fotn__') { if (r.fotn) fotnActual = r.fotn.toLowerCase(); return; }
      if (r.winner) winnerMap[r.fight_key] = r.winner.toLowerCase();
      if (r.method) methodMap[r.fight_key] = r.method;
    });
  }
  await loadResults();

  // ── Scoring ──────────────────────────────────
  function scoreMember(uid) {
    const picks = (picksData || []).filter(p => p.user_id === uid);
    const ddMap = {}; // fightKey the user double-downed on
    picks.forEach(p => { if (p.fight_key === '__dd__' && p.pick) ddMap[p.pick] = true; });

    let points = 0, judged = 0, correct = 0;
    picks.forEach(p => {
      if (p.fight_key === '__dd__') return;
      if (p.fight_key === 'fotn') {
        if (fotnActual && p.pick?.toLowerCase() === fotnActual) points += POINTS.FOTN;
        return;
      }
      const winner = winnerMap[p.fight_key];
      if (winner === undefined) return;
      judged++;
      const isDD = !!ddMap[p.fight_key];
      const isCorrect = p.pick?.toLowerCase() === winner;
      if (!isCorrect) { if (isDD) points -= 10; return; }
      correct++;
      let pts = POINTS.WINNER;
      const actualMethod = methodMap[p.fight_key];
      if (p.method && actualMethod) {
        const pb = normalizeMethodBase(p.method), ab = normalizeMethodBase(actualMethod);
        if (pb && ab && pb === ab) {
          pts += POINTS.METHOD;
          if (pb === 'KO/TKO' || pb === 'SUB') {
            const pr = extractRoundNum(p.method), ar = extractRoundNum(actualMethod);
            if (pr && ar && pr === ar) pts += POINTS.ROUND;
          }
        }
      }
      if (isDD) pts *= 2;
      points += pts;
    });
    return { points, judged, correct };
  }

  function gradedCount() { return fights.filter(f => winnerMap[f.key] !== undefined).length; }

  // ── Render shell ─────────────────────────────
  // Local date, not UTC — see script.js localDateStr for why.
  const _now = new Date();
  const isToday = ev.isoDate === (_now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0'));
  root.innerHTML = `
    <div class="wr-hero">
      <div class="wr-hero-top">
        <a href="events.html?id=${encodeURIComponent(eventId)}" class="wr-back">&larr; Event</a>
        <span class="wr-live-badge ${isToday ? 'is-live' : ''}" id="wrLiveBadge">
          <span class="wr-live-dot"></span>${isToday ? 'LIVE' : 'WAR ROOM'}
        </span>
      </div>
      <h1 class="wr-hero-title">${esc(ev.name || '')}</h1>
      <div class="wr-hero-meta">${esc(myProfile.group_name || 'Your Group')} &middot; <span id="wrGradedCount">${gradedCount()}</span> of ${fights.length} fights graded</div>
      <div class="wr-progress"><div class="wr-progress-bar" id="wrProgressBar" style="width:${fights.length ? (gradedCount()/fights.length*100) : 0}%"></div></div>
    </div>
    <div class="wr-board" id="wrBoard"></div>
    <div class="wr-feed-wrap">
      <div class="wr-feed-head">Live Feed</div>
      <div class="wr-feed" id="wrFeed"></div>
    </div>
  `;

  const boardEl = document.getElementById('wrBoard');
  const feedEl  = document.getElementById('wrFeed');

  let rows = {}; // uid -> { el, score, judged, correct }

  function buildRow(m) {
    const el = document.createElement('div');
    el.className = 'wr-row' + (m.id === myId ? ' wr-row-me' : '');
    el.dataset.uid = m.id;
    el.innerHTML = `
      <div class="wr-row-rank">#<span class="wr-rank-num">-</span></div>
      <div class="wr-row-id">
        ${m.avatar_url ? `<img class="wr-avatar" src="${esc(m.avatar_url)}" alt="">` : `<div class="wr-avatar wr-avatar-fallback">${esc((m.display_name||'?')[0]?.toUpperCase())}</div>`}
        <div class="wr-row-name">${esc(m.display_name || 'Anonymous')}${m.id === myId ? ' <span class="wr-you-tag">YOU</span>' : ''}</div>
      </div>
      <div class="wr-row-sub"><span class="wr-row-correct">0</span>/<span class="wr-row-judged">0</span> correct</div>
      <div class="wr-row-score">
        <span class="wr-score-delta" hidden></span>
        <span class="wr-score-num" data-val="0">0</span>
      </div>`;
    return el;
  }

  memberList.forEach(m => {
    const el = buildRow(m);
    rows[m.id] = { el, score: 0, judged: 0, correct: 0 };
    boardEl.appendChild(el);
  });

  // ── Animated count-up (tabular-nums, no digit-width jitter) ──
  function animateNumber(el, from, to, duration = 700) {
    const start = performance.now();
    const diff = to - from;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const val = Math.round(from + diff * eased);
      el.textContent = val;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = to;
    }
    requestAnimationFrame(tick);
  }

  // ── FLIP reorder ──────────────────────────────
  function reorderBoard() {
    const sorted = memberList.slice().sort((a, b) => (rows[b.id].score - rows[a.id].score) || (rows[b.id].correct - rows[a.id].correct));
    const firstRects = {};
    sorted.forEach(m => { firstRects[m.id] = rows[m.id].el.getBoundingClientRect(); });

    sorted.forEach((m, i) => {
      boardEl.appendChild(rows[m.id].el);
      rows[m.id].el.querySelector('.wr-rank-num').textContent = i + 1;
      rows[m.id].el.classList.toggle('wr-row-lead', i === 0 && sorted.length > 1);
    });

    sorted.forEach(m => {
      const el = rows[m.id].el;
      const last = el.getBoundingClientRect();
      const dy = firstRects[m.id].top - last.top;
      if (dy) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.5s cubic-bezier(0.2,0.8,0.2,1)';
          el.style.transform = '';
        });
      }
    });
  }

  function updateScores(prevScores, { flash = true } = {}) {
    memberList.forEach(m => {
      const { points, judged, correct } = scoreMember(m.id);
      const row = rows[m.id];
      const prev = prevScores ? (prevScores[m.id] || 0) : 0;
      row.el.querySelector('.wr-row-judged').textContent  = judged;
      row.el.querySelector('.wr-row-correct').textContent = correct;
      const numEl = row.el.querySelector('.wr-score-num');
      if (flash && points !== prev) {
        animateNumber(numEl, prev, points);
        const deltaEl = row.el.querySelector('.wr-score-delta');
        const delta = points - prev;
        deltaEl.textContent = (delta > 0 ? '+' : '') + delta;
        deltaEl.hidden = false;
        deltaEl.className = 'wr-score-delta ' + (delta > 0 ? 'wr-delta-up' : 'wr-delta-down') + ' wr-delta-pop';
        row.el.classList.remove('wr-flash-up', 'wr-flash-down');
        void row.el.offsetWidth;
        row.el.classList.add(delta > 0 ? 'wr-flash-up' : 'wr-flash-down');
        setTimeout(() => { deltaEl.hidden = true; }, 2200);
      } else {
        numEl.textContent = points;
      }
      row.score = points; row.judged = judged; row.correct = correct;
    });
    reorderBoard();
  }

  updateScores(null, { flash: false });

  function feedLine(f, resultText) {
    const line = document.createElement('div');
    line.className = 'wr-feed-item';
    line.innerHTML = `
      <div class="wr-feed-fight">${esc(f.a)} <span class="wr-feed-vs">vs</span> ${esc(f.b)}</div>
      <div class="wr-feed-result">${esc(resultText)}</div>`;
    feedEl.insertBefore(line, feedEl.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('wr-feed-in')));
  }

  // ── Realtime — same fight_results table admin.html writes to ──
  const connEl = document.createElement('span');
  connEl.className = 'wr-conn';
  connEl.title = 'Connecting…';
  document.getElementById('wrLiveBadge')?.appendChild(connEl);

  sb.channel(`warroom-${eventId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fight_results', filter: `event_id=eq.${eventId}` }, async (payload) => {
      const prevScores = {};
      memberList.forEach(m => { prevScores[m.id] = rows[m.id].score; });

      await loadResults();

      const r = payload.new;
      if (r && r.fight_key !== '__fotn__') {
        const f = fightByKey[r.fight_key];
        if (f) feedLine(f, `${r.winner} def. ${f.a === r.winner ? f.b : f.a} — ${r.method || 'Decision'}`);
      } else if (r && r.fight_key === '__fotn__') {
        const winnersLine = document.createElement('div');
        winnersLine.className = 'wr-feed-item';
        winnersLine.innerHTML = `<div class="wr-feed-fight">Fight of the Night</div><div class="wr-feed-result">${esc(r.fotn || '')}</div>`;
        feedEl.insertBefore(winnersLine, feedEl.firstChild);
      }

      updateScores(prevScores);
      const gc = gradedCount();
      document.getElementById('wrGradedCount').textContent = gc;
      document.getElementById('wrProgressBar').style.width = fights.length ? (gc / fights.length * 100) + '%' : '0%';
    })
    .subscribe((status) => {
      connEl.classList.toggle('wr-conn-live', status === 'SUBSCRIBED');
      connEl.title = status === 'SUBSCRIBED' ? 'Live' : 'Connecting…';
    });
})();
