// ==============================================
// MMA BRIDGE — EVENT REVIEW PAGE
// Layout: Poster → Stars → Text review → Full fight card
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';

const root       = document.getElementById('erRoot');
const breadcrumb = document.getElementById('breadcrumbName');


function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(s) {
  return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function getApiBase() {
  return CONFIG?.API?.BASE_URL || 'https://mmabridge-backend.onrender.com/api';
}

// ── Load event ────────────────────────────────
async function resolveEvent(eventId) {
  // Try sessionStorage first
  try {
    const cached = sessionStorage.getItem('review_event');
    if (cached) {
      const ev = JSON.parse(cached);
      if ((ev.id || slugify(ev.name || ev.eventName || '')) === eventId) return ev;
    }
  } catch {}
  // Load directly from events.json by ID
  try {
    const all = await fetch('/events.json').then(r => r.json());
    return all.find(ev => ev.id === eventId || slugify(ev.name || '') === eventId) || null;
  } catch {}
  return null;
}

async function fetchCommunityRating(eventId) {
  try {
    const r = await fetch(`${getApiBase()}/ratings/${encodeURIComponent(eventId)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchReviews(eventId) {
  try {
    const r = await fetch(`${getApiBase()}/reviews/${encodeURIComponent(eventId)}`);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
}

function renderReviews(reviews, container) {
  if (!reviews.length) {
    container.innerHTML = `
      <div class="er-reviews-empty">
        <strong>No reviews yet.</strong>
        Be the first to share your take on this card.
      </div>`;
    return;
  }
  container.innerHTML = reviews.map(rv => {
    const stars = [1,2,3,4,5].map(n =>
      `<span class="er-rev-star${n > rv.hype_rating ? ' dim' : ''}">★</span>`
    ).join('');
    const text = rv.review_text
      ? `<div class="er-rev-text">${esc(rv.review_text)}</div>`
      : '';
    return `
      <div class="er-rev-card">
        <div class="er-rev-stars">${stars}</div>
        ${text}
        <div class="er-rev-time">${timeAgo(rv.created_at)}</div>
      </div>`;
  }).join('');
}

async function loadAndRenderReviews(eventId) {
  const feed = document.getElementById('erReviewsFeed');
  if (!feed) return;
  const reviews = await fetchReviews(eventId);
  renderReviews(reviews, feed);
}

async function submitRating(eventId, eventName, rating, reviewText) {
  const r = await fetch(`${getApiBase()}/ratings`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      event_id: eventId,
      event_name: eventName,
      hype_rating: rating,
      fotn_prediction: null,
      review_text: reviewText || null
    })
  });
  if (!r.ok) throw new Error('Submit failed');
  return r.json();
}

// ── Fight card section ────────────────────────
function fightRow(f) {
  const slotBadge = f.slot === 'main'
    ? '<span class="er-slot-badge er-main-badge">MAIN EVENT</span>'
    : f.slot === 'comain'
      ? '<span class="er-slot-badge er-comain-badge">CO-MAIN</span>'
      : '';
  const icons = [
    f.titleFight ? '🏆' : '',
    f.ranked     ? '⭐' : '',
  ].filter(Boolean).join(' ');

  // Result display
  const METHOD_LABELS = {
    'KO':'🥊 KO','TKO':'🥊 TKO','SUB':'⛓️ Sub',
    'UD':'📋 UD','SD':'📋 SD','MD':'📋 MD',
    'NC':'🚫 NC','Draw':'🤝 Draw'
  };
  let resultHtml = '';
  if (f.winner) {
    const loser = f.winner === f.a ? f.b : f.a;
    const isNC = f.winner === 'NC' || f.winner === 'Draw';
    const methodLabel = METHOD_LABELS[f.method] || f.method;
    const roundInfo = f.round ? ` · R${f.round} ${f.time || ''}` : '';
    resultHtml = `
      <div class="er-result">
        ${isNC
          ? `<span class="er-result-nc">${methodLabel}</span>`
          : `<span class="er-result-winner">${esc(f.winner)}</span>
             <span class="er-result-def">def.</span>
             <span class="er-result-loser">${esc(loser)}</span>`
        }
        <span class="er-result-method">${methodLabel}${roundInfo}</span>
      </div>`;
  }

  return `
    <div class="er-fight-row ${f.slot === 'main' ? 'er-fight-main' : f.slot === 'comain' ? 'er-fight-comain' : ''}">
      ${slotBadge ? `<div>${slotBadge}</div>` : ''}
      <div class="er-fight-names">
        <span class="er-fa ${f.winner === f.a ? 'er-won' : f.winner && f.winner !== 'NC' && f.winner !== 'Draw' ? 'er-lost' : ''}">${esc(f.a)}</span>
        <span class="er-fvs">vs</span>
        <span class="er-fb ${f.winner === f.b ? 'er-won' : f.winner && f.winner !== 'NC' && f.winner !== 'Draw' ? 'er-lost' : ''}">${esc(f.b)}</span>
        ${icons ? `<span class="er-ficons">${icons}</span>` : ''}
      </div>
      <div class="er-fight-meta">
        ${f.weight ? `<span class="pill">${esc(f.weight)}</span>` : ''}
        ${f.rounds ? `<span class="pill pill-dim">${esc(f.rounds)}</span>` : ''}
      </div>
      ${resultHtml}
    </div>`;
}

function fightSection(label, fights) {
  if (!fights?.length) return '';
  return `
    <details class="er-drop">
      <summary class="er-drop-sum">
        <span>${esc(label)}</span>
        <span class="er-drop-right">
          <span class="count">${fights.length}</span>
          <span class="chev">▾</span>
        </span>
      </summary>
      <div class="er-drop-body">
        ${fights.map(fightRow).join('')}
      </div>
    </details>`;
}

// ── Render page ───────────────────────────────
function renderPage(ev, community) {
  const eventId = ev.id || slugify(ev.name || ev.eventName || '');
  const name    = ev.name || ev.eventName || 'Unnamed Event';
  const poster  = ev.poster || '';
  const avg     = community?.avg_hype ?? null;
  const total   = community?.total_ratings ?? 0;

  const hasCard = (ev.mainCard?.length || ev.prelims?.length || ev.earlyPrelims?.length);

  breadcrumb.textContent = name;
  document.title = `MMA Bridge | ${name}`;

  root.innerHTML = `
    <div class="er-page">

      <!-- POSTER -->
      ${poster ? `
        <div class="er-hero">
          <img class="er-hero-img" src="${esc(poster)}" alt="${esc(name)}">
          <div class="er-hero-overlay">
            ${ev.type ? `<span class="er-event-type">${esc(ev.type)}</span>` : ''}
            <div class="er-hero-name">${esc(name)}</div>
            <div class="er-hero-meta">
              ${ev.date ? esc(ev.date) : ''}
              ${ev.location ? ` &nbsp;·&nbsp; ${esc(ev.location)}` : ''}
              ${ev.venue ? ` &nbsp;·&nbsp; ${esc(ev.venue)}` : ''}
            </div>
          </div>
        </div>` : `
        <div class="er-no-poster">
          <div class="er-no-poster-inner">
            ${ev.type ? `<span class="er-event-type">${esc(ev.type)}</span>` : ''}
            <div class="er-hero-name">${esc(name)}</div>
            <div class="er-hero-meta">
              ${ev.date ? esc(ev.date) : ''}
              ${ev.location ? ` · ${esc(ev.location)}` : ''}
            </div>
          </div>
        </div>`
      }

      <div class="er-two-col">

        <!-- LEFT: rating form + fight card -->
        <div class="er-content">

          <!-- COMMUNITY SCORE -->
          <div class="er-community-bar">
            <span class="er-comm-label">Community Rating</span>
            <span class="er-comm-val" id="erCommVal">
              ${avg ? `★ ${avg} &nbsp;·&nbsp; ${total} rating${total!==1?'s':''}` : 'No ratings yet — be first!'}
            </span>
          </div>

          <!-- STAR RATING -->
          <div class="er-card">
            <div class="er-card-title">How was the card?</div>
            <div class="er-stars" id="erStars">
              ${[1,2,3,4,5].map(n => `
                <span class="er-star-wrap" data-n="${n}">
                  <span class="er-star-char er-star-bg">★</span>
                  <span class="er-star-char er-star-fill" style="width:0%">★</span>
                </span>`).join('')}
              <span class="er-rating-num" id="erRatingNum"></span>
            </div>
          </div>

          <!-- TEXT REVIEW -->
          <div class="er-card">
            <div class="er-card-title">Leave a review <span class="er-optional">(optional)</span></div>
            <textarea id="erReviewText"
              placeholder="Break down the card — standout fights, surprises, disappointments, what you'd give FOTN..."
              rows="4"
            ></textarea>
          </div>

          <!-- SUBMIT -->
          <button class="er-submit" id="erSubmit" disabled>Submit Review</button>
          <div class="er-toast" id="erToast">✅ Review saved — thanks!</div>
          <div class="er-error-msg" id="erErr" style="display:none"></div>

          <!-- FIGHT CARD -->
          ${hasCard ? `
            <div class="er-card er-card-fights">
              <div class="er-card-title">Full Fight Card</div>
              ${fightSection('Main Card',    ev.mainCard)}
              ${fightSection('Prelims',      ev.prelims)}
              ${fightSection('Early Prelims',ev.earlyPrelims)}
            </div>` : ''}

        </div>

        <!-- RIGHT: fan reviews feed -->
        <div class="er-reviews-col">
          <div class="er-reviews-heading">Fan Reviews</div>
          <div id="erReviewsFeed">
            <div class="er-reviews-empty">
              <strong>No reviews yet.</strong>
              Be the first to share your take on this card.
            </div>
          </div>
        </div>

      </div>
    </div>`;

  // ── Stars ─────────────────────────────────
  let selected = 0;
  const starsEl   = root.querySelector('#erStars');
  const numEl     = root.querySelector('#erRatingNum');
  const submitBtn = root.querySelector('#erSubmit');
  const toast     = root.querySelector('#erToast');
  const errEl     = root.querySelector('#erErr');
  const textarea  = root.querySelector('#erReviewText');

  textarea.addEventListener('focus', () => textarea.style.borderColor = 'rgba(0,255,255,0.45)');
  textarea.addEventListener('blur',  () => textarea.style.borderColor = '#222');

  function updateStars(val) {
    starsEl.querySelectorAll('.er-star-wrap').forEach(w => {
      const n = +w.dataset.n;
      const fill = w.querySelector('.er-star-fill');
      if (val >= n)           fill.style.width = '100%';
      else if (val >= n - 0.5) fill.style.width = '50%';
      else                    fill.style.width = '0%';
    });
  }

  function halfVal(e, wrap) {
    const rect = wrap.getBoundingClientRect();
    const isLeft = (e.clientX - rect.left) < rect.width / 2;
    const n = +wrap.dataset.n;
    return isLeft ? Math.max(1, n - 0.5) : n;
  }

  starsEl.addEventListener('mousemove', e => {
    const wrap = e.target.closest('.er-star-wrap');
    if (!wrap) return;
    const v = halfVal(e, wrap);
    updateStars(v);
    numEl.textContent = `${v} / 5`;
  });

  starsEl.addEventListener('mouseleave', () => {
    updateStars(selected);
    numEl.textContent = selected ? `${selected} / 5` : '';
  });

  starsEl.addEventListener('click', e => {
    const wrap = e.target.closest('.er-star-wrap');
    if (!wrap) return;
    selected = halfVal(e, wrap);
    updateStars(selected);
    numEl.textContent = `${selected} / 5`;
    submitBtn.disabled = false;
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

      const [fresh] = await Promise.all([
        fetchCommunityRating(eventId),
        loadAndRenderReviews(eventId)
      ]);
      if (fresh) {
        const cv = root.querySelector('#erCommVal');
        if (cv) cv.innerHTML = fresh.avg_hype
          ? `★ ${fresh.avg_hype} &nbsp;·&nbsp; ${fresh.total_ratings} rating${fresh.total_ratings!==1?'s':''}`
          : 'No ratings yet';
      }
    } catch (err) {
      console.error('Submit error:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
      errEl.style.display = 'block';
      errEl.textContent = 'Could not save — the backend may be waking up, try again in a moment.';
    }
  });

  // ── Load initial reviews ──────────────────
  loadAndRenderReviews(eventId);
}

// ── Init ──────────────────────────────────────
(async () => {
  const params  = new URLSearchParams(window.location.search);
  const eventId = params.get('id');

  if (!eventId) {
    root.innerHTML = `<div class="er-empty">No event specified. <a href="reviews.html">← Back</a></div>`;
    return;
  }

  root.innerHTML = `<div class="er-empty" style="padding:80px 0;color:rgba(255,255,255,0.2)">Loading…</div>`;

  try {
    const [ev, community] = await Promise.all([
      resolveEvent(eventId),
      fetchCommunityRating(eventId)
    ]);

    if (!ev) {
      root.innerHTML = `<div class="er-empty">Event not found. <a href="reviews.html">← Back</a></div>`;
      return;
    }
    renderPage(ev, community);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="er-empty">Failed to load. <a href="reviews.html">← Back</a></div>`;
  }
})();
