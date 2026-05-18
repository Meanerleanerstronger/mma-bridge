// ==============================================
// MMA BRIDGE — CHALLENGE SYSTEM
// ==============================================
(async function () {
  'use strict';

  const sb = window._sb;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ── Get current user ─────────────────────────
  async function getMe() {
    if (!sb) return null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      return session?.user || null;
    } catch { return null; }
  }

  // ── Nav badge — pending challenges for me ────
  async function initBadge() {
    if (!sb) return;
    const me = await getMe();
    if (!me) return;
    try {
      const { data } = await sb.from('challenges')
        .select('id, challenger_id, event_id, event_name')
        .eq('opponent_id', me.id)
        .eq('status', 'pending');
      if (!data?.length) return;
      renderBadge(data.length, data);
    } catch {}
  }

  let badgePopoverOpen = false;

  function renderBadge(count, challenges) {
    const link = document.querySelector('.nav-links a[href="leaderboard.html"]');
    if (!link) return;
    link.style.position = 'relative';

    let badge = document.getElementById('ch-nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'ch-nav-badge';
      badge.className = 'ch-nav-badge';
      link.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : count;

    // Click badge → show popover with pending challenges
    badge.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (badgePopoverOpen) { closePopover(); return; }
      showChallengePopover(challenges);
    });
  }

  function showChallengePopover(challenges) {
    document.getElementById('ch-popover')?.remove();
    const pop = document.createElement('div');
    pop.id = 'ch-popover';
    pop.className = 'ch-popover';
    pop.innerHTML = `
      <div class="ch-pop-header">Pending Challenges</div>
      ${challenges.map(c => `
        <div class="ch-pop-row">
          <div class="ch-pop-info">
            <div class="ch-pop-event">${esc(c.event_name || c.event_id)}</div>
            <div class="ch-pop-label">Someone challenged you</div>
          </div>
          <a class="ch-pop-btn" href="picks.html?id=${encodeURIComponent(c.event_id)}">Pick Now →</a>
        </div>`).join('')}
    `;
    const badge = document.getElementById('ch-nav-badge');
    badge?.parentElement?.appendChild(pop);
    badgePopoverOpen = true;

    setTimeout(() => {
      document.addEventListener('click', closePopoverOnOutside, { once: true });
    }, 0);
  }

  function closePopover() {
    document.getElementById('ch-popover')?.remove();
    badgePopoverOpen = false;
  }

  function closePopoverOnOutside(e) {
    if (!document.getElementById('ch-popover')?.contains(e.target)) {
      closePopover();
    }
  }

  // ── Challenge modal (event picker) ───────────
  let onEscFn = null;

  window.openChallengeModal = async function (opponentId, opponentName) {
    if (!sb) return;
    const me = await getMe();
    if (!me) {
      sessionStorage.setItem('auth_return_to', location.href);
      location.href = 'auth.html';
      return;
    }
    if (me.id === opponentId) return;

    // Load upcoming events
    let eventsData = [];
    try { eventsData = await fetch('events.json').then(r => r.json()); } catch {}
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = (eventsData || []).filter(e =>
      e.status !== 'completed' && e.isoDate && new Date(e.isoDate) >= today
    );

    document.getElementById('ch-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ch-modal';
    modal.className = 'ch-backdrop';
    modal.innerHTML = `
      <div class="ch-panel">
        <button class="ch-close" id="ch-close">✕</button>
        <div class="ch-eyebrow">Head-to-Head</div>
        <h2 class="ch-title">Challenge <span>${esc(opponentName)}</span></h2>
        <p class="ch-sub">Pick an upcoming event to go head-to-head on. You'll both make your picks and see who called it better.</p>
        <div class="ch-events" id="ch-events">
          ${!upcoming.length ? '<div class="ch-no-events">No upcoming events at the moment</div>' : ''}
        </div>
        <div class="ch-status" id="ch-status" style="display:none"></div>
      </div>`;
    document.body.appendChild(modal);
    document.body.classList.add('no-scroll');

    // Populate events
    const list = document.getElementById('ch-events');
    upcoming.forEach(ev => {
      const evId = ev.id || slugify(ev.name || ev.eventName || '');
      const d = new Date(ev.isoDate + 'T00:00:00');
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const btn = document.createElement('button');
      btn.className = 'ch-ev-btn';
      btn.innerHTML = `
        ${ev.poster
          ? `<img class="ch-ev-img" src="${esc(ev.poster)}" alt="" loading="lazy">`
          : `<div class="ch-ev-img ch-ev-img-ph"></div>`}
        <div class="ch-ev-info">
          <div class="ch-ev-name">${esc(ev.name || ev.eventName || '')}</div>
          <div class="ch-ev-date">${dateStr}${ev.location ? ' · ' + ev.location : ''}</div>
        </div>
        <svg class="ch-ev-arrow" width="7" height="12" viewBox="0 0 7 12" fill="none">
          <polyline points="1,1 6,6 1,11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      btn.addEventListener('click', () =>
        sendChallenge(me.id, opponentId, opponentName, evId, ev.name || ev.eventName || '')
      );
      list.appendChild(btn);
    });

    document.getElementById('ch-close').onclick = closeModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    onEscFn = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onEscFn);
  };

  function closeModal() {
    document.getElementById('ch-modal')?.remove();
    document.body.classList.remove('no-scroll');
    if (onEscFn) { document.removeEventListener('keydown', onEscFn); onEscFn = null; }
  }

  async function sendChallenge(myId, oppId, oppName, evId, evName) {
    const statusEl = document.getElementById('ch-status');
    statusEl.style.display = 'block';
    statusEl.textContent = 'Sending challenge…';
    statusEl.className = 'ch-status';
    document.querySelectorAll('.ch-ev-btn').forEach(b => { b.disabled = true; });

    try {
      const { error } = await sb.from('challenges').upsert({
        challenger_id: myId,
        opponent_id:   oppId,
        event_id:      evId,
        event_name:    evName,
        status:        'pending',
      }, { onConflict: 'challenger_id,opponent_id,event_id' });
      if (error) throw error;

      statusEl.textContent = `Challenge sent! Taking you to make your picks…`;
      statusEl.classList.add('ch-ok');
      setTimeout(() => {
        closeModal();
        location.href = `picks.html?id=${encodeURIComponent(evId)}`;
      }, 1300);
    } catch {
      statusEl.textContent = 'Could not send challenge — try again.';
      statusEl.classList.add('ch-err');
      document.querySelectorAll('.ch-ev-btn').forEach(b => { b.disabled = false; });
    }
  }

  // expose for leaderboard/other pages
  window.MMAChallenge = { open: window.openChallengeModal };

  initBadge();
})();
