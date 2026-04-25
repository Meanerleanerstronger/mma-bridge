(function () {
  if (sessionStorage.getItem('lw_dismissed') === '1') return;

  const API = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001/api'
    : 'https://mmabridge-backend.onrender.com/api';

  const PLACEHOLDERS = [
    { flag: '🇺🇸', city: 'New York',    ts: Date.now()/1000 - 40  },
    { flag: '🇬🇧', city: 'London',      ts: Date.now()/1000 - 130 },
    { flag: '🇦🇺', city: 'Sydney',      ts: Date.now()/1000 - 280 },
    { flag: '🇨🇦', city: 'Toronto',     ts: Date.now()/1000 - 510 },
    { flag: '🇧🇷', city: 'São Paulo',   ts: Date.now()/1000 - 740 },
  ];

  function timeAgo(ts) {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60)   return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  /* ── Inject CSS ── */
  const style = document.createElement('style');
  style.textContent = `
    #lw-widget {
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%) translateY(12px);
      width: 210px;
      z-index: 8000;
      background: rgba(6,6,8,0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      opacity: 0;
      transition: opacity 0.4s ease, transform 0.4s ease;
      pointer-events: all;
    }
    #lw-widget.lw-visible {
      opacity: 1;
      transform: translateY(-50%) translateY(0);
    }
    #lw-widget.lw-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateY(-50%) translateY(12px) !important;
    }
    @media (max-width: 768px) {
      #lw-widget { display: none !important; }
    }
    @media (max-height: 600px) {
      #lw-widget {
        top: auto;
        bottom: 16px;
        transform: none;
      }
      #lw-widget.lw-visible { transform: none; }
      #lw-widget.lw-hidden  { transform: translateY(8px) !important; }
    }
    #lw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 10px 7px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    #lw-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.52rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(0,229,255,0.8);
    }
    #lw-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00e5ff;
      flex-shrink: 0;
      animation: lwPulse 2s ease infinite;
    }
    @keyframes lwPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(0,229,255,0.5); opacity:1; }
      50%      { box-shadow: 0 0 0 5px rgba(0,229,255,0); opacity:0.7; }
    }
    #lw-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.25);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: color 0.15s;
    }
    #lw-close:hover { color: rgba(255,255,255,0.6); }
    #lw-list {
      padding: 6px 0 8px;
    }
    .lw-entry {
      display: flex;
      align-items: baseline;
      gap: 5px;
      padding: 4px 12px;
      font-family: 'Inter', sans-serif;
      font-size: 0.62rem;
      color: rgba(255,255,255,0.5);
      line-height: 1.4;
    }
    .lw-entry.lw-new {
      animation: lwFadeIn 0.4s ease both;
    }
    @keyframes lwFadeIn {
      from { opacity:0; transform: translateX(-4px); }
      to   { opacity:1; transform: translateX(0); }
    }
    .lw-flag { flex-shrink:0; font-size: 0.78rem; }
    .lw-city { flex:1; color: rgba(255,255,255,0.65); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lw-time { flex-shrink:0; color: rgba(255,255,255,0.25); font-size: 0.58rem; }
  `;
  document.head.appendChild(style);

  /* ── Inject HTML ── */
  const widget = document.createElement('div');
  widget.id = 'lw-widget';
  widget.innerHTML = `
    <div id="lw-header">
      <div id="lw-title"><span id="lw-dot"></span>Live on MMA Bridge</div>
      <button id="lw-close" aria-label="Dismiss">✕</button>
    </div>
    <div id="lw-list"></div>
  `;
  document.body.appendChild(widget);

  /* ── Render entries ── */
  let lastKeys = new Set();
  function render(visitors) {
    const list = document.getElementById('lw-list');
    if (!list) return;
    const items = (Array.isArray(visitors) && visitors.length ? visitors : PLACEHOLDERS).slice(0, 5);
    list.innerHTML = '';
    items.forEach(v => {
      const key = `${v.city}-${v.ts}`;
      const row = document.createElement('div');
      row.className = 'lw-entry' + (lastKeys.size && !lastKeys.has(key) ? ' lw-new' : '');
      row.innerHTML = `
        <span class="lw-flag">${v.flag || '🌍'}</span>
        <span class="lw-city">${v.city || 'Someone'}</span>
        <span class="lw-time">${timeAgo(v.ts)}</span>
      `;
      list.appendChild(row);
    });
    lastKeys = new Set(items.map(v => `${v.city}-${v.ts}`));
  }

  /* ── Fetch visitors ── */
  async function poll() {
    try {
      const r = await fetch(`${API}/visitors`);
      if (r.ok) render(await r.json());
    } catch { render(null); }
  }

  /* ── Show widget after short delay ── */
  setTimeout(() => {
    widget.classList.add('lw-visible');
    render(null); // placeholders immediately
    fetch(`${API}/visitors/ping`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) render(d); })
      .catch(() => {});
    setTimeout(poll, 4000);
    setInterval(poll, 30000);
  }, 1800);

  /* ── Dismiss ── */
  document.getElementById('lw-close').addEventListener('click', () => {
    sessionStorage.setItem('lw_dismissed', '1');
    widget.classList.remove('lw-visible');
    widget.classList.add('lw-hidden');
    setTimeout(() => widget.remove(), 500);
  });

  /* ── Hide when overlay/modal open (no-scroll on body) ── */
  const observer = new MutationObserver(() => {
    const hidden = document.body.classList.contains('no-scroll') ||
                   document.body.classList.contains('overlay-open');
    widget.classList.toggle('lw-hidden', hidden);
    if (!hidden) widget.classList.add('lw-visible');
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
