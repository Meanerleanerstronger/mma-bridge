// ==============================================
// MMA BRIDGE - REVIEWS PAGE
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';

// ── DOM refs ──────────────────────────────────
const scrollPPV    = document.getElementById('scrollPPV');
const scrollFN     = document.getElementById('scrollFN');
const ppvCount     = document.getElementById('ppvCount');
const fnCount      = document.getElementById('fnCount');
const rvRows       = document.getElementById('rvRows');
const searchPanel  = document.getElementById('rvSearchPanel');
const searchGrid   = document.getElementById('searchGrid');
const searchEmpty  = document.getElementById('searchEmpty');
const searchLabel  = document.getElementById('searchLabel');
const rvSearch     = document.getElementById('rvSearch');

let allEvents = [];
let ppvPast = [], fnPast = [];
const ratingsCache = {};
let ppvSort = 'latest', fnSort = 'latest';

// ── Helpers ───────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(s) {
  return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function getApiBase() {
  return (CONFIG && CONFIG.API && CONFIG.API.BASE_URL)
    ? CONFIG.API.BASE_URL
    : 'https://mmabridge-backend.onrender.com/api';
}
function getMainEvent(ev) {
  const mc = ev.mainCard || [];
  const main = mc.find(f => f.slot === 'main') || mc[0];
  return main ? `${main.a} vs ${main.b}` : '';
}
function getEventId(ev) {
  return ev.id || slugify(ev.name || ev.eventName || '');
}

const CARD_PLACEHOLDER_GRADIENTS = [
  'linear-gradient(140deg,#f97316 0%,#ea580c 100%)',
  'linear-gradient(140deg,#ea580c 0%,#b45309 100%)',
  'linear-gradient(140deg,#d97706 0%,#92400e 100%)',
  'linear-gradient(140deg,#ff8a3d 0%,#e06b1a 100%)',
  'linear-gradient(140deg,#94a3b8 0%,#64748b 100%)',
  'linear-gradient(140deg,#475569 0%,#334155 100%)',
  'linear-gradient(140deg,#22c55e 0%,#16a34a 100%)',
];

// ── Build a card element ──────────────────────
function buildCard(ev, type) {
  const eventId  = getEventId(ev);
  const name     = ev.name || ev.eventName || 'Unnamed Event';
  const poster   = ev.poster || '';
  const matchup  = getMainEvent(ev);
  const isPPV    = type === 'ppv';

  const card = document.createElement('div');
  card.className = `rv-card ${isPPV ? 'ppv' : 'fn'}`;

  // Per-image object-position overrides for posters with awkward crops
  const posterPositions = {
    'https://dmxg5wxfqgb4u.cloudfront.net/styles/background_image_xl_2x/s3/2026-03/040426-ufc-fight-night-moicano-vs-duncan-EVENT-ART.jpg': 'center 12%',
  };
  const objPos = poster ? (posterPositions[poster] || 'top center') : '';
  const placeholderGrad = CARD_PLACEHOLDER_GRADIENTS[Math.floor(Math.random() * CARD_PLACEHOLDER_GRADIENTS.length)];

  card.innerHTML = `
    <div class="card-badge">${isPPV ? 'PPV' : 'Fight Night'}</div>
    ${poster
      ? `<img class="card-poster" src="${escHtml(poster)}" alt="${escHtml(name)}" loading="lazy"
           style="object-position:${objPos}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="card-placeholder" style="display:none;background:${placeholderGrad}"></div>`
      : `<div class="card-placeholder" style="background:${placeholderGrad}"></div>`
    }
    <div class="card-gradient"></div>
    <div class="card-info">
      <div class="card-name">${escHtml(name)}</div>
      <div class="card-matchup">${escHtml(matchup)}</div>
    </div>
  `;

  // Click → store event and go to detail page
  card.addEventListener('click', () => {
    try { sessionStorage.setItem('review_event', JSON.stringify(ev)); } catch {}
    window.location.href = `event-review.html?id=${encodeURIComponent(eventId)}`;
  });

  // 3D tilt on hover
  if (window.applyTilt) window.applyTilt([card]);

  // Async inject community rating badge — also pre-populates ratingsCache for sort
  fetchRating(eventId).then(r => {
    ratingsCache[eventId] = r?.avg_hype ? parseFloat(r.avg_hype) : null;
    if (!r || !r.avg_hype) return;
    const badge = document.createElement('div');
    badge.className = 'card-rating';
    badge.textContent = `★ ${r.avg_hype}`;
    card.appendChild(badge);
  });

  return card;
}

// ── Fetch community rating from Supabase ──────
async function fetchRating(eventId) {
  try {
    const sb = window._sb;
    if (!sb) return null;
    const { data } = await sb
      .from('ratings')
      .select('hype_rating')
      .eq('event_id', eventId)
      .not('hype_rating', 'is', null);
    if (!data || !data.length) return null;
    const avg = (data.reduce((s, r) => s + parseFloat(r.hype_rating), 0) / data.length).toFixed(1);
    return { avg_hype: avg, total_ratings: data.length };
  } catch { return null; }
}

// ── Sort helpers ──────────────────────────────
async function ensureRatings(events) {
  await Promise.all(events.map(async ev => {
    const id = getEventId(ev);
    if (id in ratingsCache) return;
    const r = await fetchRating(id);
    ratingsCache[id] = r?.avg_hype ? parseFloat(r.avg_hype) : null;
  }));
}

function sortedEvents(events, mode) {
  const arr = [...events];
  if (mode === 'latest') {
    return arr.sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0));
  }
  const getR = ev => ratingsCache[getEventId(ev)];
  if (mode === 'highest') {
    return arr.sort((a, b) => {
      const ra = getR(a), rb = getR(b);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    });
  }
  if (mode === 'lowest') {
    return arr.sort((a, b) => {
      const ra = getR(a), rb = getR(b);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });
  }
  return arr;
}

async function applySortRow(scrollEl, countEl, events, type, mode, sortBtn) {
  if (mode !== 'latest') {
    // Check if any ratings are still missing from cache
    const needsFetch = events.some(ev => !(getEventId(ev) in ratingsCache));
    if (needsFetch) {
      if (sortBtn) { sortBtn.style.opacity = '0.5'; sortBtn.style.pointerEvents = 'none'; }
      await ensureRatings(events);
      if (sortBtn) { sortBtn.style.opacity = ''; sortBtn.style.pointerEvents = ''; }
    }
  }
  renderRow(scrollEl, countEl, sortedEvents(events, mode), type);
}

// ── Render a row ──────────────────────────────
function renderRow(container, countEl, events, type) {
  container.innerHTML = '';
  if (!events.length) {
    container.innerHTML = `<div style="padding:20px;color:rgba(255,255,255,0.25);font-family:'Inter',sans-serif;font-size:0.85rem;">None scheduled yet.</div>`;
    return;
  }
  countEl.textContent = '';
  events.forEach((ev, i) => {
    const card = buildCard(ev, type);
    card.style.animationDelay = `${Math.min(i, 10) * 45}ms`;
    container.appendChild(card);
  });
}

// ── Sort dropdowns ────────────────────────────
function initSortDropdown(wrapId, btnId, dropId, onSelect) {
  const wrap  = document.getElementById(wrapId);
  const btn   = document.getElementById(btnId);
  const drop  = document.getElementById(dropId);
  if (!wrap || !btn || !drop) return;

  const labelEl = btn.querySelector('.rv-sort-label');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = drop.classList.contains('open');
    // Close all other dropdowns first
    document.querySelectorAll('.rv-sort-drop.open').forEach(d => {
      d.classList.remove('open');
      d.closest('.rv-sort-wrap')?.classList.remove('open');
    });
    if (!isOpen) {
      drop.classList.add('open');
      wrap.classList.add('open');
    }
  });

  drop.querySelectorAll('button').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      drop.querySelectorAll('button').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      if (labelEl) labelEl.textContent = opt.textContent;
      drop.classList.remove('open');
      wrap.classList.remove('open');
      onSelect(opt.dataset.sort, btn);
    });
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.rv-sort-drop.open').forEach(d => {
    d.classList.remove('open');
    d.closest('.rv-sort-wrap')?.classList.remove('open');
  });
});

// Init sort dropdowns immediately — elements are in HTML, data will be set when loaded
initSortDropdown('ppvSortWrap', 'ppvSortBtn', 'ppvSortDrop', (mode, btn) => {
  ppvSort = mode;
  if (ppvPast.length) applySortRow(scrollPPV, ppvCount, ppvPast, 'ppv', mode, btn);
});
initSortDropdown('fnSortWrap', 'fnSortBtn', 'fnSortDrop', (mode, btn) => {
  fnSort = mode;
  if (fnPast.length) applySortRow(scrollFN, fnCount, fnPast, 'fn', mode, btn);
});

// ── Arrow scroll + show/hide at edges ─────────
function syncArrows(scrollEl) {
  const max = scrollEl.scrollWidth - scrollEl.clientWidth;
  const id  = scrollEl.id;
  document.querySelectorAll(`.rv-arrow[data-target="${id}"]`).forEach(btn => {
    const isLeft = btn.classList.contains('left');
    btn.classList.toggle('hidden', isLeft ? scrollEl.scrollLeft <= 2 : scrollEl.scrollLeft >= max - 2);
  });
}

document.querySelectorAll('.rv-scroll').forEach(scrollEl => {
  if (!scrollEl.id) return;
  scrollEl.addEventListener('scroll', () => syncArrows(scrollEl), { passive: true });
  /* initial state — after content renders */
  requestAnimationFrame(() => syncArrows(scrollEl));
});

document.querySelectorAll('.rv-arrow').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const dir = btn.classList.contains('left') ? -1 : 1;
    target.scrollBy({ left: dir * 400, behavior: 'smooth' });
  });
});

// ── Search ────────────────────────────────────
rvSearch.addEventListener('input', () => {
  const q = rvSearch.value.trim().toLowerCase();

  if (!q) {
    rvRows.style.display = '';
    searchPanel.style.display = 'none';
    return;
  }

  rvRows.style.display = 'none';
  searchPanel.style.display = '';
  searchGrid.innerHTML = '';
  searchEmpty.style.display = 'none';

  const filtered = allEvents.filter(ev =>
    isPastEvent(ev) &&
    (ev.name || ev.eventName || '').toLowerCase().includes(q)
  );

  searchLabel.textContent = filtered.length
    ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${q}"`
    : `No results for "${q}"`;

  if (!filtered.length) {
    searchEmpty.style.display = 'block';
    return;
  }

  filtered.forEach(ev => {
    const type = (ev.type||'').toUpperCase().includes('PPV') ? 'ppv' : 'fn';
    searchGrid.appendChild(buildCard(ev, type));
  });
});

// ── Is event in the past? ─────────────────────
function isPastEvent(ev) {
  const iso = ev.isoDate || '';
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── Is event upcoming? ────────────────────────
function isUpcomingEvent(ev) {
  const iso = ev.isoDate || '';
  if (!iso) return true;
  return new Date(iso) >= new Date();
}

// ── Load ──────────────────────────────────────
(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const all = await fetch('./events.json?_=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
    allEvents = all.filter(e => (e.isoDate || '9999') <= today && e.status === 'completed');
    debugLog('Reviews: loaded', allEvents.length, 'past events');

    ppvPast = allEvents.filter(ev => (ev.type||'').toUpperCase().includes('PPV'));
    fnPast  = allEvents.filter(ev => !(ev.type||'').toUpperCase().includes('PPV'));

    if (!allEvents.length) {
      document.getElementById('rvRows').innerHTML = `
        <div style="text-align:center; padding:80px 40px;">
          <div style="font-size:3rem; margin-bottom:16px;">🕐</div>
          <div style="font-family:'Montserrat',sans-serif; font-weight:800; font-size:1rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.5); margin-bottom:8px;">No Past Events Yet</div>
          <div style="font-family:'Inter',sans-serif; font-size:0.85rem; color:rgba(255,255,255,0.25); max-width:360px; margin:0 auto;">
            Reviews unlock once an event has happened. Check back after events go down.
          </div>
          ${upcomingEvents.length ? `
            <div style="margin-top:24px; font-family:'Inter',sans-serif; font-size:0.8rem; color:rgba(0,255,255,0.5);">
              Next up: <strong style="color:cyan">${upcomingEvents[0].name}</strong>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    // Render with default sort (latest first)
    applySortRow(scrollPPV, ppvCount, ppvPast, 'ppv', 'latest', null);
    applySortRow(scrollFN,  fnCount,  fnPast,  'fn',  'latest', null);

    // Hide a row section entirely if empty
    if (!ppvPast.length) document.getElementById('rowPPV').style.display = 'none';
    if (!fnPast.length)  document.getElementById('rowFN').style.display = 'none';


  } catch (err) {
    console.error('Reviews load error:', err);
    scrollPPV.innerHTML = `<div style="padding:20px;color:rgba(255,255,255,0.2);font-family:'Inter',sans-serif;font-size:0.82rem;text-align:center;">No events to display right now.</div>`;
    scrollFN.innerHTML  = '';
  }
})();
