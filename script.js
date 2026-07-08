// ==============================================
// MMA BRIDGE - HOMEPAGE
// ==============================================

import CONFIG, { debugLog } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {

  // Keep Render backend awake
  fetch(CONFIG.API.BASE_URL + '/health').catch(() => {});

  // Load events for hero + recent results
  try {
    const all = await fetch('/events.json?_=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
    const now = new Date();

    const past = all
      .filter(e => e.status === 'completed' && e.poster)
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate));

    // 4-state hero resolution: results window → today → upcoming → past
    const resolved = resolveHeroEvent(all, now);
    if (resolved) {
      if (resolved.mode === 'split') {
        renderHeroSplit(resolved.completed, resolved.ev);
      } else {
        renderHero(resolved.ev, resolved.mode);
      }
    }

    // ── Notification banner check ─────────────
    checkEventNotifications(all);

    // ── Favorite fighter notifications ────────
    if (window.MMANotif) window.MMANotif.checkEvents(all);

    renderRecentResults(past);
  } catch(e) { debugLog('Events error:', e); }

  // Load news — don't await so it doesn't block the page
  renderNews();
  renderReddit();
  setupSearch();
});

// ── Hero resolution (dynamic 5-state formula) ─────────────────
// TODAY → TONIGHT
// next event ≤7 days + before Wednesday 11:59pm → SPLIT SCREEN
// next event ≤7 days + after Wednesday 11:59pm → single UPCOMING
// next event >7 days → single COMPLETED
function resolveHeroEvent(all, now) {
  const todayStr = now.toISOString().slice(0, 10);

  // 1. TODAY — event happening today, not yet completed
  const todayFight = all.find(e => e.isoDate === todayStr && e.status !== 'completed');
  if (todayFight) return { ev: todayFight, mode: 'today' };

  // Find next upcoming event (future dates only)
  const next = all
    .filter(e => e.isoDate > todayStr && e.status !== 'completed')
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0];

  // Most recent completed event
  const lastCompleted = all
    .filter(e => e.status === 'completed')
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0];

  if (!next) {
    // No upcoming events — show completed
    return lastCompleted ? { ev: lastCompleted, mode: 'completed' } : null;
  }

  const eventDate = new Date(next.isoDate + 'T20:00:00');
  const daysUntil = (eventDate - now) / 86400000;

  if (daysUntil > 7) {
    // >7 days away — show most recent completed
    return lastCompleted ? { ev: lastCompleted, mode: 'completed' } : { ev: next, mode: 'upcoming' };
  }

  // ≤7 days away — check Wednesday 11:59pm cutoff
  const wednesdayCutoff = getWednesdayCutoff(eventDate);

  const daysSinceCompleted = lastCompleted
    ? (now - new Date(lastCompleted.isoDate + 'T20:00:00')) / 86400000
    : Infinity;

  if (now <= wednesdayCutoff && lastCompleted && daysSinceCompleted < 7) {
    // Recent completed event + before Wednesday midnight → SPLIT SCREEN
    return { mode: 'split', ev: next, completed: lastCompleted };
  }
  // After Wednesday midnight (or no recent event) → single upcoming
  return { mode: 'upcoming', ev: next };
}

// Wednesday 11:59:59pm of the same calendar week as the event
function getWednesdayCutoff(eventDate) {
  const day = eventDate.getDay(); // 0=Sun, 3=Wed, 6=Sat
  const daysFromWed = (day - 3 + 7) % 7;
  const wed = new Date(eventDate);
  wed.setDate(eventDate.getDate() - daysFromWed);
  wed.setHours(23, 59, 59, 0);
  return wed;
}

// Check if logged-in user has picks for an event (async)
async function userHasPicks(eventId) {
  try {
    const sb = window._sb;
    if (!sb) return false;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data } = await sb.from('picks').select('fight_key').eq('user_id', user.id).eq('event_id', eventId).limit(1);
    return !!(data && data.length > 0);
  } catch (e) { return false; }
}

// ── New editorial hero render ─────────────────
function renderHero(ev, mode) {
  if (!ev) return;
  const isPPV = ev.type === 'PPV';
  const me = ev.mainCard?.[0];

  function lastName(fullName) {
    if (!fullName) return '';
    const parts = (fullName || '').trim().split(' ');
    return parts[parts.length - 1].toUpperCase();
  }

  const nameA = lastName(me?.a);
  const nameB = lastName(me?.b);

  // Eyebrow
  let eyebrowParts = [];
  if (mode === 'today') {
    eyebrowParts = ['<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;background:#ff2020;border-radius:50%;box-shadow:0 0 8px 2px rgba(255,30,30,0.7);animation:pulse 1.5s infinite;flex-shrink:0"></span>TONIGHT</span>', 'LIVE NOW'];
  } else if (mode === 'completed' || mode === 'results') {
    eyebrowParts = ['RESULTS', isPPV ? 'PAY-PER-VIEW' : 'FIGHT NIGHT'];
  } else {
    eyebrowParts = ['NEXT', isPPV ? 'PAY-PER-VIEW' : 'FIGHT NIGHT', ev.name || ''];
  }
  const eyebrowHTML = eyebrowParts.filter(Boolean).map((p, i) => i === 0 ? p : `<span class="nh-dot">·</span>${p}`).join(' ');

  // Names
  let namesHTML = '';
  if (nameA || nameB) {
    namesHTML = `
      <div class="nh-name-a">${nameA}</div>
      <div class="nh-name-vs-row">
        <span class="nh-vs-label">vs.</span>
        <span class="nh-name-b">${nameB}</span>
      </div>`;
  } else {
    namesHTML = `<div class="nh-name-a" style="font-size:clamp(2rem,4vw,3.5rem)">${(ev.name||'').toUpperCase()}</div>`;
  }

  // Tagline
  let tagline = '';
  const tparts = [me?.weight, ev.date, ev.venue || ev.location].filter(Boolean);
  if (mode === 'today') {
    tagline = `Fight night is here. ${tparts.slice(1).join(' · ')}.`;
  } else if (mode === 'completed' || mode === 'results') {
    if (me?.winner) {
      const loser = me.winner === me.a ? me.b : me.a;
      tagline = `${me.winner} def. ${loser}${me.method ? ' by ' + me.method : ''}${me.round ? ', Round ' + me.round : ''}. ${ev.date}.`;
    } else {
      tagline = [ev.date, ev.location].filter(Boolean).join(' · ') + '.';
    }
  } else {
    tagline = [tparts[0], tparts.slice(1).join(' · ')].filter(Boolean).join(' · ') + '.';
  }

  // Buttons
  const eventId = encodeURIComponent(ev.id || '');
  let btnsHTML = '';
  if (mode === 'today') {
    btnsHTML = `<a class="nh-btn-primary red" href="https://www.espn.com/watch/" target="_blank" rel="noopener">Watch Live →</a>
      <a class="nh-btn-secondary" href="events.html?id=${eventId}">Fight Card</a>`;
  } else if (mode === 'completed' || mode === 'results') {
    btnsHTML = `<a class="nh-btn-primary green" href="events.html?id=${eventId}">Review the Card →</a>
      <a class="nh-btn-secondary" href="reviews.html">Write a Review</a>`;
  } else {
    btnsHTML = `<a class="nh-btn-primary" href="picks.html?event=${eventId}">Make your picks →</a>
      <a class="nh-btn-secondary" href="picks.html?event=${eventId}">Full fight card</a>`;
  }

  // Stats bar
  const totalFights = ((ev.mainCard||[]).length + (ev.prelims||[]).length + (ev.earlyPrelims||[]).length);
  const isLocked = ev.start_time && new Date() >= new Date(ev.start_time);
  const picksStatus = (mode === 'completed' || mode === 'results') ? 'Results In' : isLocked ? 'Locked' : 'Live';
  const picksClass = (mode === 'upcoming' || mode === 'today') && !isLocked ? 'nh-stat-live' : 'nh-stat-locked';
  const picksDot = picksClass === 'nh-stat-live' ? '<span class="nh-live-dot"></span>' : '';

  function getCountdown(isoDate) {
    const eventTime = new Date(isoDate + 'T22:00:00');
    const diff = eventTime - new Date();
    if (diff <= 0) return null;
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    return { days, hours, mins };
  }

  let statsHTML = '';
  if (mode === 'upcoming' || mode === 'today' || mode === 'split') {
    const cd = getCountdown(ev.isoDate);
    const cdStr = cd
      ? (cd.days > 0
          ? `<span id="nhCdDays">${cd.days}</span><sub>d</sub> <span id="nhCdHrs">${cd.hours}</span><sub>h</sub>`
          : `<span id="nhCdHrs">${cd.hours}</span><sub>h</sub> <span id="nhCdMins">${cd.mins}</span><sub>m</sub>`)
      : 'Tonight';
    statsHTML = `
      <div class="nh-stat">
        <div class="nh-stat-val" id="nhCountdown">${cdStr}</div>
        <div class="nh-stat-label">Until fight night</div>
      </div>
      <div class="nh-stat-sep"></div>
      <div class="nh-stat">
        <div class="nh-stat-val">${totalFights}</div>
        <div class="nh-stat-label">Bouts on the card</div>
      </div>
      <div class="nh-stat-sep"></div>
      <div class="nh-stat ${picksClass}">
        <div class="nh-stat-val">${picksDot}${picksStatus}</div>
        <div class="nh-stat-label">Community picks</div>
      </div>`;
  } else {
    const winner = me?.winner || '';
    statsHTML = `
      <div class="nh-stat">
        <div class="nh-stat-val">${totalFights}</div>
        <div class="nh-stat-label">Bouts on the card</div>
      </div>
      ${winner ? `
      <div class="nh-stat-sep"></div>
      <div class="nh-stat">
        <div class="nh-stat-val" style="font-size:1.1rem;color:#f0b429">${winner}</div>
        <div class="nh-stat-label">Main event winner</div>
      </div>` : ''}`;
  }

  // Poster meta bottom-right
  let posterMetaHTML = '';
  if (ev.date || ev.venue) {
    const dateParts = (ev.date || '').split(',');
    const dayStr  = dateParts[0]?.trim() || '';
    const restStr = dateParts.slice(1).join(',').trim() || '';
    posterMetaHTML = `${dayStr ? `<div>${dayStr}</div>` : ''}${restStr ? `<div style="color:rgba(255,255,255,0.5)">${restStr}</div>` : ''}${ev.venue ? `<div style="margin-top:2px;color:rgba(255,255,255,0.5)">${ev.venue}</div>` : ''}`;
  }

  // Inject
  const eyebrowEl = document.getElementById('nhEyebrow');
  const namesEl   = document.getElementById('nhNames');
  const taglineEl = document.getElementById('nhTagline');
  const btnsEl    = document.getElementById('nhBtns');
  const statsEl   = document.getElementById('nhStats');
  const posterImg = document.getElementById('nhPosterImg');
  const posterMeta= document.getElementById('nhPosterMeta');

  if (eyebrowEl) eyebrowEl.innerHTML  = eyebrowHTML;
  if (namesEl)   namesEl.innerHTML    = namesHTML;
  if (taglineEl) taglineEl.textContent = tagline;
  if (btnsEl)    btnsEl.innerHTML     = btnsHTML;
  if (statsEl)   statsEl.innerHTML    = statsHTML;
  if (posterImg && ev.poster) { posterImg.src = ev.poster; posterImg.alt = ev.name || ''; }
  if (posterMeta) posterMeta.innerHTML = posterMetaHTML;

  // Live countdown tick
  if ((mode === 'upcoming' || mode === 'today') && ev.isoDate) {
    const tickInterval = setInterval(() => {
      const cd = getCountdown(ev.isoDate);
      if (!cd) { clearInterval(tickInterval); return; }
      const dEl = document.getElementById('nhCdDays');
      const hEl = document.getElementById('nhCdHrs');
      const mEl = document.getElementById('nhCdMins');
      if (dEl) dEl.textContent = cd.days;
      if (hEl) hEl.textContent = cd.hours;
      if (mEl) mEl.textContent = cd.mins;
    }, 60000);
  }
}

// ── Split mode: show upcoming in editorial layout ─────────────
function renderHeroSplit(completedEv, upcomingEv) {
  renderHero(upcomingEv, 'upcoming');
}

// ── Event Notifications ───────────────────────
function checkEventNotifications(events) {
  try {
    const subs = JSON.parse(localStorage.getItem('mma_notif_subs') || '[]');
    if (!subs.length) return;
    const now = new Date();
    const soon = events.filter(ev => {
      if (!subs.includes(ev.id) || ev.status !== 'upcoming') return false;
      const t = ev.startTime || '22:00';
      const start = new Date(`${ev.isoDate}T${t}:00-04:00`);
      const hrs = (start - now) / 3600000;
      return hrs >= 0 && hrs <= 24;
    });
    if (!soon.length) return;
    const target = soon[0];
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9998;background:linear-gradient(135deg,#0a1820,#0d2538);border:1px solid rgba(240,180,41,0.28);border-radius:12px;padding:14px 18px;max-width:380px;width:calc(100% - 40px);box-shadow:0 8px 40px rgba(0,0,0,0.6);display:flex;align-items:center;gap:12px;animation:sectionFadeIn 0.4s ease both;';
    banner.innerHTML = `
      <span style="flex-shrink:0;display:flex;align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(240,180,41,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:Montserrat,sans-serif;font-size:0.78rem;font-weight:700;color:#fff;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${target.name} is today!</div>
        <div style="font-family:Inter,sans-serif;font-size:0.68rem;color:rgba(255,255,255,0.38);">Starts ${target.startTime || '10PM'} ET · ${target.venue || target.location || ''}</div>
      </div>
      <a href="events.html?id=${encodeURIComponent(target.id)}" style="flex-shrink:0;background:rgba(240,180,41,0.09);border:1px solid rgba(240,180,41,0.28);color:cyan;font-family:Montserrat,sans-serif;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:7px 12px;border-radius:6px;text-decoration:none;">View</a>
      <button onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;color:rgba(255,255,255,0.22);cursor:pointer;font-size:1.1rem;padding:4px;line-height:1;">✕</button>`;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentElement) banner.remove(); }, 10000);
  } catch {}
}

// ── Recent Results Infinite Scroll ───────────
function renderRecentResults(events) {
  const track = document.getElementById('resultsTrack');
  const inner = document.getElementById('resultsInner');
  if (!inner || !events.length) return;

  const METHOD = {'KO':'KO','TKO':'TKO','SUB':'Sub','UD':'UD','SD':'SD','MD':'MD','NC':'NC','Draw':'Draw'};

  function buildCard(ev) {
    const me     = ev.mainCard?.[0];
    const winner = me?.winner || '';
    const method = me?.method || '';
    const loser  = winner === me?.a ? me?.b : me?.a;
    const slug   = ev.id || '';
    const methodLabel = METHOD[method] || method;

    const isLight = document.body.classList.contains('light-mode');
    const cardBg  = isLight ? '#fff' : '#111';
    const cardBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';
    const dateCol = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';
    const nameCol = isLight ? '#111' : '#fff';
    const metaCol = isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)';

    const card = document.createElement('a');
    card.href  = `event-review.html?id=${encodeURIComponent(slug)}`;
    card.style.cssText = `display:block;text-decoration:none;flex-shrink:0;width:280px;background:${cardBg};border:1px solid ${cardBorder};border-radius:12px;overflow:hidden;transition:border-color 0.2s,transform 0.2s;`;
    card.onmouseenter = () => { card.style.borderColor='rgba(240,180,41,0.3)'; card.style.transform='translateY(-3px)'; };
    card.onmouseleave = () => { card.style.borderColor=cardBorder; card.style.transform='none'; };
    card.innerHTML = `
      <div style="height:160px;background-image:url('${ev.poster||''}');background-size:cover;background-position:center top;filter:brightness(0.75);"></div>
      <div style="padding:14px 16px;">
        <div style="font-family:'Montserrat',sans-serif;font-size:0.58rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${dateCol};margin-bottom:5px;">${ev.date||''}</div>
        <div style="font-family:'Montserrat',sans-serif;font-size:0.8rem;font-weight:800;color:${nameCol};margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.name||''}</div>
        ${winner ? `
          <div style="font-family:'Inter',sans-serif;font-size:0.76rem;color:#f0b429;font-weight:600;">${winner} def. ${loser}</div>
          <div style="font-family:'Inter',sans-serif;font-size:0.68rem;color:${metaCol};margin-top:3px;">${methodLabel} · R${me?.round||''}</div>
        ` : ''}
      </div>`;
    return card;
  }

  // Build cards + duplicate for seamless infinite loop
  [...events, ...events].forEach(ev => inner.appendChild(buildCard(ev)));

  // ── Auto scroll ──
  let x = 0;
  let paused = false;
  let dragging = false;
  let dragStartX = 0;
  let dragScrollX = 0;
  const speed = 0.25;

  track.addEventListener('mouseenter', () => paused = true);
  track.addEventListener('mouseleave', () => { if (!dragging) paused = false; });

  track.addEventListener('mousedown', e => {
    dragging = true; paused = true;
    dragStartX = e.clientX; dragScrollX = x;
    track.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    x = dragScrollX - (e.clientX - dragStartX);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; paused = false;
    track.style.cursor = 'grab';
  });

  track.addEventListener('touchstart', e => {
    paused = true; dragStartX = e.touches[0].clientX; dragScrollX = x;
  }, {passive:true});
  track.addEventListener('touchmove', e => {
    x = dragScrollX - (e.touches[0].clientX - dragStartX);
  }, {passive:true});
  track.addEventListener('touchend', () => paused = false);

  /* Arrow buttons — pause auto-scroll, shift x, resume after 1.5s */
  const prevBtn = document.getElementById('resultsPrev');
  const nextBtn = document.getElementById('resultsNext');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    x = Math.max(0, x - 400);
    paused = true;
    clearTimeout(prevBtn._t);
    prevBtn._t = setTimeout(() => { paused = false; }, 1500);
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    x += 400;
    paused = true;
    clearTimeout(nextBtn._t);
    nextBtn._t = setTimeout(() => { paused = false; }, 1500);
  });

  function animate() {
    if (!paused) x += speed;
    const halfWidth = inner.scrollWidth / 2;
    if (x >= halfWidth) x -= halfWidth;
    if (x < 0) x = 0;
    inner.style.transform = `translateX(-${x}px)`;
    requestAnimationFrame(animate);
  }
  animate();
}


// ── News ──────────────────────────────────────
async function renderNews() {
  const container = document.getElementById('trending-cards');
  const list      = document.getElementById('today-list');

  const FALLBACK = [
    {
      title: 'UFC 328: Chimaev vs. Strickland — What Happened and What\'s Next',
      url: 'https://mmajunkie.usatoday.com/category/ufc',
      imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-04/050926-ufc-329-chimaev-vs-strickland-EVENT-ART.jpg',
      source: 'MMA Junkie'
    },
    {
      title: 'McGregor vs. Holloway 2: Everything You Need to Know About UFC 329',
      url: 'https://www.espn.com/mma/',
      imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-05/071126-ufc-329-mcgregor-vs-holloway-2-EVENT-ART.jpg',
      source: 'ESPN MMA'
    },
    {
      title: 'UFC Freedom 250: Topuria vs. Gaethje Preview — Title Fight Preview',
      url: 'https://www.cbssports.com/ufc/',
      imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-04/061426-ufc-250-topuria-vs-gaethje-EVENT-ART.jpg',
      source: 'CBS Sports'
    },
  ];

  try {
    // Show fallback articles immediately — no network wait
    let articles = FALLBACK;

    // Render immediately with fallbacks
    paintNews(articles, container, list);

    // Fetch real news in background; update if we get something better
    if (CONFIG.IS_DEV) {
      try {
        const d = await fetch('/data/news.json').then(r => r.json());
        if (d.trending?.length) paintNews(d.trending, container, list);
      } catch {}
    } else {
      try {
        const d = await fetch(CONFIG.API.BASE_URL + '/news').then(r => r.json());
        if (d.trending?.length) paintNews(d.trending, container, list);
      } catch {}
    }

  } catch(e) {
    debugLog('News error:', e);
  }
}

function paintNews(articles, container, list) {
  try {

    // Render cards — keep extras in queue, swap on broken image
    window._newsQueue = articles.slice(3);

    function buildCard(a, idx) {
      return '<a href="' + (a.url||'#') + '" target="_blank" rel="noopener noreferrer" class="card-link" id="news-card-' + idx + '">' +
        '<div class="medium-card">' +
          '<div class="card-image" style="background-color:#111;overflow:hidden;">' +
            '<img src="' + (a.imageUrl||'') + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="replaceNewsCard(' + idx + ')" />' +
          '</div>' +
          '<div style="padding:16px 18px 18px;">' +
            '<div class="nc-title-' + idx + '" style="font-family:Montserrat,sans-serif;font-size:1.02rem;font-weight:700;color:#fff;line-height:1.4;margin-bottom:10px;">' + (a.title||'') + '</div>' +
            '<div class="nc-source-' + idx + '" style="font-family:Montserrat,sans-serif;font-size:0.58rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);">· ' + (a.source||'') + '</div>' +
          '</div>' +
        '</div>' +
      '</a>';
    }

    window.replaceNewsCard = function(idx) {
      if (!window._newsQueue || !window._newsQueue.length) {
        var card = document.getElementById('news-card-' + idx);
        if (card) card.style.display = 'none';
        return;
      }
      var next = window._newsQueue.shift();
      var card = document.getElementById('news-card-' + idx);
      if (!card) return;
      card.href = next.url || '#';
      var img = card.querySelector('img');
      if (img) img.src = next.imageUrl || '';
      var t = card.querySelector('.nc-title-' + idx);
      var s = card.querySelector('.nc-source-' + idx);
      if (t) t.textContent = next.title || '';
      if (s) s.textContent = next.source || '';
    };

    if (container) {
      container.innerHTML = articles.slice(0, 3).map(function(a, i) { return buildCard(a, i); }).join('');
      if (window.MicroStaggerNews) MicroStaggerNews(container);
    }

    // Sidebar
    if (list) {
      list.innerHTML = articles.slice(0, 5).map(a =>
        `<li><a href="${a.url||'#'}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${a.title||''}</a></li>`
      ).join('');
    }

  } catch(e) {
    debugLog('News error:', e);
    const container = document.getElementById('trending-cards');
    const list = document.getElementById('today-list');
    if (container && !container.innerHTML.trim()) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.3);font-family:'Inter',sans-serif;font-size:0.85rem;">
        Couldn't load news right now. Check back shortly.
      </div>`;
    }
    if (list && !list.innerHTML.trim()) {
      list.innerHTML = `<li style="color:rgba(255,255,255,0.3);font-size:0.8rem;list-style:none;">Unable to load headlines</li>`;
    }
  }
}

// ── Search ────────────────────────────────────
// ── Reddit r/ufc Trending ─────────────────────
// Fetches directly from Reddit's browser CORS API (no bot/proxy needed)
async function renderReddit() {
  const section = document.getElementById('redditSection');
  const container = document.getElementById('redditPosts');
  if (!section || !container) return;
  try {
    const res = await fetch('https://www.reddit.com/r/ufc/hot.json?limit=15', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const posts = (data?.data?.children || [])
      .filter(c => c.kind === 't3' && !c.data.stickied && !c.data.pinned)
      .slice(0, 8)
      .map(c => ({
        title:    c.data.title,
        url:      `https://reddit.com${c.data.permalink}`,
        score:    c.data.score,
        comments: c.data.num_comments,
        flair:    c.data.link_flair_text || '',
      }));
    if (!posts.length) return;

    const flairColors = {
      'Discussion': '#f0b429', 'News': '#f59e0b', 'Video': '#ef4444',
      'Meme': '#a855f7', 'Highlight': '#22c55e', 'Ranking': '#f59e0b',
    };

    container.innerHTML = posts.map(p => {
      const title = p.title.length > 85 ? p.title.slice(0, 82) + '…' : p.title;
      const flairColor = (p.flair && flairColors[p.flair]) || 'rgba(255,255,255,0.25)';
      const flairHtml = p.flair ? `<span class="reddit-flair" style="border-color:${flairColor};color:${flairColor}">${esc(p.flair)}</span>` : '';
      const score = p.score >= 1000 ? `${(p.score / 1000).toFixed(1)}k` : p.score;
      return `
        <a class="reddit-post" href="${p.url}" target="_blank" rel="noopener noreferrer">
          <div class="reddit-post-title">${esc(title)}</div>
          <div class="reddit-post-meta">
            ${flairHtml}
            <span class="reddit-post-stat">▲ ${score}</span>
            <span class="reddit-post-stat">💬 ${p.comments}</span>
          </div>
        </a>`;
    }).join('');

    section.style.display = '';
  } catch (e) { /* fail silently — non-critical */ }
}

function setupSearch() {
  const form  = document.getElementById('site-search-form');
  const input = document.getElementById('site-search');
  if (!form || !input) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) window.location.href = `results.html?q=${encodeURIComponent(q)}`;
  });
}

// ── Live Visitor Feed ─────────────────────────
function startLiveFeed() {
  const feed = document.getElementById('liveFeed');
  if (!feed) return;

  const API = CONFIG.API.BASE_URL;

  const FEED_PLACEHOLDERS = [
    { flag: '🇺🇸', city: 'New York',    country: 'US', ts: Date.now()/1000 - 35  },
    { flag: '🇬🇧', city: 'London',      country: 'GB', ts: Date.now()/1000 - 120 },
    { flag: '🇦🇺', city: 'Sydney',      country: 'AU', ts: Date.now()/1000 - 270 },
    { flag: '🇨🇦', city: 'Toronto',     country: 'CA', ts: Date.now()/1000 - 490 },
    { flag: '🇧🇷', city: 'São Paulo',   country: 'BR', ts: Date.now()/1000 - 730 },
  ];

  let lastIds = new Set();

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60)   return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  function render(visitors) {
    const real = Array.isArray(visitors) && visitors.length ? visitors : FEED_PLACEHOLDERS;
    const list = real.slice(0, 5);
    feed.innerHTML = '';
    list.forEach(v => {
      const key = `${v.city}-${v.country}-${v.ts}`;
      const div = document.createElement('div');
      div.className = 'feed-entry';
      if (!lastIds.has(key)) div.classList.add('feed-entry-new');
      div.innerHTML = `
        <div class="feed-flag">${v.flag || ''}</div>
        <div class="feed-text"><strong>Someone from ${v.city || 'Unknown'}, ${v.country || 'Unknown'}</strong> visited MMA Bridge</div>
        <div class="feed-action">${timeAgo(v.ts)}</div>`;
      feed.appendChild(div);
    });
    lastIds = new Set(list.map(v => `${v.city}-${v.country}-${v.ts}`));
  }

  async function poll() {
    try {
      const r = await fetch(`${API}/visitors`);
      if (r.ok) render(await r.json());
    } catch {}
  }

  // Ping records current visitor synchronously and returns updated list immediately
  fetch(`${API}/visitors/ping`, { method: 'POST' })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) render(data); })
    .catch(() => {});

  // Also poll independently (catches the ping result if slightly delayed)
  setTimeout(poll, 3000);
  setInterval(poll, 30000);
}

startLiveFeed();

