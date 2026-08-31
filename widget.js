(function () {
  const API = (window.CONFIG && window.CONFIG.API && window.CONFIG.API.BASE_URL)
    ? window.CONFIG.API.BASE_URL
    : (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:5001/api'
      : 'https://mmabridge-backend.onrender.com/api');

  const POS_KEY  = 'mmabridge-widget-pos';
  const DISMISSED_KEY = 'lw_dismissed';

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

  /* ── CSS ── */
  const style = document.createElement('style');
  style.textContent = `
    #lw-widget {
      position: fixed;
      width: 210px;
      z-index: 8000;
      background: rgba(6,6,8,0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      opacity: 0;
      transition: opacity 0.35s ease, box-shadow 0.2s ease;
      pointer-events: all;
      user-select: none;
      -webkit-user-select: none;
    }
    #lw-widget.lw-visible { opacity: 1; }
    #lw-widget.lw-hidden  { opacity: 0 !important; pointer-events: none !important; }
    #lw-widget.lw-dragging {
      cursor: grabbing !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(242, 96, 15,0.12) !important;
    }

    /* ── Collapsed tab ── */
    #lw-tab {
      position: fixed;
      left: 0;
      width: 28px;
      height: 70px;
      z-index: 8000;
      background: rgba(6,6,8,0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.08);
      border-left: none;
      border-radius: 0 8px 8px 0;
      box-shadow: 4px 0 20px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease, background 0.15s ease;
    }
    #lw-tab.lw-tab-visible {
      opacity: 1;
      pointer-events: all;
    }
    #lw-tab:hover {
      background: rgba(242, 96, 15,0.08);
      border-color: rgba(242, 96, 15,0.2);
    }
    #lw-tab-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #f2600f;
      animation: lwPulse 2s ease infinite;
    }
    #lw-tab-tooltip {
      position: absolute;
      left: 36px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(6,6,8,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 5px;
      padding: 4px 10px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.55rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.6);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    #lw-tab:hover #lw-tab-tooltip { opacity: 1; }

    @media (max-width: 900px) {
      #lw-widget, #lw-tab { display: none !important; }
    }

    #lw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 10px 7px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: grab;
    }
    #lw-header:active { cursor: grabbing; }
    #lw-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.52rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(242, 96, 15,0.8);
      pointer-events: none;
    }
    #lw-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f2600f;
      flex-shrink: 0;
      animation: lwPulse 2s ease infinite;
    }
    @keyframes lwPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(242, 96, 15,0.5); opacity:1; }
      50%      { box-shadow: 0 0 0 5px rgba(242, 96, 15,0); opacity:0.7; }
    }
    #lw-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.25);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 2px 4px;
      line-height: 1;
      transition: color 0.15s;
      position: relative;
      z-index: 1;
    }
    #lw-close:hover { color: rgba(255,255,255,0.6); }
    #lw-list {
      padding: 6px 0 8px;
      cursor: grab;
    }
    #lw-list:active { cursor: grabbing; }
    .lw-entry {
      display: flex;
      align-items: baseline;
      gap: 5px;
      padding: 4px 12px;
      font-family: 'Inter', sans-serif;
      font-size: 0.62rem;
      color: rgba(255,255,255,0.5);
      line-height: 1.4;
      pointer-events: none;
    }
    .lw-entry.lw-new { animation: lwFadeIn 0.4s ease both; }
    @keyframes lwFadeIn {
      from { opacity:0; transform: translateX(-4px); }
      to   { opacity:1; transform: translateX(0); }
    }
    .lw-flag { flex-shrink:0; font-size: 0.78rem; }
    .lw-city { flex:1; color: rgba(255,255,255,0.65); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lw-time { flex-shrink:0; color: rgba(255,255,255,0.25); font-size: 0.58rem; }
  `;
  document.head.appendChild(style);

  /* ── Widget HTML ── */
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

  /* ── Tab HTML ── */
  const tab = document.createElement('div');
  tab.id = 'lw-tab';
  tab.innerHTML = `<span id="lw-tab-dot"></span><span id="lw-tab-tooltip">Live Feed</span>`;
  document.body.appendChild(tab);

  /* ── Position helpers ── */
  function clampPos(x, y, el) {
    const W       = el.offsetWidth  || (el === widget ? 210 : 28);
    const H       = el.offsetHeight || (el === widget ? 120 : 70);
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    const navH    = (bottomNav && getComputedStyle(bottomNav).display !== 'none') ? (bottomNav.offsetHeight || 60) : 0;
    return {
      x: Math.max(0, Math.min(x, window.innerWidth  - W)),
      y: Math.max(0, Math.min(y, window.innerHeight - H - navH - 8)),
    };
  }

  function applyPos(el, x, y) {
    el.style.left      = x + 'px';
    el.style.top       = y + 'px';
    el.style.transform = 'none';
  }

  function savePos(x, y) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch {}
  }

  function loadPos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      const { x, y } = JSON.parse(raw);
      if (typeof x !== 'number' || typeof y !== 'number') return null;
      const W = widget.offsetWidth || 210;
      const H = widget.offsetHeight || 120;
      if (x < 0 || y < 0 || x + W > window.innerWidth + 10 || y + H > window.innerHeight + 10) {
        localStorage.removeItem(POS_KEY);
        return null;
      }
      return { x, y };
    } catch { return null; }
  }

  function defaultCenterY() {
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    const navH = (bottomNav && getComputedStyle(bottomNav).display !== 'none') ? (bottomNav.offsetHeight || 60) : 0;
    return Math.round((window.innerHeight - navH - (widget.offsetHeight || 120)) / 2);
  }

  function initWidgetPosition() {
    const saved = loadPos();
    if (saved) {
      applyPos(widget, saved.x, saved.y);
    } else {
      widget.style.left      = '20px';
      widget.style.top       = '50%';
      widget.style.transform = 'translateY(-50%)';
    }
  }

  function syncTabToWidget() {
    const rect = widget.getBoundingClientRect();
    const tabH = tab.offsetHeight || 70;
    const cy   = rect.top + rect.height / 2;
    const ty   = Math.max(0, Math.min(cy - tabH / 2, window.innerHeight - tabH));
    tab.style.top       = ty + 'px';
    tab.style.transform = 'none';
  }

  /* ── Drag logic (shared for widget) ── */
  let dragging = false, dragOffX = 0, dragOffY = 0;

  function startDrag(clientX, clientY) {
    dragging = true;
    const rect = widget.getBoundingClientRect();
    dragOffX = clientX - rect.left;
    dragOffY = clientY - rect.top;
    applyPos(widget, rect.left, rect.top);
    widget.classList.add('lw-dragging');
    document.body.style.userSelect = 'none';
  }

  function moveDrag(clientX, clientY) {
    if (!dragging) return;
    const p = clampPos(clientX - dragOffX, clientY - dragOffY, widget);
    applyPos(widget, p.x, p.y);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    widget.classList.remove('lw-dragging');
    document.body.style.userSelect = '';
    const rect = widget.getBoundingClientRect();
    const p = clampPos(rect.left, rect.top, widget);
    applyPos(widget, p.x, p.y);
    savePos(p.x, p.y);
    syncTabToWidget();
  }

  widget.addEventListener('mousedown', e => {
    if (e.target.id === 'lw-close') return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', e => { if (dragging) moveDrag(e.clientX, e.clientY); });
  document.addEventListener('mouseup', endDrag);

  widget.addEventListener('touchstart', e => {
    if (e.target.id === 'lw-close') return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener('touchend', endDrag);

  window.addEventListener('resize', () => {
    const rect = widget.getBoundingClientRect();
    const p = clampPos(rect.left, rect.top, widget);
    if (Math.abs(p.x - rect.left) > 1 || Math.abs(p.y - rect.top) > 1) {
      applyPos(widget, p.x, p.y);
      savePos(p.x, p.y);
    }
    syncTabToWidget();
  });

  /* ── Render entries ── */
  let lastKeys = new Set();
  function render(visitors) {
    const list = document.getElementById('lw-list');
    if (!list) return;
    const real = Array.isArray(visitors) && visitors.length ? visitors : PLACEHOLDERS;
    const items = real.slice(0, 5);
    list.innerHTML = '';
    items.forEach(v => {
      const key = `${v.city}-${v.ts}`;
      const row = document.createElement('div');
      row.className = 'lw-entry' + (lastKeys.size && !lastKeys.has(key) ? ' lw-new' : '');
      row.innerHTML = `<span class="lw-flag">${v.flag||'🌍'}</span><span class="lw-city">${v.city||'Someone'}</span><span class="lw-time">${timeAgo(v.ts)}</span>`;
      list.appendChild(row);
    });
    lastKeys = new Set(items.map(v => `${v.city}-${v.ts}`));
  }

  async function poll() {
    try {
      const r = await fetch(`${API}/visitors`);
      if (r.ok) render(await r.json());
    } catch { render(null); }
  }

  /* ── Show or restore collapsed state ── */
  const isDismissed = sessionStorage.getItem(DISMISSED_KEY) === '1';

  setTimeout(() => {
    initWidgetPosition();
    syncTabToWidget();

    if (isDismissed) {
      tab.classList.add('lw-tab-visible');
    } else {
      widget.classList.add('lw-visible');
      render(null);
      fetch(`${API}/visitors/ping`, { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) render(d); })
        .catch(() => {});
      setTimeout(poll, 4000);
      setInterval(poll, 30000);
    }
  }, 1800);

  /* ── Dismiss → show tab ── */
  document.getElementById('lw-close').addEventListener('click', () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    syncTabToWidget();
    widget.classList.remove('lw-visible');
    widget.classList.add('lw-hidden');
    setTimeout(() => {
      widget.classList.add('lw-hidden');
      tab.classList.add('lw-tab-visible');
    }, 350);
  });

  /* ── Tab click → reopen widget ── */
  tab.addEventListener('click', () => {
    sessionStorage.removeItem(DISMISSED_KEY);
    tab.classList.remove('lw-tab-visible');
    widget.classList.remove('lw-hidden');
    setTimeout(() => widget.classList.add('lw-visible'), 20);
    render(null);
    fetch(`${API}/visitors/ping`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) render(d); })
      .catch(() => {});
  });

  /* ── Hide on overlay open ── */
  const observer = new MutationObserver(() => {
    const hide = document.body.classList.contains('no-scroll') ||
                 document.body.classList.contains('overlay-open');
    widget.classList.toggle('lw-hidden', hide);
    tab.style.opacity = hide ? '0' : '';
    tab.style.pointerEvents = hide ? 'none' : '';
    if (!hide && !sessionStorage.getItem(DISMISSED_KEY)) widget.classList.add('lw-visible');
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
