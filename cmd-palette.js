// ── COMMAND PALETTE ──────────────────────────────────────────────
// Opens on ⌘K / Ctrl+K — searches pages, events, fighters.

(function() {
  var NAV = [
    { label:'Trending',      icon:'📰', href:'index.html',       desc:'Homepage & latest MMA news' },
    { label:'Events',        icon:'📅', href:'events.html',      desc:'Upcoming UFC events & fight cards' },
    { label:'Make Picks',    icon:'🥊', href:'picks.html',       desc:'Submit your fight predictions' },
    { label:'P4P Rankings',  icon:'🏆', href:'pfp.html',         desc:'Pound-for-pound fighter rankings' },
    { label:'Reviews',       icon:'⭐', href:'reviews.html',     desc:'Rate & review completed events' },
    { label:'Leaderboard',   icon:'📊', href:'leaderboard.html', desc:'Community pick accuracy rankings' },
    { label:'Lucas Bot',     icon:'🤖', href:'lucas.html',       desc:'AI fight predictor & analysis' },
    { label:'About',         icon:'ℹ️',  href:'about.html',       desc:'About MMA Bridge' },
    { label:'Sign In',       icon:'🔑', href:'auth.html',        desc:'Log in or create an account' },
  ];

  var evCache = [];
  var _items  = [];
  var activeIdx = 0;

  // ── Inject HTML ──
  var overlay = document.createElement('div');
  overlay.id = 'cp-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Command palette');
  overlay.innerHTML =
    '<div class="cp-modal" id="cp-modal">' +
      '<div class="cp-search-wrap">' +
        '<svg class="cp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
        '<input class="cp-input" id="cp-input" placeholder="Search pages, events, fighters…" autocomplete="off" spellcheck="false" aria-label="Search">' +
        '<kbd class="cp-esc-hint">ESC</kbd>' +
      '</div>' +
      '<div class="cp-results" id="cp-results" role="listbox"></div>' +
      '<div class="cp-footer"><span>↑↓ navigate</span><span class="cp-footer-sep"></span><span>↵ open</span><span class="cp-footer-sep"></span><span>⌘K toggle</span></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var input   = document.getElementById('cp-input');
  var results = document.getElementById('cp-results');

  // ── Fetch events once ──
  function prefetchEvents() {
    if (evCache.length) return;
    fetch('/events.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(data) {
        evCache = (data || []).filter(function(e) { return e.name; }).map(function(e) {
          return {
            label: e.name,
            icon:  e.type === 'PPV' ? '🥊' : '📅',
            href:  'events.html?id=' + encodeURIComponent(e.id),
            desc:  (e.isoDate || '') + (e.venue ? ' · ' + e.venue : ''),
            status: e.status || ''
          };
        });
      }).catch(function() {});
  }

  function open() {
    overlay.classList.add('open');
    document.body.classList.add('no-scroll');
    input.value = '';
    render('');
    prefetchEvents();
    requestAnimationFrame(function() { input.focus(); });
  }

  function close() {
    overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusBadge(status) {
    if (status === 'completed') return '<span class="cp-badge done">Done</span>';
    if (status === 'upcoming')  return '<span class="cp-badge up">Soon</span>';
    return '';
  }

  function render(q) {
    q = (q || '').toLowerCase().trim();
    var items = [];

    if (!q) {
      items = NAV.slice();
    } else {
      NAV.forEach(function(n) {
        if (n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)) items.push(n);
      });
      evCache.forEach(function(e) {
        if (e.label.toLowerCase().includes(q) || (e.desc || '').toLowerCase().includes(q)) items.push(e);
      });
    }

    _items = items;
    activeIdx = 0;

    if (!items.length) {
      results.innerHTML = '<div class="cp-empty">No results for "' + esc(q) + '"</div>';
      return;
    }

    results.innerHTML = items.map(function(item, i) {
      return '<a class="cp-item' + (i === 0 ? ' active' : '') + '" href="' + esc(item.href) + '" role="option" data-idx="' + i + '" aria-selected="' + (i === 0) + '">' +
        '<span class="cp-item-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="cp-item-body">' +
          '<span class="cp-item-label">' + esc(item.label) + '</span>' +
          (item.desc ? '<span class="cp-item-desc">' + esc(item.desc) + '</span>' : '') +
        '</span>' +
        (item.status ? statusBadge(item.status) : '') +
        '<svg class="cp-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</a>';
    }).join('');

    results.querySelectorAll('.cp-item').forEach(function(el) {
      el.addEventListener('mouseenter', function() {
        activeIdx = parseInt(el.dataset.idx, 10);
        highlight();
      });
      el.addEventListener('click', function(e) {
        e.preventDefault();
        close();
        var href = el.getAttribute('href');
        // Use page transition if available
        var pgOverlay = document.getElementById('pg-transition');
        if (pgOverlay) {
          pgOverlay.style.opacity = '1';
          setTimeout(function() { window.location.href = href; }, 200);
        } else {
          window.location.href = href;
        }
      });
    });
  }

  function highlight() {
    var els = results.querySelectorAll('.cp-item');
    els.forEach(function(el, i) {
      el.classList.toggle('active', i === activeIdx);
      el.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
    });
    var active = results.querySelector('.cp-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // ── Input events ──
  input.addEventListener('input', function() {
    activeIdx = 0;
    render(input.value);
  });

  input.addEventListener('keydown', function(e) {
    var total = results.querySelectorAll('.cp-item').length;
    if (!total) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % total;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + total) % total;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var active = results.querySelector('.cp-item.active');
      if (active) active.click();
    }
  });

  // ── Backdrop click closes ──
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  // ── Global keyboard shortcut ──
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.classList.contains('open') ? close() : open();
    }
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      e.stopPropagation();
      close();
    }
  }, true);

  window.openCommandPalette = open;
  window.closeCommandPalette = close;
})();
