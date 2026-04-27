// ==============================================
// MMA BRIDGE — LEADERBOARD
// ==============================================
(async function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const root = document.getElementById('lbRoot');
  const sb   = window._sb;

  root.innerHTML = `
    <div class="lb-hero">
      <h1 class="lb-title">Community<br><span>Leaderboard</span></h1>
      <p class="lb-subtitle">Most active reviewers in the MMA Bridge community</p>
    </div>
    <div class="lb-wrap">
      <div class="lb-tabs">
        <button class="lb-tab active" data-tab="rated">Most Active</button>
        <button class="lb-tab" data-tab="avg">Highest Avg Rating</button>
      </div>
      <div class="lb-table-wrap" id="lbTableWrap">
        <div class="lb-loading">
          <div class="lb-spinner"></div>
          Loading community stats…
        </div>
      </div>
    </div>`;

  if (!sb) {
    document.getElementById('lbTableWrap').innerHTML =
      `<div class="lb-error">Community data unavailable.</div>`;
    return;
  }

  // ── Fetch all ratings with joined profile ─────
  const { data, error } = await sb
    .from('ratings')
    .select('user_id, hype_rating, profiles(display_name, avatar_url)');

  if (error || !data) {
    document.getElementById('lbTableWrap').innerHTML =
      `<div class="lb-error">Could not load leaderboard data.</div>`;
    return;
  }

  // ── Aggregate by user ─────────────────────────
  const userMap = {};
  data.forEach(r => {
    if (!r.user_id) return;
    if (!userMap[r.user_id]) {
      userMap[r.user_id] = {
        user_id:      r.user_id,
        display_name: r.profiles?.display_name || 'Anonymous',
        avatar_url:   r.profiles?.avatar_url   || '',
        count:        0,
        total:        0,
      };
    }
    userMap[r.user_id].count++;
    userMap[r.user_id].total += Number(r.hype_rating) || 0;
  });

  const users = Object.values(userMap).map(u => ({
    ...u,
    avg: u.count > 0 ? (u.total / u.count).toFixed(1) : '—',
  }));

  // ── Current user id for highlight ────────────
  const myId = window.MMABridgeAuth?.getUser()?.id || null;

  let activeTab = 'rated';

  function renderTable(tab) {
    activeTab = tab;
    const sorted = [...users].sort((a, b) =>
      tab === 'rated'
        ? b.count - a.count
        : parseFloat(b.avg) - parseFloat(a.avg)
    );

    if (!sorted.length) {
      document.getElementById('lbTableWrap').innerHTML =
        `<div class="lb-error">No ratings yet — be the first to review an event!</div>`;
      return;
    }

    const rows = sorted.map((u, i) => {
      const pos   = i + 1;
      const isMe  = u.user_id === myId;
      const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}`;
      const initials = (u.display_name || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      const avatarHtml = u.avatar_url
        ? `<img class="lb-avatar" src="${esc(u.avatar_url)}" alt="${esc(u.display_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="lb-avatar lb-avatar-init" style="display:none">${esc(initials)}</div>`
        : `<div class="lb-avatar lb-avatar-init">${esc(initials)}</div>`;

      return `
        <div class="lb-row${isMe ? ' lb-row-me' : ''}${pos <= 3 ? ' lb-row-top' : ''}">
          <div class="lb-pos">${medal}</div>
          <div class="lb-user">
            <div class="lb-avatar-wrap">${avatarHtml}</div>
            <div class="lb-name">${esc(u.display_name)}${isMe ? ' <span class="lb-you">you</span>' : ''}</div>
          </div>
          <div class="lb-stat">
            <div class="lb-stat-val">${u.count}</div>
            <div class="lb-stat-lbl">reviewed</div>
          </div>
          <div class="lb-stat">
            <div class="lb-stat-val lb-avg">★ ${u.avg}</div>
            <div class="lb-stat-lbl">avg score</div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('lbTableWrap').innerHTML =
      `<div class="lb-table">${rows}</div>`;
  }

  // ── Tab switching ─────────────────────────────
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderTable(btn.dataset.tab);
    });
  });

  renderTable('rated');

})();
