// ==============================================
// MMA BRIDGE - HOMEPAGE
// ==============================================

import CONFIG, { debugLog } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {

  // Load events for hero + recent results
  try {
    const all = await fetch('/events.json').then(r => r.json());
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all.filter(e => (e.isoDate||'9999') >= today).sort((a,b) => a.isoDate.localeCompare(b.isoDate));
    const past     = all.filter(e => (e.isoDate||'9999') < today && e.status === 'completed').sort((a,b) => b.isoDate.localeCompare(a.isoDate));
    renderHero(upcoming[0] || past[0]);
    renderRecentResults(past.slice(0, 3));
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
  if (ev.poster) img.style.backgroundImage = `url('${ev.poster}')`;
  type.textContent  = ev.type === 'PPV' ? '🔥 Next PPV Event' : '⚡ Next Event';
  title.textContent = ev.name || '';
  meta.textContent  = [ev.date, ev.location, ev.venue].filter(Boolean).join('  ·  ');
}

// ── Recent Results ────────────────────────────
function renderRecentResults(events) {
  const container = document.getElementById('recentResults');
  if (!container || !events.length) return;

  container.innerHTML = events.map(ev => {
    const me     = ev.mainCard?.[0];
    const winner = me?.winner || '';
    const method = me?.method || '';
    const loser  = winner === me?.a ? me?.b : me?.a;
    const slug   = ev.id || '';
    const METHOD = {'KO':'🥊 KO','TKO':'🥊 TKO','SUB':'⛓️ Sub','UD':'📋 UD','SD':'📋 SD','MD':'📋 MD','NC':'🚫 NC','Draw':'🤝 Draw'};
    const methodLabel = METHOD[method] || method;

    return `
      <a href="event-review.html?id=${encodeURIComponent(slug)}"
         style="display:block;text-decoration:none;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;transition:border-color 0.15s,transform 0.12s;"
         onmouseover="this.style.borderColor='rgba(255,255,255,0.2)';this.style.transform='translateY(-2px)'"
         onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.transform='none'">
        ${ev.poster
          ? `<div style="height:130px;background-image:url('${ev.poster}');background-size:cover;background-position:center top;filter:brightness(0.7);"></div>`
          : `<div style="height:130px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:2rem;color:rgba(255,255,255,0.1);">🥊</div>`
        }
        <div style="padding:14px 16px;">
          <div style="font-family:'Montserrat',sans-serif;font-size:0.6rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:6px;">${ev.date||''}</div>
          <div style="font-family:'Montserrat',sans-serif;font-size:0.82rem;font-weight:800;color:#fff;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.name||''}</div>
          ${winner ? `
            <div style="font-family:'Inter',sans-serif;font-size:0.78rem;color:cyan;font-weight:600;">${winner} def. ${loser}</div>
            <div style="font-family:'Inter',sans-serif;font-size:0.7rem;color:rgba(255,255,255,0.35);margin-top:3px;">${methodLabel} · R${me?.round||''}</div>
          ` : ''}
        </div>
      </a>`;
  }).join('');
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
      // Fallback static articles
      articles = [
        {title:'UFC 327: Procházka vs. Ulberg Preview — Full Card Breakdown',url:'https://mmajunkie.usatoday.com/',imageUrl:'images/ufc-327.jpg',source:'MMA Junkie'},
        {title:'Joe Pyfer Stuns Adesanya With Second Round TKO in Seattle',url:'https://www.espn.com/mma/',imageUrl:'images/fn-seattle.jpg',source:'ESPN MMA'},
        {title:'Charles Oliveira Claims BMF Title Over Max Holloway at UFC 326',url:'https://www.cbssports.com/ufc/',imageUrl:'images/ufc-326.jpg',source:'CBS Sports'},
      ];
    }

    // Render cards
    if (container) {
      container.innerHTML = articles.slice(0, 3).map((a, i) => `
        <a href="${a.url||'#'}" target="_blank" rel="noopener noreferrer"
           class="card-link" data-title="${(a.title||'').replace(/"/g,'&quot;')}">
          <div class="medium-card">
            <div class="card-image"
                 style="background-image:${a.imageUrl ? `url('${a.imageUrl}')` : 'none'};background-size:cover;background-position:center;${!a.imageUrl ? `background-color:#1a1a1a;` : ''}">
            </div>
            <h2>${a.title||''}</h2>
            ${a.source?`<div style="font-size:0.68rem;color:rgba(255,255,255,0.4);margin-top:4px;font-family:'Inter',sans-serif;">${a.source}</div>`:''}
          </div>
        </a>`).join('');
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
