// ==============================================
// MMA BRIDGE - HOMEPAGE
// ==============================================

import CONFIG, { debugLog } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {

  // Keep Render backend awake
  fetch('https://mmabridge-backend.onrender.com/api/health').catch(() => {});

  // Load events for hero + recent results
  try {
    const all = await fetch('/events.json').then(r => r.json());
    const now = new Date();

    // Returns true once an event's start time (ET) has passed
    function hasStarted(ev) {
      if (!ev.isoDate) return false;
      const t = ev.startTime || '22:00';
      const evStart = new Date(`${ev.isoDate}T${t}:00-04:00`);
      return now >= evStart;
    }

    const past = all
      .filter(e => e.status === 'completed' && e.poster)
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate));

    // Upcoming events that haven't started yet
    const upcoming = all
      .filter(e => e.status === 'upcoming' && !hasStarted(e))
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

    // An upcoming event whose start time just passed = live now, show as hero
    const liveNow = all.find(e => e.status === 'upcoming' && hasStarted(e));
    if (liveNow) liveNow._isLive = true;

    // Show most recently completed event in hero for 4 days after it ends
    const recentCompleted = past[0];
    const isVeryRecent = recentCompleted &&
      (now - new Date(recentCompleted.isoDate)) < 4 * 24 * 60 * 60 * 1000;

    renderHero(liveNow || (isVeryRecent ? recentCompleted : null) || upcoming[0] || past[0]);

    // ── Notification banner check ─────────────
    checkEventNotifications(all);

    // ── Favorite fighter notifications ────────
    if (window.MMANotif) window.MMANotif.checkEvents(all);

    renderRecentResults(past);
  } catch(e) { debugLog('Events error:', e); }

  // Load real news
  await renderNews();
  setupSearch();
});

// ── Hero ──────────────────────────────────────
function renderHero(ev) {
  if (!ev) return;
  const img   = document.getElementById('heroImg');
  const type  = document.getElementById('heroType');
  const title = document.getElementById('heroTitle');
  const meta  = document.getElementById('heroMeta');
  if (ev.poster) {
    img.style.backgroundImage = `url('${ev.poster}')`;
    img.style.backgroundSize = 'cover';
    // Per-event positioning to show faces
    const positions = {
      'ufc-fight-night-burns-vs-malott': 'center 20%',
    };
    img.style.backgroundPosition = positions[ev.id] || 'center top';
  }
  const isLive      = !!ev._isLive;
  const isCompleted = ev.status === 'completed';

  if (isLive) {
    type.innerHTML = '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:8px;height:8px;background:#ff2020;border-radius:50%;box-shadow:0 0 8px 2px rgba(255,30,30,0.7);animation:pulse 1.5s infinite;flex-shrink:0;"></span>LIVE NOW</span>';
  } else if (isCompleted) {
    type.textContent = ev.type === 'PPV' ? 'PPV Event — Results' : 'Event — Results';
  } else {
    type.textContent = ev.type === 'PPV' ? 'Next PPV Event' : 'Next Event';
  }

  title.textContent = ev.name || '';
  meta.textContent  = [ev.date, ev.location, ev.venue].filter(Boolean).join('  ·  ');
  const btn = document.getElementById('heroBtn');
  if (btn && ev.id) {
    if (isLive) {
      btn.textContent = 'Watch Live →';
      btn.href = 'https://www.paramountplus.com/sports/ufc/';
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.style.setProperty('background', 'linear-gradient(135deg, #8b0000 0%, #cc0000 55%, #ff3030 100%)', 'important');
      btn.style.setProperty('color', '#fff', 'important');
      btn.style.setProperty('text-shadow', '0 1px 4px rgba(0,0,0,0.5)', 'important');
      btn.style.setProperty('box-shadow', '0 0 28px rgba(255,30,30,0.45), inset 0 1px 0 rgba(255,120,120,0.2)', 'important');
      btn.style.setProperty('border', '1px solid rgba(255,60,60,0.4)', 'important');
    } else if (isCompleted) {
      btn.textContent = 'Review the Card →';
      btn.href = `event-review.html?id=${encodeURIComponent(ev.id)}`;
      btn.target = '';
      btn.style.setProperty('background', 'linear-gradient(135deg, #4a2c00 0%, #8B6010 25%, #C9960A 45%, #A07020 65%, #5C3800 100%)', 'important');
      btn.style.setProperty('color', '#f5e6c8', 'important');
      btn.style.setProperty('text-shadow', '0 1px 3px rgba(0,0,0,0.6)', 'important');
      btn.style.setProperty('box-shadow', '0 2px 14px rgba(160,100,0,0.45), inset 0 1px 0 rgba(255,210,80,0.25), inset 0 -1px 0 rgba(0,0,0,0.3)', 'important');
      btn.style.setProperty('border', '1px solid #6B4800', 'important');
    } else {
      btn.textContent = 'View Full Card →';
      btn.href = `events.html?id=${encodeURIComponent(ev.id)}`;
      btn.target = '';
      btn.style.setProperty('background', 'cyan', 'important');
      btn.style.setProperty('color', '#000', 'important');
      btn.style.setProperty('text-shadow', 'none', 'important');
      btn.style.setProperty('box-shadow', 'none', 'important');
      btn.style.setProperty('border', 'none', 'important');
    }
  }
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
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9998;background:linear-gradient(135deg,#0a1820,#0d2538);border:1px solid rgba(0,229,255,0.28);border-radius:12px;padding:14px 18px;max-width:380px;width:calc(100% - 40px);box-shadow:0 8px 40px rgba(0,0,0,0.6);display:flex;align-items:center;gap:12px;animation:sectionFadeIn 0.4s ease both;';
    banner.innerHTML = `
      <span style="font-size:1.5rem;flex-shrink:0;">🔔</span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:Montserrat,sans-serif;font-size:0.78rem;font-weight:700;color:#fff;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${target.name} is today!</div>
        <div style="font-family:Inter,sans-serif;font-size:0.68rem;color:rgba(255,255,255,0.38);">Starts ${target.startTime || '10PM'} ET · ${target.venue || target.location || ''}</div>
      </div>
      <a href="events.html?id=${encodeURIComponent(target.id)}" style="flex-shrink:0;background:rgba(0,229,255,0.09);border:1px solid rgba(0,229,255,0.28);color:cyan;font-family:Montserrat,sans-serif;font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:7px 12px;border-radius:6px;text-decoration:none;">View</a>
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

    const card = document.createElement('a');
    card.href  = `event-review.html?id=${encodeURIComponent(slug)}`;
    card.style.cssText = `display:block;text-decoration:none;flex-shrink:0;width:280px;background:#111;border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;transition:border-color 0.2s,transform 0.2s;`;
    card.onmouseenter = () => { card.style.borderColor='rgba(0,255,255,0.3)'; card.style.transform='translateY(-3px)'; };
    card.onmouseleave = () => { card.style.borderColor='rgba(255,255,255,0.07)'; card.style.transform='none'; };
    card.innerHTML = `
      <div style="height:160px;background-image:url('${ev.poster||''}');background-size:cover;background-position:center top;filter:brightness(0.75);"></div>
      <div style="padding:14px 16px;">
        <div style="font-family:'Montserrat',sans-serif;font-size:0.58rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:5px;">${ev.date||''}</div>
        <div style="font-family:'Montserrat',sans-serif;font-size:0.8rem;font-weight:800;color:#fff;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.name||''}</div>
        ${winner ? `
          <div style="font-family:'Inter',sans-serif;font-size:0.76rem;color:cyan;font-weight:600;">${winner} def. ${loser}</div>
          <div style="font-family:'Inter',sans-serif;font-size:0.68rem;color:rgba(255,255,255,0.3);margin-top:3px;">${methodLabel} · R${me?.round||''}</div>
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

  try {
    // On prod hit the real API, locally use cached file
    const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    let articles = [];

    if (isDev) {
      // Local: read from data/news.json
      try {
        const d = await fetch('/data/news.json').then(r => r.json());
        articles = d.trending || [];
      } catch {}
    } else {
      // Prod: hit Render backend which calls GNews
      try {
        const d = await fetch('https://mmabridge-backend.onrender.com/api/news').then(r => r.json());
        articles = d.trending || [];
      } catch {}
    }

    if (!articles.length) {
      articles = [
        {
          title: 'UFC 327: Procházka vs. Ulberg — Full Card Preview and Predictions',
          url: 'https://mmajunkie.usatoday.com/category/ufc',
          imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-04/041126-ufc-327-prochazka-vs-ulberg-EVENT-ART.jpg',
          source: 'MMA Junkie'
        },
        {
          title: 'Joe Pyfer Stuns Adesanya With Second Round TKO in Seattle',
          url: 'https://www.espn.com/mma/',
          imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-02/032826-ufc-fight-night-adesanyva-vs-pyfer-EVENT-ART.jpg',
          source: 'ESPN MMA'
        },
        {
          title: 'Charles Oliveira Claims BMF Title Over Max Holloway at UFC 326',
          url: 'https://www.cbssports.com/ufc/',
          imageUrl: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2026-01/030726-ufc-326-holloway-vs-oliveira-2-EVENT-ART.jpg',
          source: 'CBS Sports'
        },
      ];
    }

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
        <div style="font-size:1.5rem;margin-bottom:10px;">📡</div>
        Couldn't load news right now. Check back shortly.
      </div>`;
    }
    if (list && !list.innerHTML.trim()) {
      list.innerHTML = `<li style="color:rgba(255,255,255,0.3);font-size:0.8rem;list-style:none;">Unable to load headlines</li>`;
    }
  }
}

// ── Search ────────────────────────────────────
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

  const API = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001/api'
    : 'https://mmabridge-backend.onrender.com/api';

  let lastIds = new Set();

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60)   return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  function render(visitors) {
    if (!Array.isArray(visitors) || !visitors.length) {
      feed.innerHTML = `<div class="feed-empty">Waiting for visitors…</div>`;
      return;
    }
    feed.innerHTML = '';
    visitors.forEach(v => {
      const key = `${v.city}-${v.country}-${v.ts}`;
      const div = document.createElement('div');
      div.className = 'feed-entry';
      if (!lastIds.has(key)) div.classList.add('feed-entry-new');
      div.innerHTML = `
        <div class="feed-flag">${v.flag || '🌍'}</div>
        <div class="feed-text"><strong>Someone from ${v.city || 'Unknown'}, ${v.country || 'Unknown'}</strong> visited MMA Bridge</div>
        <div class="feed-action">${timeAgo(v.ts)}</div>`;
      feed.appendChild(div);
    });
    lastIds = new Set(visitors.map(v => `${v.city}-${v.country}-${v.ts}`));
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
