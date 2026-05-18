// ==============================================
// MMA BRIDGE — LEADERBOARD + GROUPS
// Ranked by total picks made (picks table)
// Requires Supabase profiles table columns:
//   group_code TEXT, group_name TEXT
// Run in Supabase SQL editor if missing:
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_code TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_name TEXT;
// ==============================================
(async function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function randCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ── Tier Progression System ──────────────────
  function getTier(judged, pct) {
    if (judged === 0) return { name: 'Rookie',    color: '#666',    rank: 0 };
    if (judged < 10)  return { name: 'Candidate', color: '#888',    rank: 1 };
    if (pct === null || pct < 40) return { name: 'Iron',      color: '#8a7560', rank: 2 };
    if (pct < 50)     return { name: 'Bronze',    color: '#cd7f32', rank: 3 };
    if (pct < 55)     return { name: 'Silver',    color: '#aaa',    rank: 4 };
    if (pct < 60)     return { name: 'Gold',      color: '#c8960c', rank: 5 };
    if (pct < 65 || judged < 30) return { name: 'Platinum', color: '#00d4e8', rank: 6 };
    if (pct < 70 || judged < 60) return { name: 'Diamond',  color: '#a0e4ff', rank: 7 };
    return { name: 'Legend',   color: '#c8960c', rank: 8 };
  }

  function tierBadgeHtml(judged, pct) {
    const t = getTier(judged, pct);
    return `<span class="lb-tier" style="color:${t.color};border-color:${t.color}22">${t.name}</span>`;
  }

  const root = document.getElementById('lbRoot');
  const sb   = window._sb;

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

  root.innerHTML = `
    <div class="lb-hero">
      <h1 class="lb-title">Community<br><span>Leaderboard</span></h1>
      <p class="lb-subtitle">Ranked by prediction accuracy across completed events</p>
    </div>
    <div class="lb-wrap">

      <!-- PERIOD TABS -->
      <div class="lb-period-tabs" id="lbPeriodTabs">
        <button class="lb-tab active" data-period="all">All Time</button>
        <button class="lb-tab" data-period="month">This Month</button>
        <button class="lb-tab" data-period="week">This Week</button>
        <button class="lb-tab" data-period="last10">Last 10 Events</button>
      </div>

      <!-- GROUPS -->
      <div class="lb-groups" id="lbGroups">
        <div class="lb-groups-header">
          <div class="lb-groups-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Groups
          </div>
          <div class="lb-group-btns">
            <button class="lb-group-btn" id="btnCreateGroup">Create Group</button>
            <button class="lb-group-btn lb-group-btn-sec" id="btnJoinGroup">Join Group</button>
          </div>
        </div>
        <div id="lbGroupStatus"></div>
      </div>

      <!-- BOARDS -->
      <div class="lb-boards" id="lbBoards">
        <!-- Global -->
        <div class="lb-board-col">
          <div class="lb-section-label">Global Rankings</div>
          <div class="lb-table-wrap" id="lbGlobalWrap">
            <div class="lb-loading"><div class="lb-spinner"></div>Loading…</div>
          </div>
        </div>
        <!-- Group (hidden until in a group) -->
        <div class="lb-board-col" id="lbGroupCol" style="display:none">
          <div class="lb-section-label" id="lbGroupLabel">My Group</div>
          <div class="lb-table-wrap" id="lbGroupWrap"></div>
        </div>
      </div>

    </div>

    <!-- CHALLENGES SECTION -->
    <div class="lb-ch-section" id="lbChallengesSection" style="display:none">
      <div class="lb-ch-section-header">
        <div class="lb-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M2 21l9-9"/><path d="M9.5 6.5L14 11"/></svg>
          Head-to-Head Challenges
        </div>
      </div>
      <div id="lbChallengesWrap" class="lb-ch-list">
        <div class="lb-loading"><div class="lb-spinner"></div>Loading…</div>
      </div>
    </div>

    <!-- CREATE MODAL -->
    <div class="lb-modal-backdrop" id="modalCreate" style="display:none">
      <div class="lb-modal">
        <div class="lb-modal-header">
          <span class="lb-modal-title">Create a Group</span>
          <button class="lb-modal-close" id="closeCreate">✕</button>
        </div>
        <div class="lb-modal-body">
          <p class="lb-modal-desc">Give your group a name. We'll generate a join code you can share with friends.</p>
          <input class="lb-modal-input" id="groupNameInput" type="text" placeholder="e.g. Team Contenders, Cage Rats…" maxlength="40" autocomplete="off" />
          <button class="lb-modal-submit" id="submitCreate">Create Group</button>
          <div class="lb-modal-err" id="createErr"></div>
        </div>
      </div>
    </div>

    <!-- JOIN MODAL -->
    <div class="lb-modal-backdrop" id="modalJoin" style="display:none">
      <div class="lb-modal">
        <div class="lb-modal-header">
          <span class="lb-modal-title">Join a Group</span>
          <button class="lb-modal-close" id="closeJoin">✕</button>
        </div>
        <div class="lb-modal-body">
          <p class="lb-modal-desc">Enter the 6-character code your friend shared with you.</p>
          <input class="lb-modal-input lb-modal-input-code" id="joinCodeInput" type="text" placeholder="ABC123" maxlength="6" autocomplete="off" />
          <button class="lb-modal-submit" id="submitJoin">Join Group</button>
          <div class="lb-modal-err" id="joinErr"></div>
        </div>
      </div>
    </div>`;

  // Wait for auth, then load data
  const user = await waitForAuth();
  const myId = user?.id || null;

  if (!sb) {
    document.getElementById('lbGlobalWrap').innerHTML =
      `<div class="lb-error">Sign in to see the full leaderboard.</div>`;
    wireModals(null, null, null);
    return;
  }

  // Points system
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

  // Load events.json to build winner, method, and FOTN lookups
  const allEventsRaw = await fetch('./events.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => []);
  const winnerMap = {}; // 'eventId:fightKey' -> 'winner lowercase'
  const methodMap = {}; // 'eventId:fightKey' -> 'method string'
  const fotnMap   = {}; // 'eventId' -> 'fotn fight name lowercase'

  allEventsRaw.filter(e => e.status === 'completed').forEach(ev => {
    [
      ...(ev.mainCard     || []).map((f, i) => ({ f, key: `main-${i}` })),
      ...(ev.prelims      || []).map((f, i) => ({ f, key: `prelims-${i}` })),
      ...(ev.earlyPrelims || []).map((f, i) => ({ f, key: `early-${i}` })),
    ].forEach(({ f, key }) => {
      if (f.winner) winnerMap[`${ev.id}:${key}`] = f.winner.toLowerCase();
      if (f.method) methodMap[`${ev.id}:${key}`] = f.method;
    });
    if (ev.fotn) fotnMap[ev.id] = ev.fotn.toLowerCase();
  });

  // Also merge fight_results from Supabase (set by admin panel) into winner/method maps
  try {
    const { data: dbResults } = await sb.from('fight_results').select('event_id, fight_key, winner, method, fotn');
    (dbResults || []).forEach(r => {
      const k = `${r.event_id}:${r.fight_key}`;
      if (r.winner) winnerMap[k] = r.winner.toLowerCase();
      if (r.method) methodMap[k] = r.method;
      if (r.fight_key === '__fotn__' && r.fotn) fotnMap[r.event_id] = r.fotn.toLowerCase();
    });
  } catch {}

  // Query: all picks including fotn, with created_at for period filtering
  const { data: picksData, error: picksErr } = await sb.from('picks')
    .select('user_id, event_id, fight_key, pick, method, created_at');

  if (picksErr || !picksData) {
    document.getElementById('lbGlobalWrap').innerHTML =
      `<div class="lb-error">No rankings data yet — be the first to make picks!</div>`;
    wireModals(null, null, null);
    return;
  }

  // ── Period filter helper ────────────────────
  function getPeriodCutoff(period) {
    if (period === 'week')  return new Date(Date.now() - 7  * 86400000).toISOString();
    if (period === 'month') return new Date(Date.now() - 30 * 86400000).toISOString();
    return null;
  }

  function getLast10EventIds() {
    const completed = allEventsRaw
      .filter(e => e.status === 'completed' && e.isoDate)
      .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))
      .slice(0, 10);
    return new Set(completed.map(e => e.id).filter(Boolean));
  }

  function buildStatsMap(picks, cutoff, allowedEventIds = null) {
    const map = {};
    picks.forEach(r => {
      if (!r.user_id) return;
      if (cutoff && r.created_at && r.created_at < cutoff) return;
      if (allowedEventIds && !allowedEventIds.has(r.event_id)) return;
      if (!map[r.user_id]) map[r.user_id] = { total: 0, judged: 0, correct: 0, points: 0 };

      // FOTN picks
      if (r.fight_key === 'fotn') {
        const actualFotn = fotnMap[r.event_id];
        if (actualFotn && r.pick?.toLowerCase() === actualFotn) {
          map[r.user_id].points += POINTS.FOTN;
        }
        return;
      }

      map[r.user_id].total++;
      const wKey   = `${r.event_id}:${r.fight_key}`;
      const winner = winnerMap[wKey];
      if (winner === undefined) return;
      map[r.user_id].judged++;
      const isCorrect = r.pick?.toLowerCase() === winner;
      if (!isCorrect) return;
      map[r.user_id].correct++;
      let pts = POINTS.WINNER;
      const actualMethod = methodMap[wKey];
      if (r.method && actualMethod) {
        const pb = normalizeMethodBase(r.method);
        const ab = normalizeMethodBase(actualMethod);
        if (pb && ab && pb === ab) {
          pts += POINTS.METHOD;
          if (pb === 'KO/TKO' || pb === 'SUB') {
            const pr = extractRoundNum(r.method);
            const ar = extractRoundNum(actualMethod);
            if (pr && ar && pr === ar) pts += POINTS.ROUND;
          }
        }
      }
      map[r.user_id].points += pts;
    });
    return map;
  }

  function buildRankedUsers(statsMap) {
    const ids = Object.keys(statsMap);
    return ids.map(uid => {
      const p   = profileMap[uid] || {};
      const s   = statsMap[uid]   || { total: 0, judged: 0, correct: 0, points: 0 };
      const pct = s.judged > 0 ? Math.round((s.correct / s.judged) * 100) : null;
      const tier = getTier(s.judged, pct);
      return {
        user_id: uid, name: p.display_name || 'Anonymous', avatar: p.avatar_url || '',
        group_code: p.group_code || null, group_name: p.group_name || null,
        count: s.total, judged: s.judged, correct: s.correct, pct, points: s.points || 0,
        tier, tierName: tier.name, tierRank: tier.rank,
      };
    }).sort((a, b) => {
      if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
      if (b.points !== a.points) return b.points - a.points;
      const aH = a.pct !== null && a.judged >= 3;
      const bH = b.pct !== null && b.judged >= 3;
      if (aH && bH) return b.pct - a.pct;
      if (aH) return -1; if (bH) return 1;
      return b.count - a.count;
    });
  }

  // Build initial all-time stats
  let currentStatsMap = buildStatsMap(picksData, null);
  const allUids       = [...new Set(picksData.map(r => r.user_id).filter(Boolean))];

  // Load profiles for everyone
  const profileIds = (myId && !allUids.includes(myId)) ? [...allUids, myId] : allUids;
  let profilesData = [];
  if (profileIds.length > 0) {
    const { data: pData } = await sb
      .from('profiles')
      .select('id, display_name, avatar_url, group_code, group_name')
      .in('id', profileIds);
    profilesData = pData || [];
  }

  const profileMap = {};
  profilesData.forEach(p => { profileMap[p.id] = p; });

  let allUsers = buildRankedUsers(currentStatsMap);

  const myProfile = myId ? (profileMap[myId] || {}) : {};
  let myGroupCode = myProfile.group_code || null;
  let myGroupName = myProfile.group_name || null;

  // ── Render a leaderboard table ─────────────────
  function renderTable(users, wrapId, emptyMsg) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;

    if (!users.length) {
      wrap.innerHTML = `<div class="lb-error">${esc(emptyMsg || 'No picks yet.')}</div>`;
      return;
    }

    const rows = users.map((u, i) => {
      const pos  = i + 1;
      const isMe = u.user_id === myId;
      const posCls = pos === 1 ? ' lb-pos-gold' : pos === 2 ? ' lb-pos-silver' : pos === 3 ? ' lb-pos-bronze' : '';
      const init = (u.name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarHtml = u.avatar
        ? `<img class="lb-avatar" src="${esc(u.avatar)}" alt="${esc(u.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="lb-avatar lb-avatar-init" style="display:none">${esc(init)}</div>`
        : `<div class="lb-avatar lb-avatar-init">${esc(init)}</div>`;

      const hasPoints  = u.points > 0;
      const hasAccuracy = u.pct !== null && u.judged >= 3;
      const statHtml = hasPoints
        ? `<div class="lb-stat lb-stat-points">
             <div class="lb-stat-val">${u.points}<span class="lb-stat-pts-sym">pts</span></div>
             <div class="lb-stat-lbl">${hasAccuracy ? `${u.pct}% · ${u.correct}/${u.judged}` : `${u.count} picks`}</div>
           </div>`
        : `<div class="lb-stat">
             <div class="lb-stat-val">${u.count}</div>
             <div class="lb-stat-lbl">${u.judged > 0 ? `${u.judged} judged` : 'picks'}</div>
           </div>`;

      return `
        <div class="lb-row${isMe ? ' lb-row-me' : ''}${pos <= 3 ? ' lb-row-top' : ''}">
          <div class="lb-pos${posCls}">${pos}</div>
          <div class="lb-user">
            <div class="lb-avatar-wrap">${avatarHtml}</div>
            <div class="lb-user-info">
              <div class="lb-name">${esc(u.name)}${isMe ? ' <span class="lb-you">you</span>' : ''}</div>
              ${tierBadgeHtml(u.judged, u.pct)}
              <div class="lb-picks-sub">${u.count} total picks</div>
            </div>
          </div>
          ${statHtml}
        </div>`;
    }).join('');

    wrap.innerHTML = `<div class="lb-table">${rows}</div>`;
  }

  // ── Render group status + group board ─────────
  function renderGroupStatus() {
    const el         = document.getElementById('lbGroupStatus');
    const groupCol   = document.getElementById('lbGroupCol');
    const groupLabel = document.getElementById('lbGroupLabel');

    if (!myGroupCode) {
      el.innerHTML = '';
      if (groupCol) groupCol.style.display = 'none';
      return;
    }

    const groupUsers = allUsers.filter(u => u.group_code === myGroupCode);

    el.innerHTML = `
      <div class="lb-group-active">
        <div class="lb-group-active-info">
          <span class="lb-group-active-name">${esc(myGroupName || 'My Group')}</span>
          <span class="lb-group-active-meta">${groupUsers.length} member${groupUsers.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="lb-group-code-wrap">
          <span class="lb-group-code-label">Code</span>
          <span class="lb-group-code" id="groupCodeDisplay">${esc(myGroupCode)}</span>
          <button class="lb-group-copy" id="btnCopyCode" title="Copy code">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div class="lb-group-active-btns">
          <button class="lb-group-leave" id="btnLeaveGroup">Leave Group</button>
        </div>
      </div>`;

    if (groupCol) groupCol.style.display = '';
    if (groupLabel) groupLabel.textContent = myGroupName || myGroupCode;
    renderTable(groupUsers, 'lbGroupWrap', 'No picks yet in your group — share your code!');

    document.getElementById('btnCopyCode')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(myGroupCode).catch(() => {});
      const btn = document.getElementById('btnCopyCode');
      btn.innerHTML = '✓';
      setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1500);
    });

    document.getElementById('btnLeaveGroup')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnLeaveGroup');
      if (!btn) return;
      if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.textContent = 'Tap again to confirm';
        setTimeout(() => { if (btn) { btn.dataset.confirm = ''; btn.textContent = 'Leave Group'; } }, 3000);
        return;
      }
      btn.disabled = true;
      try {
        await sb.from('profiles').update({ group_code: null, group_name: null }).eq('id', myId);
        myGroupCode = null; myGroupName = null;
        allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = null; u.group_name = null; } });
        renderGroupStatus();
      } catch { btn.disabled = false; }
    });
  }

  if (location.hash === '#groups') {
    setTimeout(() => document.getElementById('lbGroups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  renderTable(allUsers, 'lbGlobalWrap', 'No picks yet — be the first!');

  // Inject user's own tier below the header
  const myUser = allUsers.find(u => u.user_id === myId);
  if (myUser && myId) {
    const tierEl = document.createElement('div');
    tierEl.className = 'lb-my-tier';
    const t = myUser.tier;
    const judged = myUser.judged;
    const pct = myUser.pct !== null ? myUser.pct : 0;
    const rank = myUser.tierRank;

    // Progress bar logic: how far to next tier
    const tierNames = ['Rookie','Candidate','Iron','Bronze','Silver','Gold','Platinum','Diamond','Legend'];
    let barFill = 0, barColor = t.color, reqText = '';
    if (rank === 0) { barFill = 0; reqText = 'Make your first pick to advance'; }
    else if (rank === 1) { barFill = Math.min(judged / 10, 1); reqText = `${Math.max(10 - judged, 0)} more judged picks to Iron`; }
    else if (rank === 2) { barFill = Math.min(pct / 40, 1); reqText = pct < 40 ? `${(40 - pct).toFixed(1)}% accuracy needed for Bronze` : 'Almost there!'; }
    else if (rank === 3) { barFill = Math.min((pct - 40) / 10, 1); reqText = `${Math.max(50 - pct, 0).toFixed(1)}% more accuracy for Silver`; }
    else if (rank === 4) { barFill = Math.min((pct - 50) / 5, 1); reqText = `${Math.max(55 - pct, 0).toFixed(1)}% more accuracy for Gold`; }
    else if (rank === 5) { barFill = Math.min(Math.min((pct - 55) / 5, 1) * 0.5 + Math.min(judged / 30, 1) * 0.5, 1); reqText = pct < 60 ? `${Math.max(60 - pct, 0).toFixed(1)}% accuracy + ${Math.max(30 - judged, 0)} picks for Platinum` : `${Math.max(30 - judged, 0)} more judged picks for Platinum`; }
    else if (rank === 6) { barFill = Math.min(Math.min((pct - 60) / 5, 1) * 0.5 + Math.min(judged / 60, 1) * 0.5, 1); reqText = pct < 65 ? `${Math.max(65 - pct, 0).toFixed(1)}% accuracy + ${Math.max(60 - judged, 0)} picks for Diamond` : `${Math.max(60 - judged, 0)} more judged picks for Diamond`; }
    else if (rank === 7) { barFill = Math.min(Math.min((pct - 65) / 5, 1) * 0.5 + Math.min(judged / 60, 1) * 0.5, 1); reqText = pct < 70 ? `${Math.max(70 - pct, 0).toFixed(1)}% accuracy for Legend` : `${Math.max(60 - judged, 0)} more judged picks for Legend`; }
    else { barFill = 1; reqText = 'Maximum tier achieved! 🏆'; barColor = '#c8960c'; }

    barFill = Math.max(0, Math.min(1, barFill));

    tierEl.innerHTML = `
      <span class="lb-my-tier-label">Your Tier</span>
      <span class="lb-my-tier-badge" style="color:${t.color};border-color:${t.color}44">${t.name}</span>
      <span class="lb-my-tier-sub">${judged} judged · ${myUser.pct !== null ? myUser.pct + '%' : '—'} accuracy</span>
      <div class="lb-my-tier-progress-wrap">
        <div class="lb-my-tier-progress-labels">
          <span>${t.name}</span>
          ${rank < 8 ? `<span>${tierNames[rank + 1]}</span>` : ''}
        </div>
        <div class="lb-my-tier-progress-bar">
          <div class="lb-my-tier-progress-fill" style="width:${Math.round(barFill * 100)}%;background:${barColor}"></div>
        </div>
        <div class="lb-my-tier-req">${reqText}</div>
      </div>
    `;
    const wrap = document.getElementById('lbGlobalWrap');
    if (wrap) wrap.insertAdjacentElement('beforebegin', tierEl);
  }

  renderGroupStatus();

  // ── Period tab wiring ──────────────────────────
  document.getElementById('lbPeriodTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.lb-tab');
    if (!btn) return;
    document.querySelectorAll('#lbPeriodTabs .lb-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const period = btn.dataset.period || 'all';
    if (period === 'last10') {
      const last10Ids = getLast10EventIds();
      currentStatsMap = buildStatsMap(picksData, null, last10Ids);
    } else {
      currentStatsMap = buildStatsMap(picksData, getPeriodCutoff(period));
    }
    allUsers = buildRankedUsers(currentStatsMap);
    const wrap = document.getElementById('lbGlobalWrap');
    if (wrap) wrap.innerHTML = '<div class="lb-loading"><div class="lb-spinner"></div>Updating…</div>';
    setTimeout(() => {
      renderTable(allUsers, 'lbGlobalWrap', 'No picks in this period yet.');
      renderGroupStatus();
    }, 80);
  });

  // ── Modals ─────────────────────────────────────
  wireModals(myId, allUsers, profileMap);

  function wireModals(myId, allUsers, profileMap) {
    function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

    document.getElementById('btnCreateGroup')?.addEventListener('click', () => {
      if (!myId) { const e = document.getElementById('createErr'); if (e) { openModal('modalCreate'); e.textContent = 'Sign in first to create a group.'; } return; }
      openModal('modalCreate');
      setTimeout(() => document.getElementById('groupNameInput')?.focus(), 60);
    });
    document.getElementById('closeCreate')?.addEventListener('click', () => closeModal('modalCreate'));
    document.getElementById('modalCreate')?.addEventListener('click', e => { if (e.target.id === 'modalCreate') closeModal('modalCreate'); });

    document.getElementById('submitCreate')?.addEventListener('click', async () => {
      const nameEl = document.getElementById('groupNameInput');
      const errEl  = document.getElementById('createErr');
      const name   = nameEl?.value.trim() || '';
      if (!name) { if (errEl) errEl.textContent = 'Enter a group name.'; return; }
      if (!myId) { if (errEl) errEl.textContent = 'Sign in to create a group.'; return; }
      if (errEl) errEl.textContent = '';
      const btn = document.getElementById('submitCreate');
      if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }
      try {
        const code = randCode();
        const { error } = await sb.from('profiles').update({ group_code: code, group_name: name }).eq('id', myId);
        if (error) throw error;
        myGroupCode = code; myGroupName = name;
        if (allUsers) allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = code; u.group_name = name; } });
        closeModal('modalCreate');
        if (nameEl) nameEl.value = '';
        renderGroupStatus();
      } catch {
        if (errEl) errEl.textContent = 'Something went wrong — please try again.';
      } finally { if (btn) { btn.textContent = 'Create Group'; btn.disabled = false; } }
    });

    document.getElementById('btnJoinGroup')?.addEventListener('click', () => {
      if (!myId) { const e = document.getElementById('joinErr'); if (e) { openModal('modalJoin'); e.textContent = 'Sign in first to join a group.'; } return; }
      openModal('modalJoin');
      setTimeout(() => document.getElementById('joinCodeInput')?.focus(), 60);
    });
    document.getElementById('closeJoin')?.addEventListener('click', () => closeModal('modalJoin'));
    document.getElementById('modalJoin')?.addEventListener('click', e => { if (e.target.id === 'modalJoin') closeModal('modalJoin'); });

    document.getElementById('submitJoin')?.addEventListener('click', async () => {
      const codeEl = document.getElementById('joinCodeInput');
      const errEl  = document.getElementById('joinErr');
      const code   = (codeEl?.value.trim() || '').toUpperCase();
      if (code.length < 4) { if (errEl) errEl.textContent = 'Enter a valid group code.'; return; }
      if (!myId) { if (errEl) errEl.textContent = 'Sign in to join a group.'; return; }
      if (errEl) errEl.textContent = '';
      const btn = document.getElementById('submitJoin');
      if (btn) { btn.textContent = 'Joining…'; btn.disabled = true; }
      try {
        // Look up group name from any member with that code
        const { data: groupData } = await sb.from('profiles').select('group_name').eq('group_code', code).limit(1);
        const groupName = groupData?.[0]?.group_name || null;
        const { error } = await sb.from('profiles').update({ group_code: code, group_name: groupName }).eq('id', myId);
        if (error) throw error;
        myGroupCode = code; myGroupName = groupName;
        if (allUsers) allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = code; u.group_name = groupName; } });
        closeModal('modalJoin');
        if (codeEl) codeEl.value = '';
        renderGroupStatus();
      } catch (err) {
        if (errEl) errEl.textContent = 'Could not join group. Check the code and try again.';
      } finally { if (btn) { btn.textContent = 'Join Group'; btn.disabled = false; } }
    });

    document.getElementById('groupNameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('submitCreate')?.click(); });
    document.getElementById('joinCodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('submitJoin')?.click(); });
  }

  // ── Challenges Hub ────────────────────────────
  async function loadAndRenderChallenges() {
    if (!myId || !sb) return;
    const section = document.getElementById('lbChallengesSection');
    const wrap    = document.getElementById('lbChallengesWrap');
    if (!section || !wrap) return;

    const { data: challenges, error } = await sb
      .from('challenges')
      .select('*')
      .or(`challenger_id.eq.${myId},opponent_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    if (error || !challenges?.length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    // Batch-load opponent profiles
    const oppIds = [...new Set(challenges.map(c => c.challenger_id === myId ? c.opponent_id : c.challenger_id))];
    const { data: oppProfiles } = await sb.from('profiles').select('id, display_name, avatar_url').in('id', oppIds);
    const oppMap = {};
    (oppProfiles || []).forEach(p => { oppMap[p.id] = p; });

    // Load pick counts per user per event
    const eventIds = [...new Set(challenges.map(c => c.event_id))];
    const { data: picksRows } = await sb.from('picks').select('user_id, event_id').in('event_id', eventIds);
    const pickCountMap = {};
    (picksRows || []).forEach(r => {
      const k = `${r.user_id}:${r.event_id}`;
      pickCountMap[k] = (pickCountMap[k] || 0) + 1;
    });

    const cards = challenges.map(c => {
      const isChallenger = c.challenger_id === myId;
      const oppId   = isChallenger ? c.opponent_id : c.challenger_id;
      const opp     = oppMap[oppId] || {};
      const oppName = opp.display_name || 'Fighter';
      const status  = c.status || 'pending';

      const myPicks  = pickCountMap[`${myId}:${c.event_id}`] || 0;
      const oppPicks = pickCountMap[`${oppId}:${c.event_id}`] || 0;

      const badgeClass = status === 'pending' ? 'lb-ch-badge-pending'
                       : status === 'active'  ? 'lb-ch-badge-active'
                       :                        'lb-ch-badge-done';
      const badgeLabel = status === 'pending' ? 'Pending'
                       : status === 'active'  ? 'Active'
                       :                        'Completed';

      const initOpp = (oppName || 'F').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarHtml = opp.avatar_url
        ? `<img class="lb-ch-avatar" src="${esc(opp.avatar_url)}" alt="${esc(oppName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="lb-ch-avatar lb-ch-avatar-init" style="display:none">${esc(initOpp)}</div>`
        : `<div class="lb-ch-avatar lb-ch-avatar-init">${esc(initOpp)}</div>`;

      const picksLine = (myPicks || oppPicks)
        ? `<div class="lb-ch-picks">You: <strong>${myPicks}</strong> picks &nbsp;·&nbsp; ${esc(oppName)}: <strong>${oppPicks}</strong> picks</div>`
        : '';

      let actionBtn = '';
      const href = `picks.html?id=${encodeURIComponent(c.event_id)}&challenge=${encodeURIComponent(c.id)}`;
      if (status === 'pending' && !isChallenger) {
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-accept">Accept &amp; Pick →</a>`;
      } else if (status === 'completed') {
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-result">See Result →</a>`;
      } else {
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-view">View Picks →</a>`;
      }

      const roleLabel = isChallenger ? 'You challenged' : 'Challenge received';

      return `
        <div class="lb-ch-card">
          <div class="lb-ch-card-left">
            <div class="lb-ch-avatar-wrap">${avatarHtml}</div>
          </div>
          <div class="lb-ch-card-body">
            <div class="lb-ch-card-top">
              <div class="lb-ch-opp-name">${esc(oppName)}</div>
              <span class="lb-ch-badge ${badgeClass}">${badgeLabel}</span>
            </div>
            <div class="lb-ch-event-name">${esc(c.event_name || c.event_id || 'Unknown Event')}</div>
            ${picksLine}
            <div class="lb-ch-card-foot">
              <span class="lb-ch-role">${roleLabel}</span>
              ${actionBtn}
            </div>
          </div>
        </div>`;
    }).join('');

    wrap.innerHTML = cards || '<div class="lb-error">No challenges yet.</div>';
  }

  loadAndRenderChallenges();

  // ── Period tab switching ───────────────────
  function filterPicksByPeriod(picks, period) {
    if (!period || period === 'all') return picks;
    const days = period === 'week' ? 7 : 30;
    const cutoff = Date.now() - days * 86400000;
    return picks.filter(r => {
      if (!r.created_at) return true; // keep if no timestamp
      return new Date(r.created_at).getTime() >= cutoff;
    });
  }

  function recomputeAndRender(period) {
    if (period === 'last10') {
      // Handled by the primary period tab handler above
      return;
    }
    const filtered = filterPicksByPeriod(picksData, period);

    // Recompute stats for filtered picks
    const filteredStatsMap = {};
    filtered.forEach(r => {
      if (!r.user_id) return;
      if (!filteredStatsMap[r.user_id]) filteredStatsMap[r.user_id] = { total: 0, judged: 0, correct: 0, points: 0 };

      if (r.fight_key === 'fotn') {
        const actualFotn = fotnMap[r.event_id];
        if (actualFotn && r.pick?.toLowerCase() === actualFotn) {
          filteredStatsMap[r.user_id].points += POINTS.FOTN;
        }
        return;
      }

      filteredStatsMap[r.user_id].total++;
      const wKey = `${r.event_id}:${r.fight_key}`;
      const winner = winnerMap[wKey];
      if (winner === undefined) return;

      filteredStatsMap[r.user_id].judged++;
      const isCorrect = r.pick?.toLowerCase() === winner;
      if (!isCorrect) return;

      filteredStatsMap[r.user_id].correct++;
      let pts = POINTS.WINNER;
      const actualMethod = methodMap[wKey];
      if (r.method && actualMethod) {
        const pickedBase = normalizeMethodBase(r.method);
        const actualBase = normalizeMethodBase(actualMethod);
        if (pickedBase && actualBase && pickedBase === actualBase) {
          pts += POINTS.METHOD;
          if (pickedBase === 'KO/TKO' || pickedBase === 'SUB') {
            const pr = extractRoundNum(r.method);
            const ar = extractRoundNum(actualMethod);
            if (pr && ar && pr === ar) pts += POINTS.ROUND;
          }
        }
      }
      filteredStatsMap[r.user_id].points += pts;
    });

    const filteredUsers = Object.keys(filteredStatsMap).map(uid => {
      const p   = profileMap[uid] || {};
      const s   = filteredStatsMap[uid] || { total: 0, judged: 0, correct: 0, points: 0 };
      const pct = s.judged > 0 ? Math.round((s.correct / s.judged) * 100) : null;
      return {
        user_id:    uid,
        name:       p.display_name || 'Anonymous',
        avatar:     p.avatar_url   || '',
        group_code: p.group_code   || null,
        group_name: p.group_name   || null,
        count:      s.total,
        judged:     s.judged,
        correct:    s.correct,
        pct,
        points:     s.points || 0,
      };
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aHas = a.pct !== null && a.judged >= 3;
      const bHas = b.pct !== null && b.judged >= 3;
      if (aHas && bHas) return b.pct - a.pct;
      if (aHas) return -1;
      if (bHas) return 1;
      return b.count - a.count;
    });

    const label = period === 'week' ? 'this week' : period === 'month' ? 'this month' : '';
    const emptyMsg = label
      ? `No picks ${label} yet — be the first!`
      : 'No picks yet — be the first!';
    renderTable(filteredUsers, 'lbGlobalWrap', emptyMsg);
  }

  // Note: primary period tab handler above handles all rendering; this is kept for compatibility
  // recomputeAndRender handles last10 via the period string passed in
  document.getElementById('lbPeriodTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.lb-tab');
    if (!btn) return;
    document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    recomputeAndRender(btn.dataset.period);
  });

})();
