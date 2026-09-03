// ==============================================
// MMA BRIDGE — LEADERBOARD + GROUPS
// Ranked by total picks made (picks table)
// Requires Supabase profiles table columns:
//   group_code TEXT, group_name TEXT, group_is_owner BOOLEAN, group_season_start TEXT,
//   group_event_types TEXT (JSON array string, e.g. '["ppv","fightnight"]'),
//   group_excluded_events TEXT (JSON array of event ids excluded from this group's scoring)
// Run in Supabase SQL editor if missing:
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_code TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_name TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_is_owner BOOLEAN DEFAULT FALSE;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_season_start TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_event_types TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_excluded_events TEXT;
//
// Commissioner management (roster, team name, season/scoring, per-event
// overrides, pick-timing check) lives at commissioner.html — leaderboard.js
// only surfaces a link to it, so there's a single place a commissioner
// manages their group instead of two half-duplicated ones.
//
// Group wall — run once in Supabase SQL editor:
//   CREATE TABLE IF NOT EXISTS group_comments (
//     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
//     group_code TEXT NOT NULL,
//     content TEXT NOT NULL,
//     created_at TIMESTAMPTZ DEFAULT now()
//   );
//   ALTER TABLE group_comments ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "read_group_comments" ON group_comments FOR SELECT USING (true);
//   CREATE POLICY "insert_group_comments" ON group_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
// ==============================================
(async function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function randCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  // randCode() alone had no uniqueness check — two commissioners could
  // collide on the same 6-char code, and anyone joining via that code
  // would land in whichever group the join query's .limit(1) happened to
  // return, silently merging two unrelated groups. Retry until a code
  // with no existing owner is found (36^6 codes, so this is normally a
  // single try — the loop cap is just a safety net against an infinite
  // loop if something's wrong with the query itself).
  async function genUniqueCode() {
    for (let i = 0; i < 10; i++) {
      const code = randCode();
      const { data } = await sb.from('profiles').select('id').eq('group_code', code).limit(1);
      if (!data?.length) return code;
    }
    return randCode() + Date.now().toString(36).slice(-2).toUpperCase();
  }

  // ── Tier Progression System (canonical source: tiers.js) ──
  const getTier = window.MMATiers.getTier;

  function tierBadgeHtml(judged, pct) {
    const t = getTier(judged, pct);
    return `<span class="lb-tier" style="color:${t.color};border-color:${t.color}22">${t.name}</span>`;
  }

  function skeletonRows(n = 6) {
    return Array(n).fill(0).map(() => `
      <div class="lb-skel-row">
        <div class="lb-skel-pos pk-skel"></div>
        <div class="lb-skel-avatar pk-skel"></div>
        <div class="lb-skel-lines">
          <div class="lb-skel-name pk-skel"></div>
          <div class="lb-skel-sub pk-skel"></div>
        </div>
        <div class="lb-skel-stat pk-skel"></div>
      </div>`).join('');
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
      <button class="pk-hiw-btn lb-hiw-btn" id="lbHowItWorks" type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
        How It Works
      </button>
    </div>
    <div class="lb-wrap">

      <!-- NEXT EVENT TO PICK -->
      <div id="lbNextEventBanner"></div>
      <div id="lbMyPicksRow"></div>

      <!-- PERIOD TABS -->
      <div class="lb-period-tabs" id="lbPeriodTabs">
        <button class="lb-tab active" data-period="all">All Time</button>
        <button class="lb-tab" data-period="month">This Month</button>
        <button class="lb-tab" data-period="week">This Week</button>
        <button class="lb-tab" data-period="last10">Last 10 Events</button>
        <button class="lb-tab lb-tab-mygroup" data-period="mygroup">My Group &amp; H2H</button>
      </div>

      <!-- MY GROUP & H2H VIEW (hidden by default) -->
      <div id="lbMyGroupView" style="display:none">
        <button class="lb-action-btn lb-back-to-rankings" id="lbBackToRankings" type="button">&larr; Back to Rankings</button>
        <div id="lbMgGroupSection"></div>
        <div id="lbMgChallengeSection"></div>
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
            ${skeletonRows()}
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
        ${skeletonRows(3)}
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
          <div class="lb-modal-label">Which events count?</div>
          <div class="lb-evtype-row">
            <label class="lb-evtype-opt"><input type="checkbox" id="evtypePpv" checked> <span>PPV <em>(UFC 333, etc.)</em></span></label>
            <label class="lb-evtype-opt"><input type="checkbox" id="evtypeFn" checked> <span>Fight Night</span></label>
          </div>
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

  // Classify an event for the group event-type filter.
  function eventTypeOf(e) {
    if (e.type === 'PPV') return 'ppv';
    if (e.type === 'FIGHT NIGHT') return 'fightnight';
    return null;
  }

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
  // War Room entry point — only surfaced when an event is actually today.
  // Local date, not UTC (toISOString rolls over a day early for US evening
  // visitors, which would hide a genuinely-live event's War Room button).
  const _now = new Date();
  const todayStr = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
  const liveEventToday = allEventsRaw.find(e => e.isoDate === todayStr && e.status !== 'completed') || null;
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

  renderNextEventBanner();
  renderMyPicksRow();

  function renderMyPicksRow() {
    const mount = document.getElementById('lbMyPicksRow');
    if (!mount || !myId) return;
    const played = myPlayedEvents();
    if (!played.length) { mount.innerHTML = ''; return; }
    mount.innerHTML = `<button class="lb-action-btn lb-my-picks-btn" id="lbMyPicksBtn" type="button">See My Picks</button>`;
    document.getElementById('lbMyPicksBtn')?.addEventListener('click', () => {
      const nextEv = allEventsRaw
        .filter(e => e.isoDate > todayStr && e.status !== 'completed')
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0];
      const hasPickedNext = nextEv ? picksData.some(p => p.event_id === nextEv.id && p.user_id === myId) : false;
      const defaultEventId = (nextEv && !hasPickedNext) ? nextEv.id : myPlayedEvents()[0]?.id;
      if (defaultEventId) showUserPicks(myId, 'Your', defaultEventId, true);
    });
  }

  function renderNextEventBanner() {
    const mount = document.getElementById('lbNextEventBanner');
    if (!mount) return;
    const nextEv = allEventsRaw
      .filter(e => e.isoDate > todayStr && e.status !== 'completed')
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0];
    if (!nextEv) { mount.innerHTML = ''; return; }

    const hasPicked = myId ? picksData.some(p => p.event_id === nextEv.id && p.user_id === myId) : false;
    const lockMs = nextEv.start_time ? new Date(nextEv.start_time) - new Date() : null;
    let countdown = '';
    if (lockMs !== null && !isNaN(lockMs)) {
      if (lockMs <= 0) {
        countdown = 'Picks locked';
      } else {
        const days = Math.floor(lockMs / 86400000);
        const hrs  = Math.floor((lockMs % 86400000) / 3600000);
        countdown = days > 0 ? `Locks in ${days}d ${hrs}h` : `Locks in ${hrs}h`;
      }
    }

    mount.innerHTML = `
      <div class="lb-next-event-banner">
        <div class="lb-nxt-info">
          <div class="lb-nxt-label">Next Event to Pick</div>
          <div class="lb-nxt-name">${esc(nextEv.name)}</div>
          ${countdown ? `<div class="lb-nxt-countdown">${esc(countdown)}</div>` : ''}
        </div>
        <a class="lb-nxt-cta ${hasPicked ? 'lb-nxt-cta-done' : ''}" href="picks.html?id=${encodeURIComponent(nextEv.id)}">
          ${hasPicked ? 'Picks Submitted ✓ — View/Edit' : 'Make Your Picks →'}
        </a>
      </div>`;
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

  function buildStatsMap(picks, cutoff, allowedEventIds = null, endCutoff = null) {
    const ddMap = {}; // 'userId:eventId' -> fightKey to double down on
    picks.forEach(r => {
      if (r.fight_key === '__dd__' && r.user_id && r.pick) {
        if (cutoff && r.created_at && r.created_at < cutoff) return;
        if (endCutoff && r.created_at && r.created_at > endCutoff) return;
        if (allowedEventIds && !allowedEventIds.has(r.event_id)) return;
        ddMap[`${r.user_id}:${r.event_id}`] = r.pick;
      }
    });

    const map = {};
    // Tally how many times each user actually double-downed (within the
    // same cutoff/group scope as everything else) — used as a leaderboard
    // tiebreaker: when two users are otherwise equal, the one who took
    // more double-down risk ranks higher.
    Object.keys(ddMap).forEach(key => {
      const uid = key.split(':')[0];
      if (!map[uid]) map[uid] = { total: 0, judged: 0, correct: 0, points: 0, ddCount: 0 };
      map[uid].ddCount++;
    });

    picks.forEach(r => {
      if (!r.user_id) return;
      if (r.fight_key === '__dd__') return; // handled via ddMap
      if (cutoff && r.created_at && r.created_at < cutoff) return;
      if (endCutoff && r.created_at && r.created_at > endCutoff) return;
      if (allowedEventIds && !allowedEventIds.has(r.event_id)) return;
      if (!map[r.user_id]) map[r.user_id] = { total: 0, judged: 0, correct: 0, points: 0, ddCount: 0 };

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
      const isDD      = ddMap[`${r.user_id}:${r.event_id}`] === r.fight_key;
      const isCorrect = r.pick?.toLowerCase() === winner;
      if (!isCorrect) {
        if (isDD) map[r.user_id].points -= 10;
        return;
      }
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
      if (isDD) pts *= 2;
      map[r.user_id].points += pts;
    });
    return map;
  }

  function buildRankedUsers(statsMap) {
    const ids = Object.keys(statsMap);
    return ids.map(uid => {
      const p   = profileMap[uid] || {};
      const s   = statsMap[uid]   || { total: 0, judged: 0, correct: 0, points: 0, ddCount: 0 };
      const pct = s.judged > 0 ? Math.round((s.correct / s.judged) * 100) : null;
      const tier = getTier(s.judged, pct);
      return {
        user_id: uid, name: p.display_name || 'Anonymous', avatar: p.avatar_url || '',
        group_code: p.group_code || null, group_name: p.group_name || null,
        group_is_owner: p.group_is_owner || false,
        group_season_start: p.group_season_start || null,
        group_season_end: p.group_season_end || null,
        count: s.total, judged: s.judged, correct: s.correct, pct, points: s.points || 0,
        ddCount: s.ddCount || 0,
        tier, tierName: tier.name, tierRank: tier.rank,
      };
    }).sort((a, b) => {
      if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
      if (b.points !== a.points) return b.points - a.points;
      // Tiebreaker: still tied on points within the same tier — rank the
      // bigger risk-taker higher (more double-downs attempted), not just
      // whoever happened to accumulate picks in some other order.
      if (b.ddCount !== a.ddCount) return b.ddCount - a.ddCount;
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
      .select('id, display_name, avatar_url, group_code, group_name, group_is_owner, group_season_start, group_season_end, group_event_types, group_excluded_events')
      .in('id', profileIds);
    profilesData = pData || [];
  }

  const profileMap = {};
  profilesData.forEach(p => { profileMap[p.id] = p; });

  let allUsers = buildRankedUsers(currentStatsMap);

  const myProfile = myId ? (profileMap[myId] || {}) : {};
  let myGroupCode = myProfile.group_code || null;
  let myGroupName = myProfile.group_name || null;
  let myGroupIsOwner = myProfile.group_is_owner === true;
  let myGroupSeasonStart = myProfile.group_season_start || null;
  let myGroupSeasonEnd   = myProfile.group_season_end   || null;
  // Which event types count toward this group's standings — defaults to
  // PPV + Fight Night (excludes Contender Series) for groups created
  // before this setting existed, matching the new-group default.
  let myGroupEventTypes = (() => {
    try { const v = JSON.parse(myProfile.group_event_types || 'null'); return Array.isArray(v) && v.length ? v : ['ppv', 'fightnight']; }
    catch { return ['ppv', 'fightnight']; }
  })();
  // Specific events the commissioner pulled out of this group's scoring
  // via commissioner.html, on top of the event-type filter above.
  let myGroupExcludedEvents = (() => {
    try { const v = JSON.parse(myProfile.group_excluded_events || 'null'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  })();

  // ── Render a leaderboard table ─────────────────
  function renderTable(users, wrapId, emptyMsg) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const currentEventId = new URLSearchParams(location.search).get('event') || '';

    if (!users.length) {
      wrap.innerHTML = `
        <div class="lb-empty-state">
          <div class="lb-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line class="lb-empty-bar lb-empty-bar-1" x1="18" y1="20" x2="18" y2="10"/><line class="lb-empty-bar lb-empty-bar-2" x1="12" y1="20" x2="12" y2="4"/><line class="lb-empty-bar lb-empty-bar-3" x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div class="lb-empty-title lb-empty-fade">${esc(emptyMsg || 'No picks yet.')}</div>
          <div class="lb-empty-sub lb-empty-fade">Pick fight winners before events lock — your accuracy is tracked and ranked here.</div>
          <a class="lb-empty-cta icon-arrow lb-empty-fade" href="events.html">View Upcoming Events</a>
        </div>`;
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
             <div class="lb-stat-val" data-count="${u.points}" data-count-suffix="pts" data-count-duration="700">${u.points}pts</div>
             <div class="lb-stat-lbl">${hasAccuracy ? `${u.pct}% · ${u.correct}/${u.judged}` : `${u.count} picks`}</div>
           </div>`
        : `<div class="lb-stat">
             <div class="lb-stat-val" data-count="${hasAccuracy ? u.pct : u.count}" ${hasAccuracy ? 'data-count-suffix="%"' : ''} data-count-duration="700">${hasAccuracy ? u.pct + '%' : u.count}</div>
             <div class="lb-stat-lbl">${u.judged > 0 ? `${u.judged} judged` : 'picks'}</div>
           </div>`;

      return `
        <div class="lb-row${isMe ? ' lb-row-me' : ''}${pos <= 3 ? ' lb-row-top' : ''}" style="animation-delay:${i * 38}ms">
          <div class="lb-pos${posCls}">${pos}</div>
          <div class="lb-user">
            <div class="lb-avatar-wrap">${avatarHtml}</div>
            <div class="lb-user-info">
              <div class="lb-name">${esc(u.name)}${isMe ? ' <span class="lb-you">you</span>' : ''}</div>
              ${tierBadgeHtml(u.judged, u.pct)}
              <div class="lb-picks-sub">${u.count} total picks</div>
              <div class="lb-row-actions">
                <a class="lb-action-btn" href="profile.html?id=${esc(u.user_id)}">View Profile</a>
                ${currentEventId ? `<button class="lb-action-btn lb-action-picks" data-uid="${esc(u.user_id)}" data-uname="${esc(u.name)}">View Picks</button>` : ''}
              </div>
            </div>
          </div>
          ${statHtml}
        </div>`;
    }).join('');

    wrap.innerHTML = `<div class="lb-table">${rows}</div>`;

    // Stagger rows + count-up stats
    if (typeof FXStagger === 'function') {
      var table = wrap.querySelector('.lb-table');
      if (table) FXStagger(table, { delay: 38, type: 'up' });
    }
    if (typeof FXObserve === 'function') setTimeout(FXObserve, 80);

    // Wire View Picks buttons
    wrap.querySelectorAll('.lb-action-picks').forEach(btn => {
      btn.addEventListener('click', () => {
        showUserPicks(btn.dataset.uid, btn.dataset.uname);
      });
    });
  }

  // ── Show a user's picks for a specific event in a modal ──
  // selfMode = true adds an event picker so the signed-in user can browse
  // picks for ANY event they've played, not just whatever ?event= is in
  // the URL (which only two inbound links ever set).
  async function buildPicksRows(uid, eventId) {
    const ev = allEventsRaw.find(e => e.id === eventId);
    const evName = ev ? ev.name : eventId;
    const { data: upicks } = await sb.from('picks').select('fight_key, pick, method').eq('user_id', uid).eq('event_id', eventId);
    const picks = (upicks || []).filter(p => p.fight_key !== 'fotn' && p.fight_key !== '__dd__' && p.fight_key !== '__fotn__');
    function fightLabel(fk) {
      const dash = fk.lastIndexOf('-');
      const section = fk.slice(0, dash);
      const idx = parseInt(fk.slice(dash + 1));
      const arr = section === 'main' ? ev?.mainCard : section === 'prelims' ? ev?.prelims : ev?.earlyPrelims;
      const fight = arr?.[idx];
      if (!fight) return fk;
      return `${fight.a} vs ${fight.b}`;
    }
    const rows = picks.length ? picks.map(p => {
      const wKey = `${eventId}:${p.fight_key}`;
      const winner = winnerMap[wKey];
      const correct = winner && p.pick?.toLowerCase() === winner;
      const pending = !winner;
      const cls = pending ? '' : (correct ? ' lb-pick-correct' : ' lb-pick-wrong');
      const icon = pending ? '' : (correct ? '✓' : '✗');
      return `<div class="lb-pick-row${cls}">
        <span class="lb-pick-fight">${esc(fightLabel(p.fight_key))}</span>
        <span class="lb-pick-val">${esc(p.pick || '—')}${p.method ? ` · ${esc(p.method)}` : ''}</span>
        ${icon ? `<span class="lb-pick-icon">${icon}</span>` : ''}
      </div>`;
    }).join('') : '<div class="lb-pick-empty">No picks submitted for this event</div>';
    return { evName, rowsHtml: rows };
  }

  function myPlayedEvents() {
    if (!myId) return [];
    const ids = [...new Set(picksData.filter(p => p.user_id === myId).map(p => p.event_id))];
    return ids
      .map(id => allEventsRaw.find(e => e.id === id))
      .filter(Boolean)
      .sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
  }

  async function showUserPicks(uid, uname, eventId, selfMode) {
    eventId = eventId || new URLSearchParams(location.search).get('event') || '';
    if (!eventId) return;

    let modal = document.getElementById('lbPicksModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lbPicksModal';
      modal.className = 'lb-modal-overlay';
      document.body.appendChild(modal);
    }

    const played = selfMode ? myPlayedEvents() : [];
    const pickerHtml = selfMode && played.length ? `
      <select class="lb-modal-input lb-picks-event-select" id="lbPicksEventSelect">
        ${played.map(e => `<option value="${esc(e.id)}" ${e.id === eventId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select>` : '';

    async function render(evId) {
      const { evName, rowsHtml } = await buildPicksRows(uid, evId);
      modal.innerHTML = `
        <div class="lb-modal lb-picks-modal-inner">
          <div class="lb-modal-header">
            <div class="lb-modal-title">${esc(uname)}'s Picks</div>
            <div class="lb-modal-sub">${pickerHtml || esc(evName)}</div>
          </div>
          <div class="lb-picks-list">${rowsHtml}</div>
          <button class="lb-modal-close-btn" id="lbPicksClose">Close</button>
        </div>`;
      modal.style.display = 'flex';
      document.getElementById('lbPicksClose')?.addEventListener('click', () => { modal.style.display = 'none'; });
      document.getElementById('lbPicksEventSelect')?.addEventListener('change', e => render(e.target.value));
    }
    render(eventId);
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }

  // ── Group roster (real membership, independent of pick history) ──
  // allUsers/groupUsers below are built from picksData, so a brand-new
  // group where nobody has picked yet would otherwise always show "0
  // members" even when everyone successfully joined — this fetches the
  // actual profiles.group_code roster (same query commissioner.js uses).
  let rosterCache = { code: null, count: null };
  async function fetchRosterCount(code) {
    try {
      const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('group_code', code);
      rosterCache = { code, count: count ?? null };
      return rosterCache.count;
    } catch { return null; }
  }

  // Full roster (names/avatars), not just a count — so a group where
  // members joined but haven't picked yet still shows every real person,
  // not just an empty "no picks yet" state with nobody's name on it.
  let rosterListCache = { code: null, rows: null };
  async function fetchRosterList(code) {
    if (rosterListCache.code === code && rosterListCache.rows) return rosterListCache.rows;
    try {
      const { data } = await sb.from('profiles').select('id, display_name, avatar_url').eq('group_code', code);
      rosterListCache = { code, rows: data || [] };
      return rosterListCache.rows;
    } catch { return null; }
  }

  // Fills in any roster member who hasn't picked yet as a zero-stat row,
  // so renderTable() shows the whole group, not just pick-participants.
  function mergeRosterIntoUsers(rankedUsers, rosterRows) {
    if (!rosterRows) return rankedUsers;
    const present = new Set(rankedUsers.map(u => u.user_id));
    const extra = rosterRows
      .filter(r => !present.has(r.id))
      .map(r => ({
        user_id: r.id, name: r.display_name || 'Anonymous', avatar: r.avatar_url || '',
        group_code: myGroupCode, group_name: myGroupName,
        count: 0, judged: 0, correct: 0, pct: null, points: 0, ddCount: 0,
        tier: getTier(0, null), tierName: getTier(0, null).name, tierRank: getTier(0, null).rank,
      }));
    return [...rankedUsers, ...extra];
  }

  // ── Render group status + group board ─────────
  function renderGroupStatus() {
    const el       = document.getElementById('lbGroupStatus');
    const groupCol = document.getElementById('lbGroupCol');
    const groupLabel = document.getElementById('lbGroupLabel');

    if (!myGroupCode) {
      el.innerHTML = '';
      if (groupCol) groupCol.style.display = 'none';
      return;
    }

    const groupUsers = allUsers.filter(u => u.group_code === myGroupCode);
    const inviteUrl  = `${location.origin}/leaderboard.html?join=${myGroupCode}`;
    const knownRosterCount = rosterCache.code === myGroupCode ? rosterCache.count : null;
    const memberCount = knownRosterCount !== null ? knownRosterCount : groupUsers.length;

    let seasonHtml = '';
    if (myGroupSeasonStart || myGroupSeasonEnd) {
      const dStart = myGroupSeasonStart ? new Date(myGroupSeasonStart).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : null;
      const dEnd   = myGroupSeasonEnd   ? new Date(myGroupSeasonEnd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})   : null;
      const label = dStart && dEnd ? `${esc(dStart)} – ${esc(dEnd)}`
                  : dStart ? `From ${esc(dStart)}`
                  : `Through ${esc(dEnd)}`;
      seasonHtml = `<div class="lb-group-season-info"><svg class="lb-inline-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Season <strong>${label}</strong></div>`;
    }

    // Full commissioner management (roster, team name, season/scoring,
    // per-event overrides, pick-timing check) lives at commissioner.html —
    // one place with everything, instead of a half-duplicated inline panel.

    el.innerHTML = `
      <div class="lb-group-active">
        <div class="lb-group-active-info">
          <span class="lb-group-active-name">${esc(myGroupName || 'My Group')}</span>
          <span class="lb-group-active-meta" id="lbGroupMemberMeta">${memberCount} member${memberCount !== 1 ? 's' : ''}${myGroupIsOwner ? ' · <span class="lb-owner-badge">Commissioner</span>' : ''}</span>
        </div>
        ${seasonHtml}
        <div class="lb-group-action-row">
          <button class="lb-group-btn" id="btnCopyInvite"><svg class="lb-inline-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg> Copy Invite Link</button>
          ${myGroupIsOwner ? `<a class="lb-group-btn lb-group-btn-sec" href="commissioner.html" style="text-decoration:none"><svg class="lb-inline-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Commissioner Dashboard</a>` : ''}
          <a class="lb-group-btn lb-group-btn-recap" href="recap.html" style="text-decoration:none"><svg class="lb-inline-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> Season Recap</a>
          ${liveEventToday ? `<a class="lb-group-btn lb-group-btn-warroom" href="warroom.html?event=${encodeURIComponent(liveEventToday.id)}" style="text-decoration:none">War Room — Live Now</a>` : ''}
          <button class="lb-group-btn lb-group-btn-danger" id="btnLeaveGroup">Leave</button>
        </div>
        <div class="lb-group-code-wrap">
          <span class="lb-group-code-label">Code</span>
          <span class="lb-group-code" id="groupCodeDisplay">${esc(myGroupCode)}</span>
        </div>
      </div>`;

    if (groupCol) groupCol.style.display = '';
    if (groupLabel) groupLabel.textContent = myGroupName || myGroupCode;

    if (knownRosterCount === null) {
      fetchRosterCount(myGroupCode).then(count => {
        if (count === null || rosterCache.code !== myGroupCode) return;
        const metaEl = document.getElementById('lbGroupMemberMeta');
        if (metaEl) {
          metaEl.innerHTML = `${count} member${count !== 1 ? 's' : ''}${myGroupIsOwner ? ' · <span class="lb-owner-badge">Commissioner</span>' : ''}`;
        }
      });
    }

    // Render group leaderboard with season filter + event-type filter
    const seasonCutoff = myGroupSeasonStart ? new Date(myGroupSeasonStart).toISOString() : null;
    // End date is a bare "YYYY-MM-DD" — parsed as UTC midnight, which would
    // exclude every pick made *during* that day if used as-is. Push it to
    // the last instant of that day so the end date counts as fully included.
    const seasonCutoffEnd = myGroupSeasonEnd ? new Date(new Date(myGroupSeasonEnd).getTime() + 86400000 - 1).toISOString() : null;
    const allowedEventIds = new Set(
      allEventsRaw
        .filter(e => eventTypeOf(e) && myGroupEventTypes.includes(eventTypeOf(e)) && !myGroupExcludedEvents.includes(e.id))
        .map(e => e.id)
    );
    const groupStatsMap = buildStatsMap(picksData, seasonCutoff, allowedEventIds, seasonCutoffEnd);
    const seasonUsers = buildRankedUsers(groupStatsMap).filter(u => u.group_code === myGroupCode);
    const knownRoster = rosterListCache.code === myGroupCode ? rosterListCache.rows : null;
    renderTable(mergeRosterIntoUsers(seasonUsers, knownRoster), 'lbGroupWrap', 'No picks yet in your group — share your code!');
    if (!knownRoster) {
      fetchRosterList(myGroupCode).then(rows => {
        if (!rows || rosterListCache.code !== myGroupCode) return;
        renderTable(mergeRosterIntoUsers(seasonUsers, rows), 'lbGroupWrap', 'No picks yet in your group — share your code!');
      });
    }

    // Copy invite link
    document.getElementById('btnCopyInvite')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(inviteUrl).catch(() => {});
      const btn = document.getElementById('btnCopyInvite');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { if (btn) btn.textContent = orig; }, 2000);
    });

    // Click the code chip to copy just the code
    document.getElementById('groupCodeDisplay')?.closest('.lb-group-code-wrap')?.addEventListener('click', function () {
      navigator.clipboard?.writeText(myGroupCode).catch(() => {});
      const lbl = this.querySelector('.lb-group-code-label');
      if (lbl) {
        const orig = lbl.textContent;
        lbl.textContent = 'Copied!';
        setTimeout(() => { lbl.textContent = orig; }, 1500);
      }
    });

    // Leave group
    document.getElementById('btnLeaveGroup')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnLeaveGroup');
      if (!btn) return;
      if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1'; btn.textContent = 'Confirm leave?';
        setTimeout(() => { if (btn) { btn.dataset.confirm = ''; btn.textContent = 'Leave'; } }, 3000);
        return;
      }
      btn.disabled = true;
      try {
        await sb.from('profiles').update({ group_code: null, group_name: null, group_is_owner: false }).eq('id', myId);
        myGroupCode = null; myGroupName = null; myGroupIsOwner = false; myGroupSeasonStart = null; myGroupSeasonEnd = null;
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
    const tierNames = ['Walkout','Prospect','Ranked','Contender','Main Event','Headliner','Champion','P4P','GOAT'];
    let barFill = 0, barColor = t.color, reqText = '';
    if (rank === 0) { barFill = 0; reqText = 'Make your first pick to advance'; }
    else if (rank === 1) { barFill = Math.min(judged / 10, 1); reqText = `${Math.max(10 - judged, 0)} more judged picks to reach Ranked`; }
    else if (rank === 2) { barFill = Math.min(pct / 40, 1); reqText = pct < 40 ? `${(40 - pct).toFixed(1)}% accuracy needed for Contender` : 'Almost there!'; }
    else if (rank === 3) { barFill = Math.min((pct - 40) / 10, 1); reqText = `${Math.max(50 - pct, 0).toFixed(1)}% more accuracy for Main Event`; }
    else if (rank === 4) { barFill = Math.min((pct - 50) / 5, 1); reqText = `${Math.max(55 - pct, 0).toFixed(1)}% more accuracy for Headliner`; }
    else if (rank === 5) { barFill = Math.min(Math.min((pct - 55) / 5, 1) * 0.5 + Math.min(judged / 30, 1) * 0.5, 1); reqText = pct < 60 ? `${Math.max(60 - pct, 0).toFixed(1)}% accuracy + ${Math.max(30 - judged, 0)} picks for Champion` : `${Math.max(30 - judged, 0)} more judged picks for Champion`; }
    else if (rank === 6) { barFill = Math.min(Math.min((pct - 60) / 5, 1) * 0.5 + Math.min(judged / 60, 1) * 0.5, 1); reqText = pct < 65 ? `${Math.max(65 - pct, 0).toFixed(1)}% accuracy + ${Math.max(60 - judged, 0)} picks for P4P` : `${Math.max(60 - judged, 0)} more judged picks for P4P`; }
    else if (rank === 7) { barFill = Math.min(Math.min((pct - 65) / 5, 1) * 0.5 + Math.min(judged / 60, 1) * 0.5, 1); reqText = pct < 70 ? `${Math.max(70 - pct, 0).toFixed(1)}% accuracy for GOAT` : `${Math.max(60 - judged, 0)} more judged picks for GOAT`; }
    else { barFill = 1; reqText = 'Maximum tier reached.'; barColor = '#c24a08'; }

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

    // ── Rank-position moment — rare Lucas popup, not a persistent banner ──
    const myPos = allUsers.findIndex(u => u.user_id === myId);
    if (judged > 0 && allUsers.length > 2) {
      window.LucasMoments?.maybeStretchRun(myPos);
    }

    // ── Tie-explainer moment — I'm level with whoever's directly above
    // or below me (same tier + points), late in the season ──
    if (myPos >= 0) {
      const me    = allUsers[myPos];
      const above = allUsers[myPos - 1];
      const below = allUsers[myPos + 1];
      const tied = (above && above.tierRank === me.tierRank && above.points === me.points)
                || (below && below.tierRank === me.tierRank && below.points === me.points);
      if (tied) window.LucasMoments?.maybeTieExplainer();
    }
  }

  renderGroupStatus();

  // ── Supabase realtime — live picks + results updates ──────
  if (sb) {
    let realtimeReady = false;

    // As an admin enters results, re-pull fight_results, merge the new
    // winner/method/fotn into the existing maps (mutated in place — every
    // render function already closes over these), and re-render whatever's
    // currently on screen so scores/tiers update without a page reload.
    async function refreshFightResults() {
      const { data: dbResults } = await sb.from('fight_results').select('event_id, fight_key, winner, method, fotn');
      (dbResults || []).forEach(r => {
        const k = `${r.event_id}:${r.fight_key}`;
        if (r.winner) winnerMap[k] = r.winner.toLowerCase();
        if (r.method) methodMap[k] = r.method;
        if (r.fight_key === '__fotn__' && r.fotn) fotnMap[r.event_id] = r.fotn.toLowerCase();
      });
      const activeTab = document.querySelector('#lbPeriodTabs .lb-tab.active')?.dataset.period || 'all';
      if (activeTab === 'mygroup') {
        renderMyGroupView();
      } else {
        currentStatsMap = activeTab === 'last10'
          ? buildStatsMap(picksData, null, getLast10EventIds())
          : buildStatsMap(picksData, getPeriodCutoff(activeTab));
        allUsers = buildRankedUsers(currentStatsMap);
        renderTable(allUsers, 'lbGlobalWrap', 'No picks yet — be the first!');
      }
      renderGroupStatus();
    }

    sb.channel('lb-picks-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'picks' }, () => {
        // Flash rows to signal a new pick came in — debounce refreshes
        document.querySelectorAll('.lb-row').forEach(r => {
          r.classList.remove('lb-update-flash');
          void r.offsetWidth;
          r.classList.add('lb-update-flash');
        });
        // Remove flash classes after animation
        setTimeout(() => document.querySelectorAll('.lb-row').forEach(r => r.classList.remove('lb-update-flash')), 700);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fight_results' }, () => {
        refreshFightResults();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED' && !realtimeReady) {
          realtimeReady = true;
        }
      });
  }

  // ── Period tab wiring ──────────────────────────
  document.getElementById('lbPeriodTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.lb-tab');
    if (!btn) return;
    document.querySelectorAll('#lbPeriodTabs .lb-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const period = btn.dataset.period || 'all';

    const boards     = document.getElementById('lbBoards');
    const groupSec   = document.getElementById('lbGroups');
    const challSec   = document.getElementById('lbChallengesSection');
    const myGroupView = document.getElementById('lbMyGroupView');

    const fadeSwap = window.MMAFadeSwap;

    if (period === 'mygroup') {
      const toShow = myGroupView;
      const toHide = (boards?.style.display !== 'none' ? boards : null);
      if (challSec) challSec.style.display = 'none';
      if (groupSec) groupSec.style.display = 'none';
      if (fadeSwap && toHide && toShow) {
        fadeSwap(toHide, toShow, renderMyGroupView);
      } else {
        if (boards) boards.style.display = 'none';
        if (myGroupView) { myGroupView.style.display = ''; renderMyGroupView(); }
      }
      return;
    }

    // Restore normal view
    if (myGroupView && myGroupView.style.display !== 'none') {
      if (fadeSwap && boards) {
        fadeSwap(myGroupView, boards);
        if (groupSec) groupSec.style.display = '';
      } else {
        if (myGroupView) myGroupView.style.display = 'none';
        if (boards) boards.style.display = '';
        if (groupSec) groupSec.style.display = '';
      }
    } else {
      if (boards) boards.style.display = '';
      if (groupSec) groupSec.style.display = '';
      if (myGroupView) myGroupView.style.display = 'none';
    }
    // challenges section visibility controlled by loadAndRenderChallenges

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

  document.getElementById('lbBackToRankings')?.addEventListener('click', () => {
    document.querySelector('#lbPeriodTabs .lb-tab[data-period="all"]')?.click();
  });

  // ── My Group & H2H view ───────────────────────
  function scoreUserForEvent(userId, eventId) {
    const userPicks = picksData.filter(p => p.user_id === userId && p.event_id === eventId);
    const ddPick    = userPicks.find(p => p.fight_key === '__dd__');
    const ddKey     = ddPick?.pick || null;
    let pts = 0, correct = 0, judged = 0;
    userPicks.forEach(r => {
      if (r.fight_key === 'fotn') {
        const actualFotn = fotnMap[r.event_id];
        if (actualFotn && r.pick?.toLowerCase() === actualFotn) pts += POINTS.FOTN;
        return;
      }
      if (r.fight_key === '__dd__') return;
      const wKey   = `${eventId}:${r.fight_key}`;
      const winner = winnerMap[wKey];
      if (winner === undefined) return;
      judged++;
      const isDD      = ddKey === r.fight_key;
      const isCorrect = r.pick?.toLowerCase() === winner;
      if (!isCorrect) { if (isDD) pts -= 10; return; }
      correct++;
      let p = POINTS.WINNER;
      const am = methodMap[wKey];
      if (r.method && am) {
        const pb = normalizeMethodBase(r.method);
        const ab = normalizeMethodBase(am);
        if (pb && ab && pb === ab) {
          p += POINTS.METHOD;
          if (pb === 'KO/TKO' || pb === 'SUB') {
            const pr = extractRoundNum(r.method);
            const ar = extractRoundNum(am);
            if (pr && ar && pr === ar) p += POINTS.ROUND;
          }
        }
      }
      if (isDD) p *= 2;
      pts += p;
    });
    return { pts, correct, judged };
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function renderGroupRecap(groupUsers) {
    const el = document.getElementById('lbMgRecap');
    if (!el || !myGroupCode) return;

    // Find most recent completed event
    const completed = allEventsRaw
      .filter(e => e.status === 'completed' && e.isoDate)
      .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
    if (!completed.length) { el.innerHTML = ''; return; }

    const ev = completed[0];
    const mainFights = ev.mainCard || [];
    if (!mainFights.length) { el.innerHTML = ''; return; }

    const memberIds = new Set(groupUsers.map(u => u.user_id));
    const evPicks = picksData.filter(p => p.event_id === ev.id && memberIds.has(p.user_id) && p.fight_key !== 'fotn' && p.fight_key !== '__dd__');

    // Build pick map: userId -> fightKey -> pick
    const pickMap = {};
    evPicks.forEach(p => {
      if (!pickMap[p.user_id]) pickMap[p.user_id] = {};
      pickMap[p.user_id][p.fight_key] = p.pick;
    });

    const fights = mainFights.map((f, i) => ({ f, key: `main-${i}` }));
    const lastName = n => (n||'').trim().split(' ').pop();

    const headerCols = `<th class="lb-recap-th fight-th">Fight</th>` +
      groupUsers.map(u => `<th class="lb-recap-th">${esc((u.name||'?').split(' ')[0])}</th>`).join('');

    const rows = fights.map(({ f, key }) => {
      const winner = winnerMap[`${ev.id}:${key}`];
      const cells = groupUsers.map(u => {
        const pick = pickMap[u.user_id]?.[key];
        if (!pick) return `<td class="lb-recap-td"><span class="lb-recap-pick no-pick">—</span></td>`;
        const pickLast = lastName(pick);
        if (!winner) return `<td class="lb-recap-td"><span class="lb-recap-pick">${esc(pickLast)}</span></td>`;
        const correct = pick.toLowerCase() === winner;
        return `<td class="lb-recap-td"><span class="lb-recap-pick ${correct ? 'correct' : 'wrong'}">${esc(pickLast)} ${correct ? '✓' : '✗'}</span></td>`;
      }).join('');
      return `<tr><td class="lb-recap-td fight-td">${esc(lastName(f.a))} vs ${esc(lastName(f.b))}</td>${cells}</tr>`;
    }).join('');

    const evScores = groupUsers.map(u => {
      const uPicks = evPicks.filter(p => p.user_id === u.user_id);
      const correct = uPicks.filter(p => winnerMap[`${ev.id}:${p.fight_key}`] && p.pick?.toLowerCase() === winnerMap[`${ev.id}:${p.fight_key}`]).length;
      const judged = uPicks.filter(p => winnerMap[`${ev.id}:${p.fight_key}`] !== undefined).length;
      return { name: u.name, correct, judged };
    }).filter(s => s.judged > 0).sort((a, b) => b.correct - a.correct);

    const scoreRow = evScores.length ? `<div class="lb-recap-score-row">
      ${evScores.map(s => `<div class="lb-recap-score-chip"><span class="lb-recap-score-name">${esc((s.name||'?').split(' ')[0])}</span><span class="lb-recap-score-val">${s.correct}/${s.judged}</span></div>`).join('')}
    </div>` : '';

    el.innerHTML = `
      <div class="lb-recap-wrap">
        <div class="lb-recap-title">Last Event Scorecard</div>
        <div class="lb-recap-evname">${esc(ev.name || ev.id)}</div>
        <div style="overflow-x:auto">
          <table class="lb-recap-table">
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${scoreRow}
      </div>`;
  }

  // ── Lucas weekly recap — one AI blurb per group per finished event,
  // cached client-side so it's not regenerated on every page load. ──
  async function loadLucasRecap(groupUsers) {
    const completed = allEventsRaw
      .filter(e => e.status === 'completed' && e.isoDate)
      .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
    if (!completed.length || !groupUsers.length) return null;
    const ev = completed[0];
    const cacheKey = `lucas_recap_${myGroupCode}_${ev.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch('https://mmabridge-backend.onrender.com/api/group/weekly-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_name: myGroupName || myGroupCode,
          event_name: ev.name,
          standings: groupUsers.slice(0, 5).map(u => ({ name: u.name, points: u.points, accuracy: u.pct })),
        }),
      });
      if (!res.ok) return null;
      const { recap } = await res.json();
      if (recap) localStorage.setItem(cacheKey, recap);
      return recap || null;
    } catch { return null; }
  }

  async function renderGroupWall(groupUsers) {
    const el = document.getElementById('lbMgWall');
    if (!el || !myGroupCode || !sb) return;

    const userMap = {};
    allUsers.forEach(u => { userMap[u.user_id] = { name: u.name, avatar: u.avatar_url }; });

    async function loadWallComments() {
      try {
        const { data, error } = await sb.from('group_comments')
          .select('id, user_id, content, created_at')
          .eq('group_code', myGroupCode)
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw error;
        return data || [];
      } catch { return null; }
    }

    function renderComments(comments) {
      const listEl = el.querySelector('.lb-wall-list');
      if (!listEl) return;
      if (comments === null) {
        listEl.innerHTML = `<div class="lb-wall-empty">Group wall unavailable — run the SQL migration above to enable it.</div>`;
        return;
      }
      if (!comments.length) {
        listEl.innerHTML = `<div class="lb-wall-empty">No posts yet — be first to hype up the group!</div>`;
        return;
      }
      listEl.innerHTML = comments.map(c => {
        const u = userMap[c.user_id] || {};
        const initials = ((u.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2));
        const avHtml = u.avatar
          ? `<img src="${esc(u.avatar)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : '';
        return `
          <div class="lb-wall-comment">
            <div class="lb-wall-av">${avHtml}<span${u.avatar ? ' style="display:none"' : ''}>${esc(initials)}</span></div>
            <div class="lb-wall-body">
              <div class="lb-wall-meta">
                <span class="lb-wall-name">${esc(u.name || 'Member')}</span>
                <span class="lb-wall-time">${timeAgo(c.created_at)}</span>
              </div>
              <div class="lb-wall-text">${esc(c.content)}</div>
            </div>
          </div>`;
      }).join('');
    }

    el.innerHTML = `
      <div id="lbLucasRecap"></div>
      <div class="lb-wall-wrap">
        <div class="lb-wall-title">Group Wall</div>
        <div class="lb-wall-list"><div class="lb-wall-empty">Loading…</div></div>
        ${myId ? `<div class="lb-wall-form">
          <input class="lb-wall-input" id="lbWallInput" type="text" placeholder="Say something to your group…" maxlength="280" autocomplete="off">
          <button class="lb-wall-post" id="lbWallPost">Post</button>
        </div>` : ''}
      </div>`;

    loadLucasRecap(groupUsers).then(recap => {
      const mount = document.getElementById('lbLucasRecap');
      if (mount && recap) {
        mount.innerHTML = `
          <div class="lb-lucas-recap">
            <span class="lb-lucas-recap-icon">L</span>
            <div><div class="lb-lucas-recap-label">Lucas says</div><div class="lb-lucas-recap-text">${esc(recap)}</div></div>
          </div>`;
      }
    });

    const comments = await loadWallComments();
    renderComments(comments);

    document.getElementById('lbWallPost')?.addEventListener('click', async () => {
      const input = document.getElementById('lbWallInput');
      const content = input?.value.trim();
      if (!content || !myId) return;
      const btn = document.getElementById('lbWallPost');
      btn.disabled = true;
      try {
        await sb.from('group_comments').insert({ user_id: myId, group_code: myGroupCode, content });
        input.value = '';
        const updated = await loadWallComments();
        renderComments(updated);
      } catch {}
      btn.disabled = false;
    });

    document.getElementById('lbWallInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('lbWallPost')?.click();
    });
  }

  function renderMyGroupView() {
    const groupEl  = document.getElementById('lbMgGroupSection');
    const challEl  = document.getElementById('lbMgChallengeSection');

    // ── Group leaderboard ──
    if (groupEl) {
      if (myGroupCode) {
        const seasonCutoff2 = myGroupSeasonStart ? new Date(myGroupSeasonStart).toISOString() : null;
        const seasonCutoff2End = myGroupSeasonEnd ? new Date(new Date(myGroupSeasonEnd).getTime() + 86400000 - 1).toISOString() : null;
        const groupStatsMap2 = buildStatsMap(picksData, seasonCutoff2, null, seasonCutoff2End);
        const groupUsers = buildRankedUsers(groupStatsMap2).filter(u => u.group_code === myGroupCode);
        const seasonLabel = (myGroupSeasonStart || myGroupSeasonEnd)
          ? ` · Season ${myGroupSeasonStart ? 'from ' + new Date(myGroupSeasonStart).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : ''}${myGroupSeasonStart && myGroupSeasonEnd ? ' ' : ''}${myGroupSeasonEnd ? 'through ' + new Date(myGroupSeasonEnd).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : ''}`
          : '';
        const mgRosterCount = (rosterCache.code === myGroupCode && rosterCache.count !== null) ? rosterCache.count : groupUsers.length;
        const nameHtml   = `<div class="lb-section-label" style="margin-bottom:12px" id="lbMgMemberLabel">${esc(myGroupName || myGroupCode)} — ${mgRosterCount} member${mgRosterCount !== 1 ? 's' : ''}${seasonLabel}</div>`;
        const tableWrapId = 'lbMgGroupTable';
        groupEl.innerHTML = `<div class="lb-mg-group">${nameHtml}<div id="${tableWrapId}"></div><div id="lbMgRecap"></div><div id="lbMgWall"></div></div>`;
        if (rosterCache.code !== myGroupCode) {
          fetchRosterCount(myGroupCode).then(count => {
            if (count === null || rosterCache.code !== myGroupCode) return;
            const lbl = document.getElementById('lbMgMemberLabel');
            if (lbl) lbl.innerHTML = `${esc(myGroupName || myGroupCode)} — ${count} member${count !== 1 ? 's' : ''}${seasonLabel}`;
          });
        }
        const knownMgRoster = rosterListCache.code === myGroupCode ? rosterListCache.rows : null;
        renderTable(mergeRosterIntoUsers(groupUsers, knownMgRoster), tableWrapId, 'No picks yet in your group — share your code!');
        if (!knownMgRoster) {
          fetchRosterList(myGroupCode).then(rows => {
            if (!rows || rosterListCache.code !== myGroupCode) return;
            renderTable(mergeRosterIntoUsers(groupUsers, rows), tableWrapId, 'No picks yet in your group — share your code!');
          });
        }
        renderGroupRecap(groupUsers);
        renderGroupWall(groupUsers);
      } else {
        groupEl.innerHTML = `<div class="lb-mg-empty">
          <div class="lb-mg-empty-title">No group yet</div>
          <div class="lb-mg-empty-sub">Create or join a group to see your private standings here</div>
          <div style="display:flex;gap:10px;margin-top:12px;justify-content:center">
            <button class="lb-group-btn" id="btnMgCreate">Create Group</button>
            <button class="lb-group-btn lb-group-btn-sec" id="btnMgJoin">Join Group</button>
          </div>
        </div>`;
        document.getElementById('btnMgCreate')?.addEventListener('click', () => { document.getElementById('btnCreateGroup')?.click(); });
        document.getElementById('btnMgJoin')?.addEventListener('click',   () => { document.getElementById('btnJoinGroup')?.click(); });
      }
    }

    // ── Challenge H2H boards ──
    if (!challEl) return;
    if (!myId) {
      challEl.innerHTML = `<div class="lb-mg-empty"><div class="lb-mg-empty-title">Sign in to see your H2H challenges</div></div>`;
      return;
    }

    challEl.innerHTML = `<div class="lb-loading"><div class="lb-spinner"></div>Loading challenges…</div>`;

    sb.from('challenges')
      .select('*')
      .or(`challenger_id.eq.${myId},opponent_id.eq.${myId}`)
      .order('created_at', { ascending: false })
      .then(async ({ data: challenges, error }) => {
        if (error || !challenges?.length) {
          challEl.innerHTML = `<div class="lb-mg-empty">
            <div class="lb-mg-empty-title">No H2H challenges yet</div>
            <div class="lb-mg-empty-sub">Challenge a friend from their profile page</div>
          </div>`;
          return;
        }

        const oppIds = [...new Set(challenges.map(c => c.challenger_id === myId ? c.opponent_id : c.challenger_id))];
        const { data: oppProfiles } = await sb.from('profiles').select('id, display_name, avatar_url').in('id', oppIds);
        const oppMap2 = {};
        (oppProfiles || []).forEach(p => { oppMap2[p.id] = p; });

        // Group challenges by event for scoring
        const eventsWithResults = new Set(Object.keys(winnerMap).map(k => k.split(':')[0]));

        const toComplete = [];

        const cards = challenges.map(c => {
          const isChallenger = c.challenger_id === myId;
          const oppId   = isChallenger ? c.opponent_id : c.challenger_id;
          const opp     = oppMap2[oppId] || {};
          const oppName = opp.display_name || 'Opponent';
          const status  = c.status || 'pending';
          const evFinished = eventsWithResults.has(c.event_id);

          const initOpp  = (oppName || 'F').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
          const avatarHtml = opp.avatar_url
            ? `<img class="lb-ch-avatar" src="${esc(opp.avatar_url)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="lb-ch-avatar lb-ch-avatar-init" style="display:none">${esc(initOpp)}</div>`
            : `<div class="lb-ch-avatar lb-ch-avatar-init">${esc(initOpp)}</div>`;

          let scoreHtml = '';
          if (evFinished) {
            const myScore  = scoreUserForEvent(myId, c.event_id);
            const oppScore = scoreUserForEvent(oppId, c.event_id);
            const myWin    = myScore.pts > oppScore.pts;
            const tie      = myScore.pts === oppScore.pts;
            const verdict  = tie ? 'TIE' : myWin ? 'YOU WIN' : 'YOU LOSE';
            const verdictCls = tie ? 'lb-h2h-tie' : myWin ? 'lb-h2h-win' : 'lb-h2h-loss';
            scoreHtml = `
              <div class="lb-h2h-score">
                <div class="lb-h2h-side">
                  <div class="lb-h2h-name">You</div>
                  <div class="lb-h2h-pts${myWin ? ' lb-h2h-pts-lead' : ''}">${myScore.pts}<span class="lb-h2h-pts-sym">pts</span></div>
                  <div class="lb-h2h-acc">${myScore.correct}/${myScore.judged}</div>
                </div>
                <div class="lb-h2h-vs-col">
                  <div class="lb-h2h-verdict ${verdictCls}">${verdict}</div>
                  <div class="lb-h2h-vs-label">vs</div>
                </div>
                <div class="lb-h2h-side">
                  <div class="lb-h2h-name">${esc(oppName)}</div>
                  <div class="lb-h2h-pts${!myWin && !tie ? ' lb-h2h-pts-lead' : ''}">${oppScore.pts}<span class="lb-h2h-pts-sym">pts</span></div>
                  <div class="lb-h2h-acc">${oppScore.correct}/${oppScore.judged}</div>
                </div>
              </div>`;

            // Queue DB update if challenge is still pending
            if (status === 'pending') {
              const winner_id = tie ? null : myWin ? myId : oppId;
              toComplete.push({ id: c.id, winner_id });
            }
          } else {
            const myPickCount  = picksData.filter(p => p.user_id === myId  && p.event_id === c.event_id && p.fight_key !== '__dd__' && p.fight_key !== 'fotn').length;
            const oppPickCount = picksData.filter(p => p.user_id === oppId && p.event_id === c.event_id && p.fight_key !== '__dd__' && p.fight_key !== 'fotn').length;
            scoreHtml = `<div class="lb-h2h-picks-count">You: <strong>${myPickCount}</strong> picks locked · ${esc(oppName)}: <strong>${oppPickCount}</strong> picks locked</div>`;
          }

          const resolvedStatus = evFinished && status === 'pending' ? 'completed' : status;
          const badgeClass = resolvedStatus === 'pending' ? 'lb-ch-badge-pending' : resolvedStatus === 'completed' ? 'lb-ch-badge-done' : 'lb-ch-badge-active';
          const badgeLabel = resolvedStatus === 'pending' ? 'Pending' : resolvedStatus === 'completed' ? 'Completed' : 'Active';
          const href = `picks.html?id=${encodeURIComponent(c.event_id)}`;
          const actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-view icon-arrow">View Picks</a>`;

          return `
            <div class="lb-ch-card lb-h2h-card">
              <div class="lb-ch-card-left"><div class="lb-ch-avatar-wrap">${avatarHtml}</div></div>
              <div class="lb-ch-card-body">
                <div class="lb-ch-card-top">
                  <div class="lb-ch-opp-name">${esc(oppName)}</div>
                  <span class="lb-ch-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="lb-ch-event-name">${esc(c.event_name || c.event_id || 'Event')}</div>
                ${scoreHtml}
                <div class="lb-ch-card-foot">${actionBtn}</div>
              </div>
            </div>`;
        }).join('');

        challEl.innerHTML = `
          <div class="lb-section-label" style="margin-top:24px;margin-bottom:12px">Head-to-Head Challenges</div>
          <div class="lb-ch-list">${cards}</div>`;

        // Write completed status to DB for resolved challenges (fire-and-forget)
        toComplete.forEach(({ id, winner_id }) => {
          sb.from('challenges').update({ status: 'completed', winner_id }).eq('id', id).then(() => {}).catch(() => {});
        });
      });
  }

  // ── Modals ─────────────────────────────────────
  wireModals(myId, allUsers, profileMap);

  // Auto-join from invite link ?join=CODE
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam && !myGroupCode) {
    const codeEl = document.getElementById('joinCodeInput');
    if (codeEl) codeEl.value = joinParam.toUpperCase();
    const modalJoinEl = document.getElementById('modalJoin');
    if (modalJoinEl) modalJoinEl.style.display = 'flex';
  }

  function wireModals(myId, allUsers, profileMap) {
    function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

    // ── Leaderboard How It Works modal ──
    document.getElementById('lbHowItWorks')?.addEventListener('click', () => {
      const el = document.createElement('div');
      el.className = 'lb-modal-backdrop';
      el.id = 'lbHiwModal';
      el.innerHTML = `
        <div class="lb-modal pk-hiw-modal">
          <div class="lb-modal-header">
            <span class="lb-modal-title">How The Leaderboard Works</span>
            <button class="lb-modal-close" id="lbHiwClose">✕</button>
          </div>
          <div class="lb-modal-body pk-hiw-body">
            <div class="pk-hiw-rows">
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-cyan">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Global</div>
                  <div class="pk-hiw-sub">Every pick ever made — all-time accuracy &amp; points</div>
                </div>
              </div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-amber">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">This Month / This Week</div>
                  <div class="pk-hiw-sub">Rolling window — great for hot streaks</div>
                </div>
              </div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-amber">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">Last 10 Events</div>
                  <div class="pk-hiw-sub">Recency matters — who's been sharpest lately</div>
                </div>
              </div>
              <div class="pk-hiw-divider"></div>
              <div class="pk-hiw-row">
                <span class="pk-hiw-icon pk-hiw-gold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
                <div>
                  <div class="pk-hiw-label">My Group &amp; H2H</div>
                  <div class="pk-hiw-sub">Your private group standings + head-to-head challenge scores per event</div>
                </div>
              </div>
            </div>
            <div class="pk-hiw-max">Points: <strong>+10</strong> winner · <strong>+5</strong> method · <strong>+5</strong> round · <strong>+15</strong> FOTN &nbsp;·&nbsp; Double Down = <strong>×2</strong> or <strong>−10</strong></div>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.addEventListener('click', e => { if (e.target === el) el.remove(); });
      document.getElementById('lbHiwClose').addEventListener('click', () => el.remove());
    });

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
        const code = await genUniqueCode();
        const eventTypes = [
          document.getElementById('evtypePpv')?.checked  ? 'ppv'  : null,
          document.getElementById('evtypeFn')?.checked   ? 'fightnight' : null,
        ].filter(Boolean);
        const { error } = await sb.from('profiles').upsert({
          id: myId, group_code: code, group_name: name, group_is_owner: true,
          group_event_types: JSON.stringify(eventTypes),
        });
        if (error) throw error;
        myGroupCode = code; myGroupName = name; myGroupIsOwner = true; myGroupEventTypes = eventTypes;
        if (allUsers) allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = code; u.group_name = name; } });
        closeModal('modalCreate');
        if (nameEl) nameEl.value = '';
        renderGroupStatus();
        window.LucasMoments?.groupWelcome(name);
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
        const { data: groupData } = await sb.from('profiles').select('group_name, group_season_start, group_season_end').eq('group_code', code).limit(1);
        const groupName = groupData?.[0]?.group_name || null;
        const seasonStart = groupData?.[0]?.group_season_start || null;
        const seasonEnd = groupData?.[0]?.group_season_end || null;
        const { error } = await sb.from('profiles').upsert({ id: myId, group_code: code, group_name: groupName, group_is_owner: false, group_season_start: seasonStart, group_season_end: seasonEnd });
        if (error) throw error;
        myGroupCode = code; myGroupName = groupName; myGroupIsOwner = false; myGroupSeasonStart = seasonStart; myGroupSeasonEnd = seasonEnd;
        if (allUsers) allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = code; u.group_name = groupName; } });
        closeModal('modalJoin');
        if (codeEl) codeEl.value = '';
        renderGroupStatus();
        window.LucasMoments?.groupWelcome(groupName || 'the group');
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
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-accept icon-arrow">Accept &amp; Pick</a>`;
      } else if (status === 'completed') {
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-result icon-arrow">See Result</a>`;
      } else {
        actionBtn = `<a href="${href}" class="lb-ch-btn lb-ch-btn-view icon-arrow">View Picks</a>`;
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

})();
