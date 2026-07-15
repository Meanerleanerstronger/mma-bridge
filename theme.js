// ── ZERO-FLASH THEME SCRIPT ─────────────────────────────────────────────────
// Runs synchronously in <head> before body renders.
// Applies theme to <html> immediately; mirrors to <body> on DOMContentLoaded.
// Default is dark mode. Persists choice in localStorage.

(function () {
  var theme = localStorage.getItem('theme') || 'dark';
  if (theme === 'light') {
    document.documentElement.classList.add('light-mode');
  }
})();

// ── Sun / Moon SVG strings ───────────────────────────────────────────────────
var _MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var _SUN_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

function _syncThemeBtn() {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  var lm = document.documentElement.classList.contains('light-mode') ||
           (document.body && document.body.classList.contains('light-mode'));
  btn.innerHTML = lm ? _SUN_SVG : _MOON_SVG;
  btn.setAttribute('aria-label', lm ? 'Switch to dark mode' : 'Switch to light mode');
  btn.title = lm ? 'Switch to dark mode' : 'Switch to light mode';
}

document.addEventListener('DOMContentLoaded', function () {
  var isLight = localStorage.getItem('theme') === 'light';

  // Mirror class to body (IIFE only set it on <html>)
  document.body.classList.toggle('light-mode', isLight);

  // ── Clean URLs: strip .html, remap index → trending ──
  (function() {
    var loc = window.location;
    var path = loc.pathname;
    if (path.endsWith('.html')) path = path.slice(0, -5);
    if (path.endsWith('/index')) path = path.replace(/\/index$/, '/trending');
    try { history.replaceState(null, '', path + loc.search + loc.hash); } catch(e) {}
  })();

  // ── Mobile nav: close on backdrop tap ──
  var mobileOverlay = document.getElementById('nav-mobile-overlay');
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', function(e) {
      if (e.target === mobileOverlay) {
        mobileOverlay.classList.remove('open');
        var ham = document.getElementById('nav-hamburger');
        if (ham) ham.classList.remove('open');
        document.body.classList.remove('no-scroll');
      }
    });
  }

  // ── Command palette ──
  (function() {
    var s = document.createElement('script');
    s.src = '/cmd-palette.js?v=1.0';
    document.head.appendChild(s);
  })();

  // ── ⌘K hint in navbar search box ──
  requestAnimationFrame(function() {
    var searchForm = document.getElementById('site-search-form');
    if (searchForm && !searchForm.querySelector('.cp-nav-hint')) {
      var hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'cp-nav-hint';
      hint.innerHTML = '<kbd>⌘K</kbd>';
      hint.title = 'Open command palette';
      hint.onclick = function() { window.openCommandPalette && window.openCommandPalette(); };
      searchForm.parentNode.insertBefore(hint, searchForm);
    }
  });

  // ── Navbar scroll shadow + hide-on-scroll-down / reveal-on-scroll-up ──
  (function() {
    var nav = document.querySelector('.navbar');
    if (!nav) return;
    var tick = false;
    var lastY = window.scrollY;
    var navH = nav.offsetHeight;
    window.addEventListener('scroll', function() {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function() {
        var y = window.scrollY;
        nav.classList.toggle('scrolled', y > 10);
        // Never hide until scrolled past the nav's own height — otherwise a
        // tiny downward wiggle near the top hides it for no reason.
        if (y > navH) {
          nav.classList.toggle('nav-hidden', y > lastY);
        } else {
          nav.classList.remove('nav-hidden');
        }
        lastY = y;
        tick = false;
      });
    }, { passive: true });
  })();

  // ── Image fade-in (fighter photos, posters) ──
  // Images across the site just pop in with no transition once loaded,
  // which reads as unpolished and (on slow connections) causes a visible
  // "flash" as each one resolves. Fade newly-loading images in smoothly;
  // images already cached/complete by the time this runs skip the fade
  // entirely so they don't flicker. A MutationObserver covers images
  // rendered later by JS (fight cards, posters, rankings, etc.) since most
  // of those exist well after this DOMContentLoaded fires.
  (function() {
    function setup(img) {
      if (img.dataset.fadeInit) return;
      img.dataset.fadeInit = '1';
      if (img.complete && img.naturalWidth > 0) { img.classList.add('img-loaded'); return; }
      img.classList.add('img-fade');
      var done = function() { img.classList.add('img-loaded'); };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true }); // never hide a broken image forever
    }
    document.querySelectorAll('img').forEach(setup);
    if (window.MutationObserver) {
      new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          m.addedNodes.forEach(function(node) {
            if (node.nodeType !== 1) return;
            if (node.tagName === 'IMG') setup(node);
            else if (node.querySelectorAll) node.querySelectorAll('img').forEach(setup);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  })();

  // ── IntersectionObserver scroll reveal ──
  // Exposed globally because most [data-reveal] targets (leaderboard rows,
  // rankings, review cards) are rendered asynchronously well after this
  // DOMContentLoaded fires — pages that inject such content must call
  // window.MMAReveal.scan() once after rendering, or those elements just
  // sit at opacity:0 forever since the observer never saw them.
  (function() {
    if (!window.IntersectionObserver) { window.MMAReveal = { scan: function(){} }; return; }
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    function scan(root) {
      var scope = root || document;
      scope.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(function(el) {
        obs.observe(el);
      });
    }
    window.MMAReveal = { scan: scan };
    scan();
  })();

  // ── Register service worker ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  }

  // ── Inject site footer on all pages ──
  if (!document.getElementById('site-disclaimer')) {
    var ft = document.createElement('footer');
    ft.id = 'site-disclaimer';
    ft.innerHTML =
      '<div class="sf-inner">' +
        '<nav class="sf-nav">' +
          '<a href="index.html">Home</a>' +
          '<a href="events.html">Events</a>' +
          '<a href="picks.html">Picks</a>' +
          '<a href="pfp.html">P4P</a>' +
          '<a href="reviews.html">Reviews</a>' +
          '<a href="leaderboard.html">Leaderboard</a>' +
          '<a href="about.html">About</a>' +
        '</nav>' +
        '<div class="sf-legal">' +
          'MMA Bridge is an independent fan site, not affiliated with the UFC or Zuffa LLC.' +
          ' Fighter images and event posters remain the property of their respective owners.' +
          ' &nbsp;&middot;&nbsp; <a href="mailto:contact@mmabridge.com">contact@mmabridge.com</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ft);
  }

  var btn = document.getElementById('themeToggle');
  if (!btn) return;

  _syncThemeBtn();

  btn.addEventListener('click', function () {
    var nowLight = !document.body.classList.contains('light-mode');

    // Switch theme immediately (hidden under the wipe overlay)
    document.body.classList.toggle('light-mode', nowLight);
    document.documentElement.classList.toggle('light-mode', nowLight);
    localStorage.setItem('theme', nowLight ? 'light' : 'dark');
    _syncThemeBtn();

    // Panel sweeps up from bottom, covers screen, exits off the top
    var wipe = document.createElement('div');
    wipe.id = 'theme-wipe';
    wipe.style.cssText =
      'position:fixed;inset:0;z-index:99990;pointer-events:none;' +
      'background:' + (nowLight ? '#faf8f3' : '#08080c') + ';' +
      'transform:translateY(100%);will-change:transform;';
    document.body.appendChild(wipe);

    var dur = 440;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        // Slide up to cover
        wipe.style.transition = 'transform ' + dur + 'ms cubic-bezier(0.76,0,0.24,1)';
        wipe.style.transform  = 'translateY(0%)';
        // Slide off top once covered
        setTimeout(function() {
          wipe.style.transition = 'transform ' + dur + 'ms cubic-bezier(0.76,0,0.24,1)';
          wipe.style.transform  = 'translateY(-100%)';
          setTimeout(function() { wipe.remove(); }, dur + 20);
        }, dur);
      });
    });
  });
});

// Belt-and-suspenders: also sync icon after all scripts settle
if (document.readyState !== 'loading') {
  requestAnimationFrame(_syncThemeBtn);
}

// ── Mouse-tracking 3D tilt utility ────────────
// Usage: window.applyTilt(arrayOfElements)
// Attaches a smooth cursor-following 3D tilt to each element.
window.applyTilt = (function() {
  var MAX = 4;
  return function(els) {
    Array.from(els).forEach(function(el) {
      el.addEventListener('mousemove', function(e) {
        var r  = el.getBoundingClientRect();
        var x  = ((e.clientX - r.left)  / r.width  - 0.5) * 2;
        var y  = ((e.clientY - r.top)   / r.height - 0.5) * 2;
        el.style.transform  = 'perspective(900px) rotateY(' + (x * MAX) + 'deg) rotateX(' + (-y * MAX * 0.5) + 'deg) scale(1.015) translateZ(4px)';
        el.style.transition = 'transform 0.1s linear';
        el.style.willChange = 'transform';
        el.style.zIndex     = '2';
      });
      el.addEventListener('mouseleave', function() {
        el.style.transition = 'transform 0.4s cubic-bezier(0.4,0,0.2,1)';
        el.style.transform  = '';
        el.style.zIndex     = '';
        setTimeout(function() { el.style.willChange = 'auto'; }, 450);
      });
    });
  };
})();

// ── Page transition crossfade ──────────────────
(function() {
  // Inject overlay element
  var overlay = document.createElement('div');
  overlay.id = 'pg-transition';
  overlay.style.cssText = 'position:fixed;inset:0;background:#08080c;z-index:99999;pointer-events:none;opacity:1;transition:opacity 0.22s ease;';
  document.documentElement.appendChild(overlay);

  // Fade in on load (page arrives faded black, fades to transparent)
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { overlay.style.opacity = '0'; }, 50);
  });

  // On internal link click, fade to black then navigate
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    // Only internal same-origin links, not hash links, not new-tab
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || a.target === '_blank') return;
    e.preventDefault();
    overlay.style.opacity = '1';
    setTimeout(function() { window.location.href = href; }, 200);
  });
})();
