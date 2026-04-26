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

    renderHero(liveNow || upcoming[0] || past[0]);
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
  type.textContent  = ev.type === 'PPV' ? '🔥 Next PPV Event' : '⚡ Next Event';
  title.textContent = ev.name || '';
  meta.textContent  = [ev.date, ev.location, ev.venue].filter(Boolean).join('  ·  ');
  const btn = document.getElementById('heroBtn');
  if (btn && ev.id) btn.href = `events.html#ev-${ev.id}`;
}

// ── Recent Results Infinite Scroll ───────────
function renderRecentResults(events) {
  const track = document.getElementById('resultsTrack');
  const inner = document.getElementById('resultsInner');
  if (!inner || !events.length) return;

  const METHOD = {'KO':'🥊 KO','TKO':'🥊 TKO','SUB':'⛓️ Sub','UD':'📋 UD','SD':'📋 SD','MD':'📋 MD','NC':'🚫 NC','Draw':'🤝 Draw'};

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
