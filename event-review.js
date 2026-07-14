// ==============================================
// MMA BRIDGE — EVENT REVIEW PAGE (Supabase)
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

// ── Supabase helpers ──────────────────────────
function sb() { return window._sb; }
function currentUserId() { return window.MMABridgeAuth?.getUser()?.id || null; }
function isLoggedIn() { return !!window.MMABridgeAuth?.getToken(); }

// ── Fight stats (from ufcstats bot) ──────────
let _fightStatsData = null; // loaded per-event

async function fetchFightStats(eventId) {
  try {
    const data = await fetch(`/data/fight-stats/${encodeURIComponent(eventId)}.json?_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null);
    _fightStatsData = data || null;
  } catch { _fightStatsData = null; }
}

function lookupFightStats(nameA, nameB) {
  if (!_fightStatsData?.fights) return null;
  const normA = (nameA || '').toLowerCase().replace(/[^a-z]/g, '');
  const normB = (nameB || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const f of _fightStatsData.fights) {
    const n1 = f.fighter1.toLowerCase().replace(/[^a-z]/g, '');
    const n2 = f.fighter2.toLowerCase().replace(/[^a-z]/g, '');
    if ((n1 === normA && n2 === normB) || (n1 === normB && n2 === normA)) {
      // Normalise so fighter1 = nameA
      if (n1 === normA) return { a: f.stats.fighter1, b: f.stats.fighter2 };
      return { a: f.stats.fighter2, b: f.stats.fighter1 };
    }
  }
  return null;
}

// ── Load event ────────────────────────────────
async function resolveEvent(eventId) {
  try {
    const cached = sessionStorage.getItem('review_event');
    if (cached) {
      const ev = JSON.parse(cached);
      if ((ev.id || slugify(ev.name || ev.eventName || '')) === eventId) return ev;
    }
  } catch {}
  try {
    const all = await fetch('/events.json?_='+Date.now(),{cache:'no-store'}).then(r => r.json());
    return all.find(ev => ev.id === eventId || slugify(ev.name || '') === eventId) || null;
  } catch {}
  return null;
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

// ── Community badge (sticky top-right) ───────
function updateCommBadge(community) {
  const badge = document.getElementById('erCommBadge');
  const valEl = document.getElementById('erCommBadgeVal');
  if (!badge || !valEl) return;
  if (community?.avg_hype) {
    valEl.textContent = `★ ${community.avg_hype}`;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

// ── Community rating ──────────────────────────
async function fetchCommunityRating(eventId) {
  try {
    const { data, error } = await sb()
      .from('ratings')
      .select('hype_rating')
      .eq('event_id', eventId);
    if (error || !data?.length) return null;
    const avg = (data.reduce((s, r) => s + Number(r.hype_rating), 0) / data.length).toFixed(1);
    return { avg_hype: avg, total_ratings: data.length };
  } catch { return null; }
}

// ── Reviews feed ──────────────────────────────
async function fetchReviews(eventId) {
  try {
    const { data: reviews, error } = await sb()
      .from('ratings')
      .select('*, profiles(display_name, avatar_url)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!reviews?.length) return [];

    const reviewIds = reviews.map(r => r.id);
    const uid = currentUserId();

    const [{ data: likes }, { data: replyCounts }] = await Promise.all([
      sb().from('review_likes').select('rating_id, user_id').in('rating_id', reviewIds),
      sb().from('review_replies').select('rating_id').in('rating_id', reviewIds)
    ]);

    return reviews.map(r => ({
      id:           r.id,
      user_id:      r.user_id,
      display_name: r.profiles?.display_name || 'Anonymous',
      hype_rating:  r.hype_rating,
      review_text:  r.review_text,
      created_at:   r.created_at,
      like_count:   likes?.filter(l => l.rating_id === r.id).length || 0,
      user_liked:   uid ? !!(likes?.find(l => l.rating_id === r.id && l.user_id === uid)) : false,
      reply_count:  replyCounts?.filter(rc => rc.rating_id === r.id).length || 0
    }));
  } catch (e) {
    debugLog('fetchReviews error', e);
    return null;
  }
}

// ── Submit / update rating ────────────────────
async function submitRating(eventId, eventName, rating, reviewText) {
  const uid = currentUserId();
  if (!uid) throw new Error('Not logged in');
  const { data, error } = await sb().from('ratings').insert({
    user_id: uid, event_id: eventId, event_name: eventName,
    hype_rating: rating, review_text: reviewText || null
  }).select().single();
  if (error) throw error;
  return { rating_id: data.id };
}

async function updateRating(ratingId, rating, reviewText) {
  const { error } = await sb().from('ratings').update({
    hype_rating: rating, review_text: reviewText || null,
    updated_at: new Date().toISOString()
  }).eq('id', ratingId);
  if (error) throw error;
}

// ── Get user's own existing rating ────────────
async function fetchMyRating(eventId) {
  const uid = currentUserId();
  if (!uid) return null;
  try {
    const { data } = await sb().from('ratings')
      .select('id, hype_rating, review_text')
      .eq('user_id', uid)
      .eq('event_id', eventId)
      .maybeSingle();
    return data ? { rating_id: data.id, hype_rating: data.hype_rating, review_text: data.review_text } : null;
  } catch { return null; }
}

// ── Stored rating (localStorage cache) ────────
function getStoredRating(eventId) {
  try { return JSON.parse(localStorage.getItem(`er_rated_${eventId}`)) || null; }
  catch { return null; }
}
function saveStoredRating(eventId, data) {
  try { localStorage.setItem(`er_rated_${eventId}`, JSON.stringify(data)); } catch {}
}

// ── Reply item HTML ───────────────────────────
function replyItemHtml(rp, uid) {
  const loggedIn   = isLoggedIn();
  const isOwnReply = !!(uid && rp.user_id === uid);
  return `
    <div class="er-reply-meta">
      <span class="er-reply-author">${esc(rp.display_name)}</span>
      <span class="er-reply-time">${timeAgo(rp.created_at)}</span>
    </div>
    <div class="er-reply-text">${esc(rp.reply_text || rp.text || '')}</div>
    ${!isOwnReply && loggedIn ? `
      <button class="er-reply-like-btn${rp.user_liked ? ' liked' : ''}"
              data-reply-id="${rp.id}" data-liked="${rp.user_liked ? '1' : '0'}">
        <span class="er-like-icon">♥</span>
        <span class="er-reply-like-count">${rp.like_count || 0}</span>
      </button>` : (rp.like_count ? `<span style="font-size:0.67rem;color:rgba(255,255,255,0.2)">♥ ${rp.like_count}</span>` : '')}`;
}

// ── Render reviews list ───────────────────────
function renderReviews(reviews, container) {
  const uid = currentUserId();
  const loggedIn = isLoggedIn();

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
    const hidden  = i >= SHOW_INIT ? ' hidden' : '';
    const isOwn   = !!(uid && rv.user_id === uid);
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

  // ── Review like buttons ───────────────────────
  container.querySelectorAll('.er-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn()) { requireAuth(); return; }
      const reviewId = btn.dataset.reviewId;
      const countEl  = btn.querySelector('.er-like-count');
      btn.disabled = true;
      try {
        const uid = currentUserId();
        const { data: existing } = await sb()
          .from('review_likes').select('id').eq('user_id', uid).eq('rating_id', reviewId).maybeSingle();
        let liked;
        if (existing) {
          await sb().from('review_likes').delete().eq('id', existing.id);
          liked = false;
        } else {
          await sb().from('review_likes').insert({ user_id: uid, rating_id: reviewId });
          liked = true;
        }
        const { count } = await sb().from('review_likes')
          .select('*', { count: 'exact', head: true }).eq('rating_id', reviewId);
        btn.dataset.liked = liked ? '1' : '0';
        btn.classList.toggle('liked', liked);
        countEl.textContent = count ?? 0;
      } catch {} finally { btn.disabled = false; }
    });
  });

  // ── Reply buttons ─────────────────────────────
  container.querySelectorAll('.er-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isLoggedIn()) { requireAuth(); return; }
      const reviewId  = btn.dataset.reviewId;
      const inputWrap = container.querySelector(`.er-reply-input-wrap[data-review-id="${reviewId}"]`);
      const visible   = inputWrap.classList.toggle('visible');
      if (visible) inputWrap.querySelector('.er-reply-textarea').focus();
    });
  });

  // ── Edit own review ───────────────────────────
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
            const uid = currentUserId();
            const { data: replies } = await sb()
              .from('review_replies')
              .select('*, profiles(display_name)')
              .eq('rating_id', reviewId)
              .order('created_at', { ascending: true });

            const replyIds = (replies || []).map(r => r.id);
            const { data: replyLikes } = replyIds.length
              ? await sb().from('reply_likes').select('reply_id, user_id').in('reply_id', replyIds)
              : { data: [] };

            if (replies?.length) {
              const mapped = replies.map(r => ({
                id:           r.id,
                user_id:      r.user_id,
                display_name: r.profiles?.display_name || 'Anonymous',
                text:         r.text,
                created_at:   r.created_at,
                like_count:   replyLikes?.filter(l => l.reply_id === r.id).length || 0,
                user_liked:   uid ? !!(replyLikes?.find(l => l.reply_id === r.id && l.user_id === uid)) : false
              }));
              wrap.innerHTML = mapped.map(r =>
                `<div class="er-reply-item" data-reply-id="${r.id}">${replyItemHtml(r, uid)}</div>`
              ).join('');
              wireReplyLikes(wrap);
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
        const uid = currentUserId();
        const { data: newReply, error } = await sb()
          .from('review_replies')
          .insert({ user_id: uid, rating_id: reviewId, text })
          .select().single();
        if (error) throw error;

        textarea.value = '';
        inputWrap.classList.remove('visible');

        const wrap = container.querySelector(`.er-replies-wrap[data-review-id="${reviewId}"]`);
        const profile = window.MMABridgeAuth?.getUser();
        const item = document.createElement('div');
        item.className = 'er-reply-item';
        item.dataset.replyId = newReply.id;
        item.innerHTML = replyItemHtml({
          id:           newReply.id,
          user_id:      uid,
          display_name: profile?.display_name || 'You',
          text,
          created_at:   newReply.created_at,
          like_count:   0,
          user_liked:   false
        }, uid);
        wrap.appendChild(item);
        wrap.dataset.loaded = '1';
        if (!wrap.classList.contains('open')) wrap.classList.add('open');

        let toggle = section.querySelector('.er-replies-toggle');
        const toggleWrap = section.querySelector('.er-replies-toggle-wrap');
        const newCount = (toggle ? (+toggle.dataset.count || 0) : 0) + 1;
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.className = 'er-replies-toggle';
          toggle.dataset.reviewId = reviewId;
          toggleWrap.appendChild(toggle);
          toggle.addEventListener('click', () => {
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

function wireReplyLikes(wrap) {
  wrap.querySelectorAll('.er-reply-like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn()) { requireAuth(); return; }
      const replyId = btn.dataset.replyId;
      const countEl = btn.querySelector('.er-reply-like-count');
      btn.disabled = true;
      try {
        const uid = currentUserId();
        const { data: existing } = await sb()
          .from('reply_likes').select('id').eq('user_id', uid).eq('reply_id', replyId).maybeSingle();
        let liked;
        if (existing) {
          await sb().from('reply_likes').delete().eq('id', existing.id);
          liked = false;
        } else {
          await sb().from('reply_likes').insert({ user_id: uid, reply_id: replyId });
          liked = true;
        }
        const { count } = await sb().from('reply_likes')
          .select('*', { count: 'exact', head: true }).eq('reply_id', replyId);
        btn.classList.toggle('liked', liked);
        countEl.textContent = count ?? 0;
      } catch {} finally { btn.disabled = false; }
    });
  });
}

// ── Picks helpers ─────────────────────────────
async function fetchMyEventPicks(eventId) {
  const uid = currentUserId();
  if (!uid) return [];
  try {
    const { data } = await sb()
      .from('picks')
      .select('fight_key, pick, method')
      .eq('event_id', eventId)
      .eq('user_id', uid)
      .neq('fight_key', '__dd__')
      .neq('fight_key', 'fotn');
    return data || [];
  } catch { return []; }
}

function getFightByKey(ev, key) {
  const parts = (key || '').split('-');
  const section = parts[0];
  const idx = parseInt(parts[1], 10);
  if (isNaN(idx)) return null;
  if (section === 'main')         return ev.mainCard?.[idx]     || null;
  if (section === 'prelims')      return ev.prelims?.[idx]      || null;
  if (section === 'earlyPrelims') return ev.earlyPrelims?.[idx] || null;
  return null;
}

function gradePicks(ev, picks) {
  let correct = 0, total = 0, points = 0;
  picks.forEach(pick => {
    const fight = getFightByKey(ev, pick.fight_key);
    if (!fight?.winner) return;
    total++;
    const winnerOk = pick.pick?.toLowerCase() === fight.winner?.toLowerCase();
    if (winnerOk) {
      correct++;
      points += 10;
      if (pick.method && fight.method && pick.method.split(' ')[0].toUpperCase() === fight.method.split(' ')[0].toUpperCase()) points += 5;
    }
  });
  return { correct, total, points };
}

async function fetchFotnVotes(eventId) {
  try {
    const { data } = await sb()
      .from('picks')
      .select('pick')
      .eq('event_id', eventId)
      .eq('fight_key', 'fotn');
    if (!data?.length) return null;
    const tally = {};
    data.forEach(p => { if (p.pick) tally[p.pick] = (tally[p.pick] || 0) + 1; });
    const total = data.length;
    const sorted = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([fight, count]) => ({ fight, count, pct: Math.round(count / total * 100) }));
    return { total, votes: sorted.slice(0, 5) };
  } catch { return null; }
}

async function fetchCommunityPicks(eventId) {
  try {
    const { data } = await sb()
      .from('picks')
      .select('fight_key, pick')
      .eq('event_id', eventId)
      .neq('fight_key', '__dd__')
      .neq('fight_key', 'fotn');
    if (!data?.length) return {};
    const byFight = {};
    data.forEach(p => {
      if (!p.fight_key || !p.pick) return;
      if (!byFight[p.fight_key]) byFight[p.fight_key] = {};
      byFight[p.fight_key][p.pick] = (byFight[p.fight_key][p.pick] || 0) + 1;
    });
    return byFight;
  } catch { return {}; }
}

async function loadAndRenderReviews(eventId) {
  const feed = document.getElementById('erReviewsFeed');
  if (!feed) return;
  feed.innerHTML = `<div class="er-reviews-empty" style="opacity:0.5">Loading reviews…</div>`;
  const reviews = await fetchReviews(eventId);
  if (reviews === null) {
    feed.innerHTML = `
      <div class="er-reviews-empty">
        <div>Couldn't load reviews.</div>
        <button class="er-retry-btn" style="margin-top:10px;background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.78rem">Retry</button>
      </div>`;
    feed.querySelector('.er-retry-btn')?.addEventListener('click', () => loadAndRenderReviews(eventId));
    return;
  }
  renderReviews(reviews, feed);
}

// ── Fight card section ────────────────────────
function fightRow(f, communityData) {
  const slotBadge = f.slot === 'main'
    ? '<span class="er-slot-badge er-main-badge">MAIN EVENT</span>'
    : f.slot === 'comain'
      ? '<span class="er-slot-badge er-comain-badge">CO-MAIN</span>'
      : '';
  const titleBadge = f.titleFight ? '<span class="er-title-badge">CHAMPIONSHIP</span>' : '';

  const METHOD_LABELS = {
    'KO':'KO','TKO':'TKO','SUB':'Sub',
    'UD':'UD','SD':'SD','MD':'MD',
    'NC':'NC','Draw':'Draw'
  };

  const clsA = f.winner === f.a ? 'er-won' : f.winner && f.winner !== 'NC' && f.winner !== 'Draw' ? 'er-lost' : '';
  const clsB = f.winner === f.b ? 'er-won' : f.winner && f.winner !== 'NC' && f.winner !== 'Draw' ? 'er-lost' : '';

  const nameA = `<a class="er-fa er-fighter-link ${clsA}" href="fighter.html?name=${encodeURIComponent(f.a)}">${esc(f.a)}</a>`;
  const nameB = `<a class="er-fb er-fighter-link ${clsB}" href="fighter.html?name=${encodeURIComponent(f.b)}">${esc(f.b)}</a>`;

  let pickBarsHtml = '';
  if (communityData && Object.keys(communityData).length) {
    const total = Object.values(communityData).reduce((s, n) => s + n, 0);
    const cntA  = communityData['a'] || 0;
    const pctA  = total ? Math.round(cntA / total * 100) : 50;
    const pctB  = 100 - pctA;
    pickBarsHtml = `
      <div class="er-pick-bars">
        <div class="er-pick-bar-row">
          <span class="er-pick-pct-a">${pctA}%</span>
          <div class="er-pick-bar-track"><div class="er-pick-bar-a" style="width:${pctA}%"></div></div>
          <span class="er-pick-pct-b">${pctB}%</span>
        </div>
        <div class="er-pick-bar-label">Community picks · ${total} vote${total !== 1 ? 's' : ''}</div>
      </div>`;
  }

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

  const fightStats = lookupFightStats(f.a, f.b);
  let statsHtml = '';
  if (fightStats) {
    const s = fightStats;
    function statBar(aVal, bVal, label) {
      const numA = parseInt((aVal || '0').split('/')[0]) || 0;
      const numB = parseInt((bVal || '0').split('/')[0]) || 0;
      const total = numA + numB || 1;
      const pctA = Math.round(numA / total * 100);
      const pctB = 100 - pctA;
      return `
        <div class="er-stat-row">
          <span class="er-stat-val-a">${aVal || '0'}</span>
          <div class="er-stat-bar-wrap">
            <div class="er-stat-bar-a" style="width:${pctA}%"></div>
            <div class="er-stat-bar-b" style="width:${pctB}%"></div>
          </div>
          <span class="er-stat-label">${label}</span>
          <span class="er-stat-val-b">${bVal || '0'}</span>
        </div>`;
    }
    statsHtml = `
      <div class="er-fight-stats">
        ${statBar(s.a.sigStr, s.b.sigStr, 'Sig. Str.')}
        ${statBar(s.a.totalStr, s.b.totalStr, 'Total Str.')}
        ${statBar(s.a.td, s.b.td, 'Takedowns')}
        <div class="er-stat-extras">
          <span>KD: ${s.a.kd || 0}</span>
          <span>Ctrl: ${s.a.ctrlTime || '0:00'}</span>
          <span class="er-stat-extras-mid">vs</span>
          <span>Ctrl: ${s.b.ctrlTime || '0:00'}</span>
          <span>KD: ${s.b.kd || 0}</span>
        </div>
      </div>`;
  }

  return `
    <div class="er-fight-row ${f.slot === 'main' ? 'er-fight-main' : f.slot === 'comain' ? 'er-fight-comain' : ''}">
      ${slotBadge ? `<div>${slotBadge}</div>` : ''}
      <div class="er-fight-names">
        ${nameA}
        <span class="er-fvs">vs</span>
        ${nameB}
        ${titleBadge}
      </div>
      <div class="er-fight-meta">
        ${f.weight ? `<span class="pill">${esc(f.weight)}</span>` : ''}
        ${f.rounds ? `<span class="pill pill-dim">${esc(f.rounds)}</span>` : ''}
      </div>
      ${pickBarsHtml}
      ${resultHtml}
      ${statsHtml}
    </div>`;
}

function fightSection(label, fights, communityPicksByKey) {
  if (!fights?.length) return '';
  const sectionKey = label === 'Main Card' ? 'main' : label === 'Prelims' ? 'prelims' : 'earlyPrelims';
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
        ${fights.map((f, i) => fightRow(f, communityPicksByKey?.[`${sectionKey}-${i}`])).join('')}
      </div>
    </details>`;
}

// ── Render page ───────────────────────────────
function renderPage(ev, community, extra = {}) {
  const { communityPicks = {}, fotnVotes = null, myPicks = [] } = extra;
  const eventId = ev.id || slugify(ev.name || ev.eventName || '');
  const name    = ev.name || ev.eventName || 'Unnamed Event';
  const poster  = ev.poster || '';
  const avg     = community?.avg_hype ?? null;
  const total   = community?.total_ratings ?? 0;

  const hasCard = (ev.mainCard?.length || ev.prelims?.length || ev.earlyPrelims?.length);

  // Login CTA for non-logged-in users
  const loginCta = !isLoggedIn() ? `
    <div class="er-login-cta">
      <div class="er-login-cta-stars">★★★★★</div>
      <div style="flex:1;">
        <div class="er-login-cta-title">Rate this card</div>
        <div class="er-login-cta-sub">Sign in to share your take with the community</div>
      </div>
      <a href="auth.html" class="er-login-cta-btn" onclick="sessionStorage.setItem('auth_return_to',location.href)">Sign In →</a>
    </div>` : '';

  // Your Picks accuracy card (completed events only)
  const picksGrade = myPicks?.length && ev.status === 'completed' ? gradePicks(ev, myPicks) : null;
  const myPicksHtml = picksGrade && picksGrade.total > 0 ? `
    <div class="er-card er-picks-summary">
      <div class="er-card-title">Your Picks</div>
      <div class="er-picks-stats">
        <div class="er-picks-stat">
          <div class="er-picks-stat-num">${picksGrade.correct}/${picksGrade.total}</div>
          <div class="er-picks-stat-label">Correct</div>
        </div>
        <div class="er-picks-stat">
          <div class="er-picks-stat-num">${picksGrade.points}</div>
          <div class="er-picks-stat-label">Points</div>
        </div>
        <div class="er-picks-stat">
          <div class="er-picks-stat-num">${picksGrade.total ? Math.round(picksGrade.correct / picksGrade.total * 100) : 0}%</div>
          <div class="er-picks-stat-label">Accuracy</div>
        </div>
      </div>
      <a class="er-picks-link" href="picks.html?id=${encodeURIComponent(eventId)}">See all picks →</a>
    </div>` : '';

  // FOTN community vote reveal (completed events)
  const fotnHtml = fotnVotes?.votes?.length ? `
    <div class="er-card">
      <div class="er-card-title">FOTN Predictions — Community Vote</div>
      <div class="er-fotn-votes">
        ${fotnVotes.votes.map((v, i) => `
          <div class="er-fotn-vote-row">
            <div class="er-fotn-vote-rank">#${i + 1}</div>
            <div class="er-fotn-vote-fight">${esc(v.fight)}</div>
            <div class="er-fotn-vote-bar-wrap"><div class="er-fotn-vote-bar" style="width:${v.pct}%"></div></div>
            <div class="er-fotn-vote-pct">${v.pct}%</div>
          </div>`).join('')}
        <div class="er-fotn-vote-total">${fotnVotes.total} prediction${fotnVotes.total !== 1 ? 's' : ''} total</div>
      </div>
    </div>` : '';

  breadcrumb.textContent = name;
  document.title = `MMA Bridge | ${name}`;

  root.innerHTML = `
    <div class="er-page">

      ${poster ? `
        <div class="er-hero">
          <img class="er-hero-img" src="${esc(poster)}" alt="${esc(name)}" onerror="this.onerror=null;this.style.display='none'">
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

        <div class="er-content">

          <div class="er-community-bar">
            <span class="er-comm-label">Community Rating</span>
            <span class="er-comm-val" id="erCommVal">
              ${avg ? `★ ${avg} &nbsp;·&nbsp; ${total} rating${total!==1?'s':''}` : 'No ratings yet — be first!'}
            </span>
          </div>

          ${loginCta}

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

          <div class="er-card">
            <div class="er-card-title">Leave a review <span class="er-optional">(optional)</span></div>
            <textarea id="erReviewText"
              placeholder="Break down the card — standout fights, surprises, disappointments, what you'd give FOTN..."
              rows="4"
            ></textarea>
          </div>

          <button class="er-submit" id="erSubmit" disabled>Submit Review</button>
          <div class="er-toast" id="erToast"></div>
          <div class="er-error-msg" id="erErr" style="display:none"></div>

          ${myPicksHtml}
          ${fotnHtml}

          ${hasCard ? `
            <div class="er-card er-card-fights">
              <div class="er-card-title">Full Fight Card</div>
              ${fightSection('Main Card',     ev.mainCard,     communityPicks)}
              ${fightSection('Prelims',       ev.prelims,      communityPicks)}
              ${fightSection('Early Prelims', ev.earlyPrelims, communityPicks)}
            </div>` : ''}

        </div>

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

  // ── Stars ──────────────────────────────────
  let selected = 0;
  const starsEl   = root.querySelector('#erStars');
  const numEl     = root.querySelector('#erRatingNum');
  const submitBtn = root.querySelector('#erSubmit');
  const toast     = root.querySelector('#erToast');
  const errEl     = root.querySelector('#erErr');
  const textarea  = root.querySelector('#erReviewText');

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
    if (!isLoggedIn()) return;
    const zone = e.target.closest('.er-half-l, .er-half-r');
    if (!zone) return;
    updateStars(+zone.dataset.val);
    numEl.textContent = zone.dataset.val;
  });
  starsEl.addEventListener('mouseleave', () => {
    if (!isLoggedIn()) return;
    updateStars(selected);
    numEl.textContent = selected ? `${selected}` : '';
  });
  starsEl.addEventListener('click', e => {
    if (!isLoggedIn()) { requireAuth(); return; }
    const zone = e.target.closest('.er-half-l, .er-half-r');
    if (!zone) return;
    selected = +zone.dataset.val;
    updateStars(selected);
    numEl.textContent = `${selected}`;
    submitBtn.disabled = false;
  });

  textarea.addEventListener('focus', () => {
    if (!isLoggedIn()) { textarea.blur(); requireAuth(); }
  }, true);

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
      updateCommBadge(fresh);
    }
  }

  // ── Pre-fill from localStorage cache ─────────
  let savedData = getStoredRating(eventId);
  if (savedData) {
    selected = savedData.hype_rating;
    updateStars(selected);
    numEl.textContent = `${selected}`;
    if (savedData.review_text) textarea.value = savedData.review_text;
    lockForm();
  }

  // Fetch authoritative data from Supabase
  if (isLoggedIn()) {
    fetchMyRating(eventId).then(data => {
      if (!data) return;
      savedData = data;
      saveStoredRating(eventId, savedData);
      selected = data.hype_rating;
      updateStars(selected);
      numEl.textContent = `${selected}`;
      textarea.value = data.review_text || '';
      lockForm();
    });
  }

  textarea.addEventListener('focus', () => { if (!textarea.disabled) textarea.style.borderColor = 'rgba(240,180,41,0.45)'; });
  textarea.addEventListener('blur',  () => textarea.style.borderColor = '#222');

  // ── Submit / Edit ─────────────────────────────
  submitBtn.addEventListener('click', async () => {
    if (submitBtn.dataset.mode === 'locked') { unlockForm(); return; }
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
      const tweetText = encodeURIComponent(`Just rated ${name} ${selected}/5 on MMA Bridge!`);
      const tweetUrl  = encodeURIComponent(location.href);
      toast.innerHTML = `Review saved! <a class="er-share-x" href="https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}" target="_blank" rel="noopener">Share on X →</a>`;
      toast.classList.add('show');
      lockForm();
      refreshCommunity();
    } catch (err) {
      debugLog('Submit error:', err);
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Review' : 'Submit Review';
      errEl.style.display = 'block';
      errEl.textContent = 'Could not save — please try again.';
    }
  });

  loadAndRenderReviews(eventId);
}

// ── Init ──────────────────────────────────────
(async () => {
  const params  = new URLSearchParams(window.location.search);
  const eventId = params.get('id');

  // Back navigation — set breadcrumb link based on referrer
  const breadcrumbLink = document.getElementById('breadcrumbLink');
  if (breadcrumbLink) {
    const ref = document.referrer || '';
    if (ref.includes('events.html')) {
      breadcrumbLink.href = 'events.html';
      breadcrumbLink.textContent = 'Events';
    } else if (ref.includes('index.html') || ref.endsWith('/') || ref.endsWith('mmabridge.com')) {
      breadcrumbLink.href = 'index.html';
      breadcrumbLink.textContent = 'Home';
    }
    // default stays reviews.html
  }

  if (!eventId) {
    root.innerHTML = `<div class="er-empty">No event specified. <a href="reviews.html">← Back</a></div>`;
    return;
  }

  root.innerHTML = `
    <div class="er-skeleton">
      <div class="er-skel-hero"></div>
      <div class="er-skel-body">
        <div class="er-skel-block er-skel-tall"></div>
        <div class="er-skel-block"></div>
        <div class="er-skel-block"></div>
      </div>
    </div>`;

  // Pull event from sessionStorage immediately so we can fire all queries in parallel
  let evFromCache = null;
  try {
    const cached = sessionStorage.getItem('review_event');
    if (cached) {
      const p = JSON.parse(cached);
      if ((p.id || slugify(p.name || p.eventName || '')) === eventId) evFromCache = p;
    }
  } catch {}

  try {
    // Fire everything in one parallel batch — no sequential waits
    const loggedIn = isLoggedIn();
    const [ev, community, communityPicks, fotnVotes, myPicks] = await Promise.all([
      evFromCache ? Promise.resolve(evFromCache) : resolveEvent(eventId),
      fetchCommunityRating(eventId),
      fetchCommunityPicks(eventId),
      fetchFotnVotes(eventId),
      loggedIn ? fetchMyEventPicks(eventId) : Promise.resolve([]),
      fetchFightStats(eventId),
    ]);

    if (!ev) {
      root.innerHTML = `<div class="er-empty">Event not found. <a href="reviews.html">← Back</a></div>`;
      return;
    }

    const isCompleted = ev.status === 'completed';

    // Dynamic page title + OG tags
    if (ev.name) {
      document.title = `${ev.name} — Review | MMA Bridge`;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = `${ev.name} — Review | MMA Bridge`;
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.content = `${ev.name} — Review | MMA Bridge`;
    }
    if (ev.poster) {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.content = ev.poster;
      const twImg = document.querySelector('meta[name="twitter:image"]');
      if (twImg) twImg.content = ev.poster;
    }

    updateCommBadge(community);
    renderPage(ev, community, {
      communityPicks: isCompleted ? (communityPicks || {}) : {},
      fotnVotes:      isCompleted ? fotnVotes : null,
      myPicks:        isCompleted ? (myPicks || []) : []
    });
  } catch (err) {
    debugLog(err);
    root.innerHTML = `<div class="er-empty">Failed to load. <a href="reviews.html">← Back</a></div>`;
  }
})();
