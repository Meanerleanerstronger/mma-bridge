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

// ── Build a card element ──────────────────────
function buildCard(ev, type) {
  const eventId  = getEventId(ev);
  const name     = ev.name || ev.eventName || 'Unnamed Event';
  const poster   = ev.poster || '';
  const matchup  = getMainEvent(ev);
  const isPPV    = type === 'ppv';

  const card = document.createElement('div');
  card.className = `rv-card ${isPPV ? 'ppv' : 'fn'}`;

  card.innerHTML = `
    <div class="card-badge">${isPPV ? 'PPV' : 'Fight Night'}</div>
    ${poster
      ? `<img class="card-poster" src="${escHtml(poster)}" alt="${escHtml(name)}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="card-placeholder" style="display:none;">🥊</div>`
      : `<div class="card-placeholder">🥊</div>`
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

  // Async inject community rating badge
  fetchRating(eventId).then(r => {
    if (!r || !r.avg_hype) return;
    const badge = document.createElement('div');
    badge.className = 'card-rating';
    badge.textContent = `★ ${r.avg_hype}`;
    card.appendChild(badge);
  });

  return card;
}

// ── Fetch community rating (silent fail) ──────
async function fetchRating(eventId) {
  try {
    const res = await fetch(`${getApiBase()}/ratings/${encodeURIComponent(eventId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Render a row ──────────────────────────────
function renderRow(container, countEl, events, type) {
  container.innerHTML = '';
  if (!events.length) {
    container.innerHTML = `<div style="padding:20px;color:rgba(255,255,255,0.25);font-family:'Inter',sans-serif;font-size:0.85rem;">None scheduled yet.</div>`;
    return;
  }
  countEl.textContent = '';
  events.forEach(ev => container.appendChild(buildCard(ev, type)));
}

// ── Arrow scroll ──────────────────────────────
document.querySelectorAll('.rv-arrow').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const dir = btn.classList.contains('left') ? -1 : 1;
    target.scrollBy({ left: dir * 500, behavior: 'smooth' });
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
    allEvents = await API.getPastEvents();
    debugLog('Reviews: loaded', allEvents.length, 'past events');

    const ppvPast = allEvents.filter(ev => (ev.type||'').toUpperCase().includes('PPV'));
    const fnPast  = allEvents.filter(ev => !(ev.type||'').toUpperCase().includes('PPV'));

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

    renderRow(scrollPPV, ppvCount, ppvPast, 'ppv');
    renderRow(scrollFN,  fnCount,  fnPast,  'fn');

    // Hide a row section entirely if empty
    if (!ppvPast.length) document.getElementById('rowPPV').style.display = 'none';
    if (!fnPast.length)  document.getElementById('rowFN').style.display = 'none';

  } catch (err) {
    console.error('Reviews load error:', err);
    scrollPPV.innerHTML = `<div style="padding:20px;color:rgba(255,255,255,0.25);font-family:'Inter',sans-serif;font-size:0.85rem;">Could not load events.</div>`;
    scrollFN.innerHTML  = '';
  }
})();
