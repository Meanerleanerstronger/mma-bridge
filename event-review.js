// ==============================================
// MMA BRIDGE - EVENT REVIEW PAGE (PAST EVENTS)
// Rate the card. That's it.
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';

const root = document.getElementById('erRoot');
const breadcrumb = document.getElementById('breadcrumbName');

const RATING_LABELS = ['', 'Terrible card', 'Below average', 'Decent night', 'Great card', 'All-time classic 🔥'];

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(str) {
  return (str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function getApiBase() {
  return (CONFIG.API && CONFIG.API.BASE_URL)
    ? CONFIG.API.BASE_URL
    : 'https://mmabridge-backend.onrender.com/api';
}

// ── Load event data ───────────────────────────
async function resolveEvent(eventId) {
  try {
    const cached = sessionStorage.getItem('review_event');
    if (cached) {
      const ev = JSON.parse(cached);
      const cachedId = ev.id || slugify(ev.name || ev.eventName || '');
      if (cachedId === eventId) return ev;
    }
  } catch {}
  const events = await API.getUpcomingEvents();
  return events.find(ev => (ev.id || slugify(ev.name || ev.eventName || '')) === eventId) || null;
}

// ── Community rating ──────────────────────────
async function fetchCommunityRating(eventId) {
  try {
    const res = await fetch(`${getApiBase()}/ratings/${encodeURIComponent(eventId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function submitRating(eventId, eventName, rating, reviewText = '') {
  const res = await fetch(`${getApiBase()}/ratings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      event_name: eventName,
      hype_rating: rating,
      fotn_prediction: null,
      review_text: reviewText || null
    })
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}

// ── Render ────────────────────────────────────
function renderPage(ev, communityRating) {
  const eventId    = ev.id || slugify(ev.name || ev.eventName || '');
  const name       = ev.name || ev.eventName || 'Unnamed Event';
  const date       = ev.date || '';
  const type       = ev.type || '';
  const loc        = ev.location || '';
  const venue      = ev.venue || '';
  const poster     = ev.poster || '';

  const avg         = communityRating?.avg_hype ?? null;
  const totalRatings = communityRating?.total_ratings ?? 0;

  breadcrumb.textContent = name;
  document.title = `MMA Bridge | ${name}`;

  root.innerHTML = `
    <div class="er-layout">

      <!-- LEFT: poster + community score -->
      <div class="er-poster-col">
        ${poster
          ? `<img class="er-poster" src="${escHtml(poster)}" alt="${escHtml(name)}"
               onerror="this.style.display='none';document.getElementById('erFallback').style.display='flex';">
             <div class="er-poster-placeholder" id="erFallback" style="display:none;">🥊</div>`
          : `<div class="er-poster-placeholder">🥊</div>`
        }

        <div class="er-community-pill">
          <div class="pill-label">Community Rating</div>
          <div class="pill-val" id="pillVal">${avg ? `★ ${avg}` : '—'}</div>
          <div class="pill-count" id="pillCount">
            ${totalRatings ? `${totalRatings} rating${totalRatings !== 1 ? 's' : ''}` : 'No ratings yet'}
          </div>
        </div>
      </div>

      <!-- RIGHT: info + rating -->
      <div class="er-main">
        ${type ? `<div class="er-event-type">${escHtml(type)}</div>` : ''}
        <div class="er-event-name">${escHtml(name)}</div>
        <div class="er-event-meta">
          ${date   ? `<span>${escHtml(date)}</span>`         : ''}
          ${loc    ? `<span>📍 ${escHtml(loc)}</span>`       : ''}
          ${venue  ? `<span>${escHtml(venue)}</span>`        : ''}
        </div>

        <!-- RATING CARD -->
        <div class="er-card">
          <div class="er-card-title">How was the card?</div>
          <div class="star-row" id="starRow">
            ${[1,2,3,4,5].map(n =>
              `<button class="star-btn" data-val="${n}" type="button">★</button>`
            ).join('')}
          </div>
          <div class="hype-label" id="ratingLabel">Tap a star to rate</div>
        </div>

        <!-- TEXT REVIEW -->
        <div class="er-card">
          <div class="er-card-title">Leave a review <span style="font-weight:400;color:rgba(255,255,255,0.3);text-transform:none;letter-spacing:0">(optional)</span></div>
          <textarea id="reviewText" placeholder="Feel free to break down the card — standout fights, surprises, disappointments..." rows="4" style="
            width:100%; box-sizing:border-box;
            background:#0e0e0e; border:1px solid #2a2a2a; border-radius:6px;
            color:#fff; font-family:'Inter',sans-serif; font-size:0.85rem;
            padding:12px 14px; resize:vertical; outline:none;
            transition:border-color 0.18s; line-height:1.55;
          "></textarea>
        </div>

        <button class="er-submit" id="erSubmit" disabled>Submit Review</button>
        <div class="er-toast" id="erToast">✅ Review saved — thanks!</div>
        <div id="erError" style="display:none; font-family:'Inter',sans-serif; font-size:0.8rem; color:#ff6b6b; margin-top:8px;"></div>
      </div>

    </div>
  `;

  // ── Star interaction ──────────────────────
  let selected = 0;
  const stars     = root.querySelectorAll('.star-btn');
  const label     = root.querySelector('#ratingLabel');
  const submitBtn = root.querySelector('#erSubmit');
  const toast     = root.querySelector('#erToast');
  const errEl     = root.querySelector('#erError');
  const textarea  = root.querySelector('#reviewText');

  // Textarea cyan focus
  textarea.addEventListener('focus', () => textarea.style.borderColor = 'rgba(0,255,255,0.5)');
  textarea.addEventListener('blur',  () => textarea.style.borderColor = '#2a2a2a');

  function lightStars(val) {
    stars.forEach(s => s.classList.toggle('lit', parseInt(s.dataset.val) <= val));
  }

  stars.forEach(s => {
    s.addEventListener('mouseenter', () => lightStars(parseInt(s.dataset.val)));
    s.addEventListener('mouseleave', () => lightStars(selected));
    s.addEventListener('click', () => {
      selected = parseInt(s.dataset.val);
      lightStars(selected);
      label.textContent = RATING_LABELS[selected];
      submitBtn.disabled = false;
    });
  });

  // ── Submit ────────────────────────────────
  submitBtn.addEventListener('click', async () => {
    if (!selected) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    errEl.style.display = 'none';

    try {
      await submitRating(eventId, name, selected, textarea.value.trim());
      toast.classList.add('show');
      submitBtn.textContent = '✓ Submitted';

      // Refresh community score
      const fresh = await fetchCommunityRating(eventId);
      if (fresh) {
        const pv = root.querySelector('#pillVal');
        const pc = root.querySelector('#pillCount');
        if (pv) pv.textContent = fresh.avg_hype ? `★ ${fresh.avg_hype}` : '—';
        if (pc) pc.textContent = fresh.total_ratings
          ? `${fresh.total_ratings} rating${fresh.total_ratings !== 1 ? 's' : ''}`
          : 'No ratings yet';
      }
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
      errEl.style.display = 'block';
      errEl.textContent = 'Could not save — check your connection.';
    }
  });
}

// ── Init ──────────────────────────────────────
(async () => {
  const params  = new URLSearchParams(window.location.search);
  const eventId = params.get('id');

  if (!eventId) {
    root.innerHTML = `<div class="er-error">No event specified. <a href="reviews.html" style="color:cyan">← Back</a></div>`;
    return;
  }

  root.innerHTML = `<div class="er-error" style="padding:60px 0; color:rgba(255,255,255,0.3)">Loading…</div>`;

  try {
    const [ev, communityRating] = await Promise.all([
      resolveEvent(eventId),
      fetchCommunityRating(eventId)
    ]);

    if (!ev) {
      root.innerHTML = `<div class="er-error">Event not found. <a href="reviews.html" style="color:cyan">← Back</a></div>`;
      return;
    }

    renderPage(ev, communityRating);
  } catch (err) {
    console.error('event-review:', err);
    root.innerHTML = `<div class="er-error">Failed to load. <a href="reviews.html" style="color:cyan">← Back</a></div>`;
  }
})();
