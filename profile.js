// ==============================================
// MMA BRIDGE — USER PROFILE PAGE
// ==============================================

(async function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const diff  = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    if (mins < 2)    return 'just now';
    if (mins < 60)   return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days < 30)   return `${days}d ago`;
    if (months < 12) return `${months}mo ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  function memberSince(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const root = document.getElementById('profileRoot');

  // ── Wait for auth to be ready ─────────────────
  function waitForAuth(timeout = 4000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const auth = window.MMABridgeAuth;
        const user = auth?.getUser?.();
        if (user || Date.now() - start > timeout) {
          resolve(user || null);
        } else {
          setTimeout(check, 80);
        }
      };
      check();
    });
  }

  const user = await waitForAuth();

  if (!user) {
    root.innerHTML = `
      <div class="pr-sign-in-prompt">
        <div class="pr-icon">🥊</div>
        <h2>Sign in to see your profile</h2>
        <p>Track your ratings, predict Fight of the Night, and build your fighter favourites list.</p>
        <a href="auth.html" class="pr-sign-in-btn">Sign In / Sign Up</a>
      </div>`;
    return;
  }

  const sb = window._sb;

  // ── Load data in parallel ─────────────────────
  const [ratingsResult, eventsResult, fightersResult] = await Promise.all([
    sb.from('ratings')
      .select('id, event_id, event_name, hype_rating, review_text, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    fetch('./events.json').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json').then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  const ratings  = ratingsResult.data || [];
  const events   = Array.isArray(eventsResult) ? eventsResult : [];
  const fighters = Array.isArray(fightersResult) ? fightersResult : [];

  // ── Build event lookup by id ──────────────────
  const eventMap = {};
  events.forEach(ev => {
    const id = ev.id || slugify(ev.name || ev.eventName || '');
    eventMap[id] = ev;
  });

  // ── Favourite fighters (localStorage) ─────────
  const FAVS_KEY = 'mmab_favs';
  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY)) || []; } catch { return []; }
  }

  // Build a quick id → fighter lookup for the push module
  const fighterById = {};
  fighters.forEach(f => { if (f.id) fighterById[f.id] = f; });

  function saveFavs(ids) {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(ids)); } catch {}
    // Keep push subscription in sync with current fav list
    window.MMABridgePush?.updateFavFighters(ids, fighterById).catch?.(() => {});
  }

  // ── Compute stats ─────────────────────────────
  const totalRatings = ratings.length;
  const avgRating = totalRatings
    ? (ratings.reduce((s, r) => s + Number(r.hype_rating), 0) / totalRatings).toFixed(1)
    : '—';


  // ── Stars HTML ────────────────────────────────
  function starsHtml(rating) {
    return [1, 2, 3, 4, 5].map(n =>
      `<span class="pr-star${rating >= n ? ' lit' : ''}">★</span>`
    ).join('');
  }

  // ── Render ────────────────────────────────────
  renderProfile();

  function renderProfile() {
    const initials = (user.display_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarHtml = user.avatar_url
      ? `<img class="pr-avatar-img" src="${esc(user.avatar_url)}" alt="${esc(user.display_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="pr-avatar-initials" style="display:none">${esc(initials)}</div>`
      : `<div class="pr-avatar-initials">${esc(initials)}</div>`;

    root.innerHTML = `
      <!-- HERO -->
      <div class="pr-hero">
        <div class="pr-hero-bg"></div>
        <a href="javascript:history.back()" class="pr-back">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><polyline points="6,1 1,6 6,11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </a>
        <div class="pr-hero-inner">
          <div class="pr-avatar-wrap">
            <div class="pr-avatar-ring">${avatarHtml}</div>
          </div>
          <div class="pr-info">
            <div class="pr-label">Fighter Profile</div>
            <h1 class="pr-name">${esc(user.display_name || 'Fighter')}</h1>
            <div class="pr-meta-row">
              <span class="pr-meta-item">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Member since ${memberSince(user.created_at || new Date().toISOString())}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- STATS -->
      <div class="pr-stats">
        <div class="pr-stats-inner">
          <div class="pr-stat">
            <div class="pr-stat-num" id="statRatings">0</div>
            <div class="pr-stat-lbl">Events Rated</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num" id="statAvg">—</div>
            <div class="pr-stat-lbl">Avg Rating</div>
          </div>
        </div>
      </div>

      <!-- BODY -->
      <div class="pr-body">
        ${buildRatingsSection()}
        ${buildFavsSection()}
      </div>

      ${buildModal()}
    `;

    animateStats();
    attachEvents();
  }

  function buildRatingsSection() {
    if (!ratings.length) {
      return `
        <div class="pr-section" style="animation-delay:0.1s">
          <div class="pr-section-title">My Reviews</div>
          <div class="pr-empty">
            <strong>No reviews yet</strong>
            Go rate an event on the <a href="reviews.html" style="color:rgba(0,229,255,0.7);text-decoration:none">Reviews page</a>
          </div>
        </div>`;
    }

    const cards = ratings.map(r => {
      const ev = eventMap[r.event_id];
      const name   = r.event_name || ev?.name || 'Unknown Event';
      const poster  = ev?.poster || '';
      const eventId = r.event_id || slugify(name);

      return `
        <a class="pr-rating-card" href="event-review.html?id=${encodeURIComponent(eventId)}">
          <div class="pr-rc-poster-wrap">
            ${poster
              ? `<img class="pr-rc-poster" src="${esc(poster)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none'">
                 <div class="pr-rc-grad"></div>`
              : `<div class="pr-rc-placeholder"></div>`}
            <div class="pr-rc-stars">${starsHtml(r.hype_rating)}</div>
          </div>
          <div class="pr-rc-body">
            <div class="pr-rc-name">${esc(name)}</div>
            <div class="pr-rc-meta">
              <span>${timeAgo(r.created_at)}</span>
            </div>
            ${r.review_text ? `<div class="pr-rc-text">${esc(r.review_text)}</div>` : ''}
          </div>
        </a>`;
    }).join('');

    return `
      <div class="pr-section" style="animation-delay:0.1s">
        <div class="pr-section-title">
          My Reviews
          <span class="pr-section-count">${ratings.length}</span>
        </div>
        <div class="pr-ratings-grid">${cards}</div>
      </div>`;
  }

  function buildFavsSection() {
    return `
      <div class="pr-section" style="animation-delay:0.15s" id="favsSection">
        <div class="pr-section-title">Favourite Fighters</div>
        <div class="pr-favs-grid" id="favsGrid"></div>
      </div>`;
  }

  function buildModal() {
    return `
      <div class="pr-modal-backdrop" id="fighterPickerModal" style="display:none">
        <div class="pr-modal">
          <div class="pr-modal-header">
            <div class="pr-modal-title">Add Favourite Fighters</div>
            <button class="pr-modal-close" id="modalClose">✕</button>
          </div>
          <div class="pr-modal-search">
            <input type="text" id="modalSearch" placeholder="Search fighters…" autocomplete="off" />
          </div>
          <div class="pr-modal-list" id="modalList"></div>
          <div class="pr-modal-done"><button id="modalDone">Done</button></div>
        </div>
      </div>`;
  }

  function renderFavs() {
    const favIds = getFavs();
    const grid   = document.getElementById('favsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    favIds.forEach(fid => {
      const f = fighters.find(x => x.id === fid);
      if (!f) return;
      const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const card = document.createElement('a');
      card.className = 'pr-fav-card';
      card.href = `fighter.html?id=${encodeURIComponent(f.id)}`;
      card.innerHTML = `
        <div class="pr-fav-img-wrap">
          ${f.img
            ? `<img class="pr-fav-img" src="${esc(f.img)}" alt="${esc(f.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
               <div class="pr-fav-initial" style="display:none">${esc(initials)}</div>`
            : `<div class="pr-fav-initial">${esc(initials)}</div>`}
          <button class="pr-fav-remove" data-id="${esc(f.id)}" title="Remove">✕</button>
        </div>
        <div class="pr-fav-name">${esc(f.name)}</div>`;
      grid.appendChild(card);
    });

    // Add button
    const addBtn = document.createElement('div');
    addBtn.className = 'pr-fav-add';
    addBtn.id = 'favsAddBtn';
    addBtn.innerHTML = `
      <div class="pr-fav-add-circle">+</div>
      <div class="pr-fav-add-label">Add fighter</div>`;
    grid.appendChild(addBtn);
  }

  // ── Animate stats counters ────────────────────
  function animateStats() {
    const ratingEl = document.getElementById('statRatings');
    const avgEl    = document.getElementById('statAvg');

    if (ratingEl) {
      let cur = 0;
      const target = totalRatings;
      if (target === 0) { ratingEl.textContent = '0'; }
      else {
        const step = () => {
          cur = Math.min(cur + Math.ceil(target / 20), target);
          ratingEl.textContent = cur;
          if (cur < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }

    if (avgEl) {
      avgEl.textContent = avgRating;
    }
  }

  // ── Events ────────────────────────────────────
  function attachEvents() {
    renderFavs();

    // Remove fav
    document.getElementById('favsGrid')?.addEventListener('click', e => {
      const removeBtn = e.target.closest('.pr-fav-remove');
      if (removeBtn) {
        e.preventDefault(); e.stopPropagation();
        const id = removeBtn.dataset.id;
        const favs = getFavs().filter(x => x !== id);
        saveFavs(favs);
        renderFavs();
        return;
      }
    });

    // Open modal
    document.addEventListener('click', e => {
      if (e.target.closest('#favsAddBtn')) openModal();
    });

    // Modal close
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('fighterPickerModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('fighterPickerModal')) closeModal();
    });
    document.getElementById('modalDone')?.addEventListener('click', closeModal);

    // Modal search
    document.getElementById('modalSearch')?.addEventListener('input', e => {
      renderModalList(e.target.value.toLowerCase());
    });
  }

  let modalOpen = false;

  function openModal() {
    const modal = document.getElementById('fighterPickerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modalOpen = true;
    document.getElementById('modalSearch').value = '';
    renderModalList('');
    setTimeout(() => document.getElementById('modalSearch')?.focus(), 50);
  }

  function closeModal() {
    const modal = document.getElementById('fighterPickerModal');
    if (modal) modal.style.display = 'none';
    modalOpen = false;
    renderFavs();
  }

  function renderModalList(q) {
    const list   = document.getElementById('modalList');
    const favIds = getFavs();
    if (!list) return;

    const filtered = fighters
      .filter(f => !q || f.name.toLowerCase().includes(q))
      .slice(0, 80);

    list.innerHTML = filtered.map(f => {
      const isFav = favIds.includes(f.id);
      const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
        <div class="pr-modal-row${isFav ? ' selected' : ''}" data-id="${esc(f.id)}">
          ${f.img
            ? `<img src="${esc(f.img)}" alt="${esc(f.name)}" onerror="this.style.display='none'">`
            : `<div style="width:38px;height:38px;border-radius:50%;background:#1c1c1c;display:flex;align-items:center;justify-content:center;font-family:Montserrat,sans-serif;font-weight:800;font-size:0.85rem;color:rgba(0,229,255,0.5)">${esc(initials)}</div>`}
          <div class="pr-modal-row-info">
            <div class="pr-modal-row-name">${esc(f.name)}</div>
            <div class="pr-modal-row-meta">${esc(f.weightClass || '')}${f.ranking ? ' · ' + f.ranking : ''}</div>
          </div>
          <div class="pr-modal-row-check">${isFav ? '✓' : ''}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.pr-modal-row').forEach(row => {
      row.addEventListener('click', () => {
        const id   = row.dataset.id;
        let favs   = getFavs();
        const isSelected = row.classList.contains('selected');
        if (isSelected) {
          favs = favs.filter(x => x !== id);
        } else {
          if (!favs.includes(id)) favs.push(id);
        }
        saveFavs(favs);
        row.classList.toggle('selected', !isSelected);
        row.querySelector('.pr-modal-row-check').textContent = isSelected ? '' : '✓';
      });
    });
  }

})();
