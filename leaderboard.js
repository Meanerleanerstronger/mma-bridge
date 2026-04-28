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
      <p class="lb-subtitle">Who's made the most fight picks on MMA Bridge</p>
    </div>
    <div class="lb-wrap">

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

  // Wait for auth, then load data with two simple queries (no fragile FK joins)
  const user = await waitForAuth();
  const myId = user?.id || null;

  if (!sb) {
    document.getElementById('lbGlobalWrap').innerHTML =
      `<div class="lb-error">Could not connect to database.</div>`;
    wireModals(null, null, null);
    return;
  }

  // Query 1: all picks (just user_id, no joins)
  const { data: picksData, error: picksErr } = await sb.from('picks').select('user_id');

  if (picksErr || !picksData) {
    document.getElementById('lbGlobalWrap').innerHTML =
      `<div class="lb-error">Could not load picks data.</div>`;
    wireModals(null, null, null);
    return;
  }

  // Count picks per user
  const countMap = {};
  picksData.forEach(r => {
    if (r.user_id) countMap[r.user_id] = (countMap[r.user_id] || 0) + 1;
  });
  const rankedIds = Object.keys(countMap);

  // Query 2: profiles for users who have picks (plus current user even if 0 picks)
  const profileIds = myId && !rankedIds.includes(myId) ? [...rankedIds, myId] : rankedIds;

  let profilesData = [];
  if (profileIds.length > 0) {
    const { data: pData } = await sb
      .from('profiles')
      .select('id, display_name, avatar_url, group_code, group_name')
      .in('id', profileIds);
    profilesData = pData || [];
  }

  // Build profile lookup
  const profileMap = {};
  profilesData.forEach(p => { profileMap[p.id] = p; });

  // Build sorted user list
  const allUsers = rankedIds.map(uid => {
    const p = profileMap[uid] || {};
    return {
      user_id:    uid,
      name:       p.display_name || 'Anonymous',
      avatar:     p.avatar_url   || '',
      group_code: p.group_code   || null,
      group_name: p.group_name   || null,
      count:      countMap[uid]  || 0,
    };
  }).sort((a, b) => b.count - a.count);

  const myProfile    = myId ? (profileMap[myId] || {}) : {};
  let myGroupCode    = myProfile.group_code || null;
  let myGroupName    = myProfile.group_name || null;

  // ── Render a leaderboard table ─────────────────
  function renderTable(users, wrapId, emptyMsg) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;

    if (!users.length) {
      wrap.innerHTML = `<div class="lb-error">${esc(emptyMsg || 'No picks yet.')}</div>`;
      return;
    }

    const rows = users.map((u, i) => {
      const pos   = i + 1;
      const isMe  = u.user_id === myId;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}`;
      const init  = (u.name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarHtml = u.avatar
        ? `<img class="lb-avatar" src="${esc(u.avatar)}" alt="${esc(u.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="lb-avatar lb-avatar-init" style="display:none">${esc(init)}</div>`
        : `<div class="lb-avatar lb-avatar-init">${esc(init)}</div>`;

      return `
        <div class="lb-row${isMe ? ' lb-row-me' : ''}${pos <= 3 ? ' lb-row-top' : ''}">
          <div class="lb-pos">${medal}</div>
          <div class="lb-user">
            <div class="lb-avatar-wrap">${avatarHtml}</div>
            <div class="lb-name">${esc(u.name)}${isMe ? ' <span class="lb-you">you</span>' : ''}</div>
          </div>
          <div class="lb-stat">
            <div class="lb-stat-val">${u.count}</div>
            <div class="lb-stat-lbl">picks</div>
          </div>
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
      if (!confirm('Leave this group?')) return;
      try {
        await sb.from('profiles').update({ group_code: null, group_name: null }).eq('id', myId);
        myGroupCode = null; myGroupName = null;
        allUsers.forEach(u => { if (u.user_id === myId) { u.group_code = null; u.group_name = null; } });
        renderGroupStatus();
      } catch { alert('Could not leave group. Try again.'); }
    });
  }

  if (location.hash === '#groups') {
    setTimeout(() => document.getElementById('lbGroups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  renderTable(allUsers, 'lbGlobalWrap', 'No picks yet — be the first!');
  renderGroupStatus();

  // ── Modals ─────────────────────────────────────
  wireModals(myId, allUsers, profileMap);

  function wireModals(myId, allUsers, profileMap) {
    function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
    function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

    document.getElementById('btnCreateGroup')?.addEventListener('click', () => {
      if (!myId) { alert('Sign in to create a group.'); return; }
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
      } catch (err) {
        if (errEl) errEl.textContent = err?.message?.includes('column')
          ? 'DB missing group columns — run SQL migration from leaderboard.js header.'
          : 'Could not create group. Make sure you are signed in.';
      } finally { if (btn) { btn.textContent = 'Create Group'; btn.disabled = false; } }
    });

    document.getElementById('btnJoinGroup')?.addEventListener('click', () => {
      if (!myId) { alert('Sign in to join a group.'); return; }
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
      const href = `picks.html?event=${encodeURIComponent(c.event_id)}&challenge=${encodeURIComponent(c.id)}`;
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

})();
