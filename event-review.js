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

function pingBackend() {
  fetch(`${getApiBase()}/health`).catch(() => {});
}

async function fetchCommunityRating(eventId) {
  try {
    const r = await fetch(`${getApiBase()}/ratings/${encodeURIComponent(eventId)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchReviews(eventId, attempt = 0) {
  try {
    const r = await fetch(`${getApiBase()}/reviews/${encodeURIComponent(eventId)}`, {
      headers: authHeaders()
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt < 2) {
      await new Promise(res => setTimeout(res, 3000 * (attempt + 1)));
      return fetchReviews(eventId, attempt + 1);
    }
    return null; // null = failed, [] = genuinely empty
  }
}

function requireAuth() {
  sessionStorage.setItem('auth_return_to', location.href);
  location.href = 'auth.html';
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

function revStars(rating) {
  return [1,2,3,4,5].map(n => {
    let cls = 'dim';
    if (rating >= n)            cls = 'full';
    else if (rating >= n - 0.5) cls = 'half';
    return `<span class="er-rev-star ${cls}">★</span>`;
  }).join('');
}

function replyItemHtml(rp, isLoggedIn, currentUserId) {
  const isOwnReply = !!(currentUserId && +rp.user_id === currentUserId);
  return `
    <div class="er-reply-meta">
      <span class="er-reply-author">${esc(rp.display_name)}</span>
      <span class="er-reply-time">${timeAgo(rp.created_at)}</span>
    </div>
    <div class="er-reply-text">${esc(rp.reply_text)}</div>
    ${!isOwnReply && isLoggedIn ? `
      <button class="er-reply-like-btn${rp.user_liked ? ' liked' : ''}"
              data-reply-id="${rp.id}" data-liked="${rp.user_liked ? '1' : '0'}">
        <span class="er-like-icon">♥</span>
        <span class="er-reply-like-count">${rp.like_count || 0}</span>
      </button>` : (rp.like_count ? `<span style="font-size:0.67rem;color:rgba(255,255,255,0.2)">♥ ${rp.like_count}</span>` : '')}`;
}

function renderReviews(reviews, container) {
  const isLoggedIn   = !!window.MMABridgeAuth?.getToken();
  const currentUserId = window.MMABridgeAuth?.getUser()?.id ? +window.MMABridgeAuth.getUser().id : null;

  if (!reviews.length) {
    container.innerHTML = `
      <div class="er-reviews-empty">
        <strong>No reviews yet.</strong>
        Be the first to share your take on this card.
      </div>`;
    return;
  }

  const SHOW_INIT = 3;
  const cards = reviews.map((rv, i) => {
    const hidden   = i >= SHOW_INIT ? ' hidden' : '';
    const isOwn    = !!(currentUserId && rv.user_id && +rv.user_id === currentUserId);
    const textHtml = rv.review_text ? `
      <div class="er-rev-text-wrap">
        <div class="er-rev-text">${esc(rv.review_text)}</div>
        <button class="er-read-more" type="button">Read more</button>
      </div>` : '';
    const author = rv.display_name && rv.display_name !== 'Anonymous'
      ? `<span class="er-rev-author">${esc(rv.display_name)}</span>` : '';

    const likeHtml = !isOwn ? `
      <button class="er-like-btn${rv.user_liked ? ' liked' : ''}"
              data-review-id="${rv.id}" data-liked="${rv.user_liked ? '1' : '0'}">
        <span class="er-like-icon">♥</span>
        <span class="er-like-count">${rv.like_count || 0}</span>
      </button>` : '';

    const actionHtml = isOwn
      ? `<button class="er-edit-own-btn">Edit</button>`
      : `<button class="er-reply-btn" data-review-id="${rv.id}">Reply</button>`;

    const repliesToggle = (rv.reply_count > 0) ? `
      <button class="er-replies-toggle" data-review-id="${rv.id}" data-count="${rv.reply_count}">
        ↳ ${rv.reply_count} ${rv.reply_count === 1 ? 'reply' : 'replies'}
      </button>` : '';

    return `
      <div class="er-rev-card${hidden}" data-review-id="${rv.id}">
        <div class="er-rev-header">
          <div class="er-rev-stars">${revStars(rv.hype_rating)}</div>
          ${author}
        </div>
        ${textHtml}
        <div class="er-rev-time">${timeAgo(rv.created_at)}</div>
        <div class="er-rev-social">${likeHtml}${actionHtml}</div>
        <div class="er-replies-section" data-review-id="${rv.id}">
          <div class="er-replies-toggle-wrap">${repliesToggle}</div>
          <div class="er-replies-wrap" data-review-id="${rv.id}"></div>
          <div class="er-reply-input-wrap" data-review-id="${rv.id}">
            <textarea class="er-reply-textarea" placeholder="Add a reply…" rows="2"></textarea>
            <div class="er-reply-actions">
              <button class="er-reply-cancel">Cancel</button>
              <button class="er-reply-submit">Post</button>
            </div>
          </div>
        </div>
      </div>`;
  });

  const moreBtn = reviews.length > SHOW_INIT ? `
    <div class="er-show-more-wrap" id="erShowMoreWrap">
      <button class="er-show-more-btn" id="erShowMore">
        Show ${reviews.length - SHOW_INIT} more review${reviews.length - SHOW_INIT !== 1 ? 's' : ''}
      </button>
    </div>` : '';

  container.innerHTML = cards.join('') + moreBtn;

  // Read more toggles
  container.querySelectorAll('.er-rev-text-wrap').forEach(wrap => {
    const textEl = wrap.querySelector('.er-rev-text');
    const btn    = wrap.querySelector('.er-read-more');
    requestAnimationFrame(() => {
      if (textEl.scrollHeight > textEl.clientHeight + 2) btn.classList.add('visible');
    });
    btn.addEventListener('click', () => {
      const expanded = textEl.classList.toggle('expanded');
      btn.textContent = expanded ? 'Show less' : 'Read more';
    });
  });

  // Show more reviews
  container.querySelector('#erShowMore')?.addEventListener('click', () => {
    container.querySelectorAll('.er-rev-card.hidden').forEach((card, i) => {
      card.classList.remove('hidden');
      card.classList.add('reveal');
      card.style.animationDelay = `${i * 60}ms`;
    });
    container.querySelector('#erShowMoreWrap')?.remove();
  });

  // ── Like buttons ─────────────────────────────
  container.querySelectorAll('.er-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn) { requireAuth(); return; }
      const reviewId = btn.dataset.reviewId;
      const countEl  = btn.querySelector('.er-like-count');
      btn.disabled = true;
      try {
        const res = await fetch(`${getApiBase()}/reviews/${reviewId}/like`, {
          method: 'POST', headers: authHeaders()
        });
        if (!res.ok) throw new Error();
        const { liked, like_count } = await res.json();
        btn.dataset.liked = liked ? '1' : '0';
        btn.classList.toggle('liked', liked);
        countEl.textContent = like_count;
      } catch {} finally { btn.disabled = false; }
    });
  });

  // ── Reply buttons ─────────────────────────────
  container.querySelectorAll('.er-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isLoggedIn) { requireAuth(); return; }
      const reviewId  = btn.dataset.reviewId;
      const inputWrap = container.querySelector(`.er-reply-input-wrap[data-review-id="${reviewId}"]`);
      const visible   = inputWrap.classList.toggle('visible');
      if (visible) inputWrap.querySelector('.er-reply-textarea').focus();
    });
  });

  // ── Edit own review button ────────────────────
  container.querySelectorAll('.er-edit-own-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const submitBtn = document.querySelector('#erSubmit');
      if (submitBtn?.dataset.mode === 'locked') submitBtn.click();
      document.querySelector('#erSubmit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // ── Replies toggle ────────────────────────────
  container.querySelectorAll('.er-replies-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.dataset.reviewId;
      const wrap     = container.querySelector(`.er-replies-wrap[data-review-id="${reviewId}"]`);
      const isOpen   = wrap.classList.contains('open');
      if (!isOpen) {
        if (!wrap.dataset.loaded) {
          wrap.innerHTML = `<div style="padding:6px 0 6px 13px;font-size:0.72rem;color:rgba(255,255,255,0.18);">Loading…</div>`;
          wrap.classList.add('open');
          try {
            const res = await fetch(`${getApiBase()}/reviews/${reviewId}/replies`, { headers: authHeaders() });
            const replies = res.ok ? await res.json() : [];
            if (replies.length) {
              wrap.innerHTML = replies.map(rp =>
                `<div class="er-reply-item" data-reply-id="${rp.id}">${replyItemHtml(rp, isLoggedIn, currentUserId)}</div>`
              ).join('');
              wireReplyLikes(wrap, isLoggedIn);
            } else {
              wrap.innerHTML = '';
            }
          } catch { wrap.innerHTML = ''; }
          wrap.dataset.loaded = '1';
        } else {
          wrap.classList.add('open');
        }
        btn.textContent = btn.textContent.replace('↳', '↑');
      } else {
        wrap.classList.remove('open');
        btn.textContent = btn.textContent.replace('↑', '↳');
      }
    });
  });

  // ── Reply submit/cancel ───────────────────────
  container.querySelectorAll('.er-reply-input-wrap').forEach(inputWrap => {
    const reviewId  = inputWrap.dataset.reviewId;
    const textarea  = inputWrap.querySelector('.er-reply-textarea');
    const cancelBtn = inputWrap.querySelector('.er-reply-cancel');
    const submitBtn = inputWrap.querySelector('.er-reply-submit');
    const section   = container.querySelector(`.er-replies-section[data-review-id="${reviewId}"]`);

    cancelBtn.addEventListener('click', () => {
      inputWrap.classList.remove('visible');
      textarea.value = '';
    });

    submitBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;
      submitBtn.disabled = true;
      try {
        const res = await fetch(`${getApiBase()}/reviews/${reviewId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ reply_text: text })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        textarea.value = '';
        inputWrap.classList.remove('visible');

        // Append reply to the replies wrap
        const wrap = container.querySelector(`.er-replies-wrap[data-review-id="${reviewId}"]`);
        const newItem = document.createElement('div');
        newItem.className = 'er-reply-item';
        newItem.dataset.replyId = data.reply_id;
        newItem.innerHTML = replyItemHtml({
          id: data.reply_id, user_id: currentUserId,
          display_name: data.display_name, reply_text: text,
          created_at: data.created_at, like_count: 0, user_liked: false
        }, isLoggedIn, currentUserId);
        wrap.appendChild(newItem);
        wrap.dataset.loaded = '1';

        // Show & open replies wrap
        if (!wrap.classList.contains('open')) wrap.classList.add('open');

        // Update or create the toggle button
        let toggle = section.querySelector('.er-replies-toggle');
        const toggleWrap = section.querySelector('.er-replies-toggle-wrap');
        const newCount = (toggle ? (+toggle.dataset.count || 0) : 0) + 1;
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.className = 'er-replies-toggle';
          toggle.dataset.reviewId = reviewId;
          toggleWrap.appendChild(toggle);
          toggle.addEventListener('click', async () => {
            const isOpen2 = wrap.classList.contains('open');
            wrap.classList.toggle('open', !isOpen2);
            toggle.textContent = `${isOpen2 ? '↳' : '↑'} ${toggle.dataset.count} ${+toggle.dataset.count === 1 ? 'reply' : 'replies'}`;
          });
        }
        toggle.dataset.count = newCount;
        toggle.textContent = `↑ ${newCount} ${newCount === 1 ? 'reply' : 'replies'}`;

      } catch {
        submitBtn.disabled = false;
      }
    });
  });
}

function wireReplyLikes(wrap, isLoggedIn) {
  wrap.querySelectorAll('.er-reply-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn) { requireAuth(); return; }
      const replyId  = btn.dataset.replyId;
      const countEl  = btn.querySelector('.er-reply-like-count');
      btn.disabled = true;
      try {
        const res = await fetch(`${getApiBase()}/replies/${replyId}/like`, {
          method: 'POST', headers: authHeaders()
        });
        if (!res.ok) throw new Error();
        const { liked, like_count } = await res.json();
        btn.classList.toggle('liked', liked);
        countEl.textContent = like_count;
      } catch {} finally { btn.disabled = false; }
    });
  });
}

async function loadAndRenderReviews(eventId) {
  const feed = document.getElementById('erReviewsFeed');
  if (!feed) return;
  feed.innerHTML = `<div class="er-reviews-empty" style="opacity:0.5">Loading reviews…</div>`;
  const reviews = await fetchReviews(eventId);
  if (reviews === null) {
    feed.innerHTML = `
      <div class="er-reviews-empty">
        <div>Couldn't load reviews — backend may be waking up.</div>
        <button class="er-retry-btn" style="margin-top:10px;background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.78rem">Retry</button>
      </div>`;
    feed.querySelector('.er-retry-btn')?.addEventListener('click', () => loadAndRenderReviews(eventId));
    return;
  }
  renderReviews(reviews, feed);
}

function authHeaders() {
  return window.MMABridgeAuth?.authHeaders() || {};
}

async function submitRating(eventId, eventName, rating, reviewText) {
  const r = await fetch(`${getApiBase()}/ratings`, {
    method: 'POST',
    headers: {'Content-Type':'application/json', ...authHeaders()},
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

async function updateRating(ratingId, rating, reviewText) {
  const r = await fetch(`${getApiBase()}/ratings/${ratingId}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json', ...authHeaders()},
    body: JSON.stringify({ hype_rating: rating, review_text: reviewText || null })
  });
  if (!r.ok) throw new Error('Update failed');
  return r.json();
}

function getStoredRating(eventId) {
  try { return JSON.parse(localStorage.getItem(`er_rated_${eventId}`)) || null; }
  catch { return null; }
}
function saveStoredRating(eventId, data) {
  try { localStorage.setItem(`er_rated_${eventId}`, JSON.stringify(data)); } catch {}
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
                  <span class="er-star-bg">★</span>
                  <span class="er-star-fill">★</span>
                  <span class="er-half-l" data-val="${n - 0.5 < 1 ? 1 : n - 0.5}"></span>
                  <span class="er-half-r" data-val="${n}"></span>
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

  const isLoggedIn = !!window.MMABridgeAuth?.getToken();

  function updateStars(val) {
    starsEl.querySelectorAll('.er-star-wrap').forEach(w => {
      const n = +w.dataset.n;
      const fill = w.querySelector('.er-star-fill');
      fill.classList.remove('full', 'half');
      if (val >= n)            fill.classList.add('full');
      else if (val >= n - 0.5) fill.classList.add('half');
    });
  }

  starsEl.addEventListener('mouseover', e => {
    if (!isLoggedIn) return;
    const zone = e.target.closest('.er-half-l, .er-half-r');
    if (!zone) return;
    const v = +zone.dataset.val;
    updateStars(v);
    numEl.textContent = `${v}`;
  });

  starsEl.addEventListener('mouseleave', () => {
    if (!isLoggedIn) return;
    updateStars(selected);
    numEl.textContent = selected ? `${selected}` : '';
  });

  starsEl.addEventListener('click', e => {
    if (!isLoggedIn) { requireAuth(); return; }
    const zone = e.target.closest('.er-half-l, .er-half-r');
    if (!zone) return;
    selected = +zone.dataset.val;
    updateStars(selected);
    numEl.textContent = `${selected}`;
    submitBtn.disabled = false;
  });

  textarea.addEventListener('focus', () => {
    if (!isLoggedIn) { textarea.blur(); requireAuth(); }
  }, true);

  // ── Lock/unlock helpers ───────────────────
  function lockForm() {
    starsEl.style.pointerEvents = 'none';
    textarea.disabled = true;
    textarea.style.opacity = '0.45';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Edit your review';
    submitBtn.dataset.mode = 'locked';
  }

  function unlockForm() {
    starsEl.style.pointerEvents = '';
    textarea.disabled = false;
    textarea.style.opacity = '';
    textarea.focus();
    submitBtn.textContent = 'Update Review';
    submitBtn.dataset.mode = 'editing';
  }

  async function refreshCommunity() {
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
  }

  // ── Pre-fill if already rated ─────────────
  let savedData = getStoredRating(eventId);
  if (savedData) {
    selected = savedData.hype_rating;
    updateStars(selected);
    numEl.textContent = `${selected}`;
    if (savedData.review_text) textarea.value = savedData.review_text;
    lockForm();
  }

  // Fetch from backend (authoritative, works cross-device)
  if (isLoggedIn) {
    fetch(`${getApiBase()}/ratings/my/${encodeURIComponent(eventId)}`, {
      headers: authHeaders()
    }).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      savedData = { rating_id: data.rating_id, hype_rating: data.hype_rating, review_text: data.review_text };
      saveStoredRating(eventId, savedData);
      selected = data.hype_rating;
      updateStars(selected);
      numEl.textContent = `${selected}`;
      textarea.value = data.review_text || '';
      lockForm();
    }).catch(() => {});
  }

  textarea.addEventListener('focus', () => { if (!textarea.disabled) textarea.style.borderColor = 'rgba(0,255,255,0.45)'; });
  textarea.addEventListener('blur',  () => textarea.style.borderColor = '#222');

  // ── Submit / Edit ─────────────────────────
  submitBtn.addEventListener('click', async () => {
    // Unlock for editing
    if (submitBtn.dataset.mode === 'locked') {
      unlockForm();
      return;
    }

    if (!selected) return;
    const reviewText = textarea.value.trim();
    const isEdit = submitBtn.dataset.mode === 'editing';

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Updating…' : 'Submitting…';
    errEl.style.display = 'none';

    try {
      let ratingId = savedData?.rating_id;

      if (isEdit && ratingId) {
        await updateRating(ratingId, selected, reviewText);
      } else {
        const res = await submitRating(eventId, name, selected, reviewText);
        ratingId = res.rating_id;
      }

      savedData = { rating_id: ratingId, hype_rating: selected, review_text: reviewText };
      saveStoredRating(eventId, savedData);

      toast.classList.add('show');
      lockForm();
      refreshCommunity();

    } catch (err) {
      console.error('Submit error:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Review' : 'Submit Review';
      errEl.style.display = 'block';
      errEl.textContent = 'Could not save — the backend may be waking up, try again in a moment.';
    }
  });

  // ── Load initial reviews ──────────────────
  loadAndRenderReviews(eventId);
}

// ── Init ──────────────────────────────────────
(async () => {
  pingBackend(); // wake Render free tier before user hits submit

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
