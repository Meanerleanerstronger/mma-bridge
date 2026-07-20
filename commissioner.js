// ==============================================
// MMA BRIDGE — COMMISSIONER DASHBOARD
// One page where a group's commissioner (group_is_owner: true) can see
// and use every power they have — roster, team name, scoring rules,
// per-event overrides, and pick-timing integrity — without hunting
// through the leaderboard page. Requires Supabase profiles columns:
//   group_code, group_name, group_is_owner, group_season_start,
//   group_event_types, group_excluded_events (all TEXT/BOOLEAN, see below)
// Run in Supabase SQL editor if missing:
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_excluded_events TEXT;
// ==============================================
(async function () {

  const root = document.getElementById('cxRoot');
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

  function eventTypeOf(e) {
    if (/contender series/i.test(e.name || '')) return 'dwcs';
    if (e.type === 'PPV') return 'ppv';
    if (e.type === 'FIGHT NIGHT') return 'fightnight';
    return null;
  }
  function eventTypeLabel(t) {
    return t === 'ppv' ? 'PPV' : t === 'fightnight' ? 'Fight Night' : t === 'dwcs' ? 'Contender Series' : '';
  }

  root.innerHTML = `
    <div class="cx-loading" id="cxLoading">
      <div class="cx-loading-bar"></div>
      <p>Loading your dashboard…</p>
    </div>`;

  const user = await waitForAuth();
  const myId = user?.id || null;

  if (!sb || !myId) {
    root.innerHTML = `
      <div class="cx-empty-state">
        <div class="cx-empty-title">Sign in to manage your group</div>
        <a class="cx-empty-link" href="leaderboard.html">Go to Leaderboard →</a>
      </div>`;
    return;
  }

  const { data: prof } = await sb
    .from('profiles')
    .select('id, display_name, group_code, group_name, group_is_owner, group_season_start, group_event_types, group_excluded_events')
    .eq('id', myId)
    .single();

  if (!prof || !prof.group_code || prof.group_is_owner !== true) {
    root.innerHTML = `
      <div class="cx-empty-state">
        <div class="cx-empty-title">${!prof?.group_code ? "You're not in a group yet" : 'Only the commissioner of a group can access this page'}</div>
        <p class="cx-empty-sub">${!prof?.group_code ? 'Create or join a group from the leaderboard to get started.' : `Ask ${'your group\'s commissioner'} to make changes, or create your own group to become one.`}</p>
        <a class="cx-empty-link" href="leaderboard.html">Go to Leaderboard →</a>
      </div>`;
    return;
  }

  let groupCode = prof.group_code;
  let groupName = prof.group_name || 'My Group';
  let seasonStart = prof.group_season_start || null;
  let eventTypes = (() => {
    try { const v = JSON.parse(prof.group_event_types || 'null'); return Array.isArray(v) && v.length ? v : ['ppv', 'fightnight']; }
    catch { return ['ppv', 'fightnight']; }
  })();
  let excludedEvents = (() => {
    try { const v = JSON.parse(prof.group_excluded_events || 'null'); return Array.isArray(v) ? v : []; }
    catch { return []; }
  })();

  // Load group members
  const { data: memberRows } = await sb
    .from('profiles')
    .select('id, display_name, avatar_url, group_code')
    .eq('group_code', groupCode);
  let members = (memberRows || []).map(m => ({ id: m.id, name: m.display_name || 'Anonymous', avatar: m.avatar_url || null }));

  const allEventsRaw = await fetch('./events.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => []);
  const _cv = Date.now();

  function memberIds() { return members.map(m => m.id); }

  async function updateGroupAll(fields) {
    await sb.from('profiles').update(fields).in('id', memberIds());
  }

  // ── Render shell ─────────────────────────────
  function render() {
    root.innerHTML = `
      <div class="cx-hero">
        <a class="cx-back" href="leaderboard.html">← Leaderboard</a>
        <div class="cx-hero-top">
          <div>
            <div class="cx-eyebrow">Commissioner Dashboard</div>
            <h1 class="cx-title">${esc(groupName)}</h1>
            <div class="cx-hero-meta"><span>${members.length}</span> member${members.length !== 1 ? 's' : ''} · code <span class="cx-code">${esc(groupCode)}</span></div>
          </div>
          <button class="cx-copy-btn" id="cxCopyInvite">📋 Copy Invite Link</button>
        </div>
        <div class="cx-power-strip">
          <span class="cx-power-lbl">What you can do here:</span>
          <a href="#cxRoster" class="cx-power-chip">Add / Remove Players</a>
          <a href="#cxTeam" class="cx-power-chip">Rename Team</a>
          <a href="#cxScoring" class="cx-power-chip">Season &amp; Scoring</a>
          <a href="#cxEvents" class="cx-power-chip">Exclude an Event</a>
          <a href="#cxFair" class="cx-power-chip">Pick-Timing Check</a>
        </div>
      </div>

      <div class="cx-grid">

        <section class="cx-card" id="cxRoster">
          <div class="cx-card-head">
            <h2>Roster</h2>
            <p>Add players directly — no invite code needed — or remove someone from the group.</p>
          </div>
          <div class="cx-add-row">
            <input type="text" class="cx-input" id="cxAddSearch" placeholder="Search by display name…" autocomplete="off" />
          </div>
          <div class="cx-add-results" id="cxAddResults"></div>
          <div class="cx-roster-list" id="cxRosterList">
            ${members.map(m => `
              <div class="cx-roster-row" data-uid="${esc(m.id)}">
                <div class="cx-roster-user">
                  ${m.avatar ? `<img class="cx-roster-avatar" src="${esc(m.avatar)}" alt="">` : `<div class="cx-roster-avatar cx-roster-avatar-init">${esc((m.name || 'A')[0].toUpperCase())}</div>`}
                  <span>${esc(m.name)}${m.id === myId ? ' <em>(you, commissioner)</em>' : ''}</span>
                </div>
                ${m.id !== myId ? `<button class="cx-danger-btn" data-remove="${esc(m.id)}" data-name="${esc(m.name)}">Remove</button>` : ''}
              </div>`).join('')}
          </div>
        </section>

        <section class="cx-card" id="cxTeam">
          <div class="cx-card-head">
            <h2>Team Name</h2>
            <p>Renames the group for every member, everywhere it shows.</p>
          </div>
          <div class="cx-add-row">
            <input type="text" class="cx-input" id="cxTeamNameInput" value="${esc(groupName)}" maxlength="40" autocomplete="off" />
            <button class="cx-primary-btn" id="cxSaveTeamName">Save</button>
          </div>
        </section>

        <section class="cx-card" id="cxScoring">
          <div class="cx-card-head">
            <h2>Season &amp; Scoring</h2>
            <p>Control what counts toward your group's standings.</p>
          </div>
          <label class="cx-label">Season Start Date</label>
          <div class="cx-add-row">
            <input type="date" class="cx-input" id="cxSeasonDate" value="${seasonStart ? seasonStart.slice(0,10) : new Date().toISOString().slice(0,10)}" />
            <button class="cx-primary-btn" id="cxSaveSeason">Set Season</button>
          </div>
          <div class="cx-hint">Only picks made after this date count in your group standings.</div>

          <label class="cx-label" style="margin-top:18px">Which Event Types Count</label>
          <div class="lb-evtype-row">
            <label class="lb-evtype-opt"><input type="checkbox" id="cxTypePpv" ${eventTypes.includes('ppv') ? 'checked' : ''}> <span>PPV <em>(UFC 333, etc.)</em></span></label>
            <label class="lb-evtype-opt"><input type="checkbox" id="cxTypeFn" ${eventTypes.includes('fightnight') ? 'checked' : ''}> <span>Fight Night</span></label>
            <label class="lb-evtype-opt"><input type="checkbox" id="cxTypeDwcs" ${eventTypes.includes('dwcs') ? 'checked' : ''}> <span>Contender Series</span></label>
          </div>
          <button class="cx-primary-btn" id="cxSaveTypes">Save Event Types</button>
        </section>

        <section class="cx-card" id="cxEvents">
          <div class="cx-card-head">
            <h2>Event Overrides</h2>
            <p>Search any event and pull it out of your group's scoring — the site-wide event and every other group are untouched. Use this for a bad data entry, a cancelled card, or anything you don't want counted.</p>
          </div>
          <input type="text" class="cx-input" id="cxEventSearch" placeholder="Search events by name…" autocomplete="off" />
          <div class="cx-event-list" id="cxEventList"></div>
        </section>

        <section class="cx-card cx-card-wide" id="cxFair">
          <div class="cx-card-head">
            <h2>Pick-Timing Check</h2>
            <p>Raw timing only — how close each pick was submitted to lock, for completed events. This is <strong>not proof of anything</strong> (fast internet, habit, and notifications all produce close-to-lock picks too) — it just gives you the facts if you suspect something and want to look closer.</p>
          </div>
          <div class="cx-fair-list" id="cxFairList">
            <div class="cx-hint">Loading pick timing…</div>
          </div>
        </section>

        <section class="cx-card cx-card-soon">
          <div class="cx-card-head">
            <h2>Coming Soon</h2>
            <p>Not built yet — flagging so you know the current limits of this page.</p>
          </div>
          <ul class="cx-soon-list">
            <li>CSV export of member stats</li>
            <li>Season reset (archive standings, start fresh)</li>
            <li>Transfer commissioner role to someone else</li>
          </ul>
        </section>

      </div>`;

    wireEvents();
    renderEventList('');
    loadFairPlay();
  }

  // ── Roster: add player search ────────────────
  let addSearchTimer = null;
  function wireEvents() {
    document.getElementById('cxCopyInvite')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(`${location.origin}/leaderboard.html?join=${groupCode}`).catch(() => {});
      const btn = document.getElementById('cxCopyInvite');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { if (btn) btn.textContent = orig; }, 2000);
    });

    document.getElementById('cxAddSearch')?.addEventListener('input', e => {
      clearTimeout(addSearchTimer);
      const q = e.target.value.trim();
      const box = document.getElementById('cxAddResults');
      if (!q) { box.innerHTML = ''; return; }
      addSearchTimer = setTimeout(async () => {
        const { data } = await sb.from('profiles')
          .select('id, display_name, avatar_url, group_code')
          .ilike('display_name', `%${q}%`)
          .limit(8);
        const results = (data || []).filter(u => u.id !== myId && !memberIds().includes(u.id));
        box.innerHTML = results.length ? results.map(u => `
          <div class="cx-add-result-row">
            <span>${esc(u.display_name || 'Anonymous')}${u.group_code ? ' <em>(already in a group)</em>' : ''}</span>
            <button class="cx-primary-btn cx-add-btn" data-add="${esc(u.id)}" data-name="${esc(u.display_name || 'Anonymous')}" data-hasgroup="${u.group_code ? '1' : ''}">Add</button>
          </div>`).join('') : '<div class="cx-hint">No matching players</div>';
      }, 250);
    });

    document.getElementById('cxAddResults')?.addEventListener('click', async e => {
      const btn = e.target.closest('.cx-add-btn');
      if (!btn) return;
      const uid = btn.dataset.add, uname = btn.dataset.name;
      if (btn.dataset.hasgroup && btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1'; btn.textContent = 'Move them — confirm?';
        setTimeout(() => { if (btn) { btn.dataset.confirm = ''; btn.textContent = 'Add'; } }, 3000);
        return;
      }
      btn.disabled = true; btn.textContent = 'Adding…';
      await sb.from('profiles').update({
        group_code: groupCode, group_name: groupName, group_is_owner: false,
        group_season_start: seasonStart, group_event_types: JSON.stringify(eventTypes),
        group_excluded_events: JSON.stringify(excludedEvents)
      }).eq('id', uid);
      members.push({ id: uid, name: uname, avatar: null });
      document.getElementById('cxAddSearch').value = '';
      render();
    });

    document.getElementById('cxRosterList')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      const uid = btn.dataset.remove;
      if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1'; btn.textContent = 'Confirm?';
        setTimeout(() => { if (btn) { btn.dataset.confirm = ''; btn.textContent = 'Remove'; } }, 3000);
        return;
      }
      btn.disabled = true;
      await sb.from('profiles').update({ group_code: null, group_name: null, group_is_owner: false }).eq('id', uid);
      members = members.filter(m => m.id !== uid);
      render();
    });

    document.getElementById('cxSaveTeamName')?.addEventListener('click', async () => {
      const val = document.getElementById('cxTeamNameInput')?.value.trim();
      if (!val) return;
      const btn = document.getElementById('cxSaveTeamName');
      btn.textContent = 'Saving…'; btn.disabled = true;
      groupName = val;
      await updateGroupAll({ group_name: groupName });
      render();
    });

    document.getElementById('cxSaveSeason')?.addEventListener('click', async () => {
      const val = document.getElementById('cxSeasonDate')?.value;
      if (!val) return;
      const btn = document.getElementById('cxSaveSeason');
      btn.textContent = 'Saving…'; btn.disabled = true;
      seasonStart = val;
      await updateGroupAll({ group_season_start: seasonStart });
      render();
    });

    document.getElementById('cxSaveTypes')?.addEventListener('click', async () => {
      const btn = document.getElementById('cxSaveTypes');
      btn.textContent = 'Saving…'; btn.disabled = true;
      eventTypes = [
        document.getElementById('cxTypePpv')?.checked  ? 'ppv'  : null,
        document.getElementById('cxTypeFn')?.checked   ? 'fightnight' : null,
        document.getElementById('cxTypeDwcs')?.checked ? 'dwcs' : null,
      ].filter(Boolean);
      if (!eventTypes.length) eventTypes = ['ppv', 'fightnight'];
      await updateGroupAll({ group_event_types: JSON.stringify(eventTypes) });
      render();
    });

    document.getElementById('cxEventSearch')?.addEventListener('input', e => renderEventList(e.target.value.trim()));
  }

  function renderEventList(q) {
    const box = document.getElementById('cxEventList');
    if (!box) return;
    const ql = q.toLowerCase();
    const matches = allEventsRaw
      .filter(e => !ql || (e.name || '').toLowerCase().includes(ql))
      .sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0))
      .slice(0, ql ? 25 : 8);

    if (!matches.length) { box.innerHTML = '<div class="cx-hint">No events found</div>'; return; }

    box.innerHTML = matches.map(e => {
      const isExcluded = excludedEvents.includes(e.id);
      const typeTag = eventTypeLabel(eventTypeOf(e));
      const dateStr = e.start_time ? new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return `
        <div class="cx-event-row">
          <div class="cx-event-info">
            <span class="cx-event-name">${esc(e.name)}</span>
            <span class="cx-event-meta">${esc(dateStr)}${typeTag ? ` · ${esc(typeTag)}` : ''} · ${esc(e.status || '')}</span>
          </div>
          <label class="cx-toggle">
            <input type="checkbox" data-evtoggle="${esc(e.id)}" ${isExcluded ? '' : 'checked'}>
            <span class="cx-toggle-track"><span class="cx-toggle-thumb"></span></span>
            <span class="cx-toggle-lbl">${isExcluded ? 'Excluded' : 'Counts'}</span>
          </label>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-evtoggle]').forEach(cb => {
      cb.addEventListener('change', async () => {
        const eid = cb.dataset.evtoggle;
        if (cb.checked) excludedEvents = excludedEvents.filter(x => x !== eid);
        else if (!excludedEvents.includes(eid)) excludedEvents.push(eid);
        await updateGroupAll({ group_excluded_events: JSON.stringify(excludedEvents) });
        renderEventList(document.getElementById('cxEventSearch')?.value.trim() || '');
      });
    });
  }

  // ── Fair play / pick timing ──────────────────
  async function loadFairPlay() {
    const box = document.getElementById('cxFairList');
    if (!box) return;

    const completedEvents = allEventsRaw.filter(e => e.status === 'completed' && e.start_time);
    if (!completedEvents.length || !members.length) {
      box.innerHTML = '<div class="cx-hint">No completed events yet.</div>';
      return;
    }
    const eventById = {};
    completedEvents.forEach(e => { eventById[e.id] = e; });

    const { data: picksRows } = await sb.from('picks')
      .select('user_id, event_id, created_at')
      .in('user_id', memberIds())
      .in('event_id', completedEvents.map(e => e.id))
      .not('created_at', 'is', null);

    const memberName = {};
    members.forEach(m => { memberName[m.id] = m.name; });

    const rows = (picksRows || []).map(p => {
      const ev = eventById[p.event_id];
      if (!ev) return null;
      const lockMs = new Date(ev.start_time).getTime();
      const pickMs = new Date(p.created_at).getTime();
      const minsBefore = (lockMs - pickMs) / 60000;
      if (!isFinite(minsBefore)) return null;
      return { uid: p.user_id, name: memberName[p.user_id] || 'Unknown', event: ev.name, minsBefore };
    }).filter(Boolean);

    if (!rows.length) { box.innerHTML = '<div class="cx-hint">No timestamped picks found yet.</div>'; return; }

    // Closest-to-lock first — most informative if you're checking for a pattern.
    rows.sort((a, b) => a.minsBefore - b.minsBefore);
    const top = rows.slice(0, 25);

    box.innerHTML = `
      <div class="cx-fair-table">
        <div class="cx-fair-head">
          <span>Player</span><span>Event</span><span>Time Before Lock</span>
        </div>
        ${top.map(r => {
          const tight = r.minsBefore < 2;
          const mins = r.minsBefore < 0 ? 'after lock' : r.minsBefore < 1 ? `${Math.round(r.minsBefore * 60)}s` : `${Math.round(r.minsBefore)}m`;
          return `
            <div class="cx-fair-row${tight ? ' cx-fair-tight' : ''}">
              <span>${esc(r.name)}</span>
              <span class="cx-fair-event">${esc(r.event)}</span>
              <span class="cx-fair-mins">${esc(mins)}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  render();
})();
