/* ux.js v1.0 — MMA Bridge global UX layer
   Page transitions · Scroll reveals · 3D tilt · Spring press
   Swipe-back · Number counters · Blur-up images · Confetti */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     1. PAGE TRANSITIONS
  ───────────────────────────────────────────── */
  // Mark entering immediately (before DOMContentLoaded) so CSS can animate
  document.documentElement.classList.add('ux-entering');
  window.addEventListener('DOMContentLoaded', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.remove('ux-entering');
        document.documentElement.classList.add('ux-entered');
      });
    });
  });

  function navigateTo(href) {
    if (document.documentElement.classList.contains('ux-exiting')) return;
    document.documentElement.classList.add('ux-exiting');
    setTimeout(function () { location.href = href; }, 260);
  }
  window.MMANavigate = navigateTo;

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    // Same page, only hash differs — skip
    if (url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    navigateTo(href);
  });


  /* ─────────────────────────────────────────────
     2. SCROLL REVEALS with stagger
  ───────────────────────────────────────────── */
  const REVEAL_SELS = [
    '.ev-card-wrap', '.pk-fight-section', '.pk-hype-hero',
    '.lb-row', '.review-card', '.pfp-card', '.about-block',
    '.pk-hd', '.pk-fotn-section', '.mu-fighter-col',
    '.ov-stat-row', '.pk-score-hint'
  ];

  var revealObs;
  function initReveals() {
    if (!window.IntersectionObserver) return;
    revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('sr-revealed');
        revealObs.unobserve(entry.target);
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -24px 0px' });

    function scan() {
      REVEAL_SELS.forEach(function (sel) {
        document.querySelectorAll(sel + ':not(.sr-watching)').forEach(function (el) {
          // Stagger by sibling index within parent
          var siblings = el.parentNode ? Array.from(el.parentNode.children) : [];
          var idx = siblings.indexOf(el);
          el.style.transitionDelay = Math.min(idx * 52, 360) + 'ms';
          el.classList.add('sr-watching');
          revealObs.observe(el);
        });
      });
    }
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }


  /* ─────────────────────────────────────────────
     3. 3-D CARD TILT
  ───────────────────────────────────────────── */
  var TILT_SEL = '.ev-card, .review-card, .pfp-card';
  function initTilt() {
    // Only on non-touch devices
    if (window.matchMedia('(hover: none)').matches) return;

    document.addEventListener('mousemove', function (e) {
      var card = e.target.closest(TILT_SEL);
      if (!card) return;
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform =
        'perspective(800px) rotateX(' + (-y * 7) + 'deg) rotateY(' + (x * 7) + 'deg) translateY(-4px) scale(1.018)';
    });

    document.addEventListener('mouseout', function (e) {
      var card = e.target.closest(TILT_SEL);
      if (card && !card.contains(e.relatedTarget)) {
        card.style.transform = '';
      }
    });
  }


  /* ─────────────────────────────────────────────
     4. SPRING BUTTON PRESS
  ───────────────────────────────────────────── */
  var PRESS_SEL = [
    'button:not(.theme-toggle):not(.ov-close):not(.nav-hamburger)',
    '.pk-pick-btn', '.fc-head', '.mu-back', '.pk-back',
    '.lb-tab', '.ev-card-cta', '.pk-save-btn'
  ].join(',');

  function initSpring() {
    function press(e) {
      var el = (e.target || e.touches[0].target).closest(PRESS_SEL);
      if (el) el.classList.add('ux-pressed');
    }
    function release() {
      document.querySelectorAll('.ux-pressed').forEach(function (el) {
        el.classList.remove('ux-pressed');
      });
    }
    document.addEventListener('mousedown', press);
    document.addEventListener('mouseup', release);
    document.addEventListener('mouseleave', release);
    document.addEventListener('touchstart', press, { passive: true });
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
  }


  /* ─────────────────────────────────────────────
     5. SWIPE-BACK GESTURE
  ───────────────────────────────────────────── */
  function initSwipeBack() {
    var sx = 0, sy = 0;
    document.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = Math.abs(e.changedTouches[0].clientY - sy);
      // Swipe right from left edge
      if (dx > 72 && dy < 100 && sx < 48) {
        history.back();
      }
    }, { passive: true });
  }


  /* ─────────────────────────────────────────────
     6. NUMBER COUNTER ANIMATION
     Usage: <span data-counter="87.4" data-dec="1" data-suffix="%">87.4%</span>
  ───────────────────────────────────────────── */
  function animateCounter(el) {
    var target  = parseFloat(el.dataset.counter);
    var dec     = parseInt(el.dataset.dec || '0');
    var suffix  = el.dataset.suffix || '';
    var dur     = 1100;
    var startTs = performance.now();
    function tick(now) {
      var t    = Math.min((now - startTs) / dur, 1);
      var ease = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * ease).toFixed(dec) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initCounters() {
    if (!window.IntersectionObserver) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    function scan() {
      document.querySelectorAll('[data-counter]:not([data-counter-done])').forEach(function (el) {
        el.dataset.counterDone = '1';
        obs.observe(el);
      });
    }
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  window.MMAAnimateCounter = animateCounter;


  /* ─────────────────────────────────────────────
     7. BLUR-UP IMAGE LOADING
  ───────────────────────────────────────────── */
  function applyBlurUp(img) {
    if (img.dataset.blurupDone || img.complete || !img.src) return;
    img.classList.add('ux-img-loading');
    img.addEventListener('load', function () {
      img.classList.remove('ux-img-loading');
      img.classList.add('ux-img-loaded');
      img.dataset.blurupDone = '1';
    }, { once: true });
    img.addEventListener('error', function () {
      img.classList.remove('ux-img-loading');
      img.dataset.blurupDone = '1';
    }, { once: true });
  }

  function initBlurUp() {
    document.querySelectorAll('img').forEach(applyBlurUp);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'IMG') applyBlurUp(n);
          if (n.querySelectorAll) n.querySelectorAll('img').forEach(applyBlurUp);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }


  /* ─────────────────────────────────────────────
     8. CONFETTI CELEBRATION
  ───────────────────────────────────────────── */
  var CONFETTI_COLORS = ['#f0b429','#ff6030','#ffffff','#c8a84b','#ff3300','#ffd700'];

  function burstConfetti(cx, cy, count) {
    count = count || 36;
    for (var i = 0; i < count; i++) {
      (function (i) {
        var delay = Math.random() * 80;
        setTimeout(function () {
          var el = document.createElement('div');
          el.className = 'ux-confetti';
          var angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
          var dist  = 55 + Math.random() * 90;
          var w     = 3 + Math.random() * 5;
          var h     = 5 + Math.random() * 9;
          el.style.cssText = [
            'left:'       + cx + 'px',
            'top:'        + cy + 'px',
            'width:'      + w  + 'px',
            'height:'     + h  + 'px',
            'background:' + CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            '--dx:'       + (Math.cos(angle) * dist) + 'px',
            '--dy:'       + (Math.sin(angle) * dist - 90) + 'px',
            '--rot:'      + (Math.random() * 600 - 300) + 'deg',
            '--dur:'      + (700 + Math.random() * 300) + 'ms',
          ].join(';');
          document.body.appendChild(el);
          setTimeout(function () { el.remove(); }, 1100);
        }, delay);
      })(i);
    }
  }
  window.MMAConfetti = burstConfetti;

  // Auto-hook: watch the pk-toast element, fire confetti on successful save
  function hookToast() {
    var toast = document.getElementById('pkToast');
    if (!toast) return;
    var obs = new MutationObserver(function () {
      if (toast.style.display === 'none') return;
      if (!toast.classList.contains('pk-toast-ok')) return;
      var r = toast.getBoundingClientRect();
      burstConfetti(r.left + r.width / 2, r.top + r.height / 2, 32);
    });
    obs.observe(toast, { attributes: true, attributeFilter: ['style', 'class'] });
  }


  /* ─────────────────────────────────────────────
     9. TAB CROSSFADE
     Add class ux-tab-panel to tab content panels;
     toggling display will auto-crossfade.
  ───────────────────────────────────────────── */
  function fadeSwap(hideEl, showEl, cb) {
    if (!hideEl || !showEl) { if (cb) cb(); return; }
    hideEl.classList.add('ux-tab-out');
    setTimeout(function () {
      hideEl.style.display = 'none';
      hideEl.classList.remove('ux-tab-out');
      showEl.style.display = '';
      showEl.classList.add('ux-tab-in');
      setTimeout(function () {
        showEl.classList.remove('ux-tab-in');
        if (cb) cb();
      }, 240);
    }, 180);
  }
  window.MMAFadeSwap = fadeSwap;


  /* ─────────────────────────────────────────────
     10. RIPPLE on pick selection
  ───────────────────────────────────────────── */
  function spawnRipple(el, e) {
    var r   = el.getBoundingClientRect();
    var cx  = (e.clientX || r.left + r.width  / 2) - r.left;
    var cy  = (e.clientY || r.top  + r.height / 2) - r.top;
    var rip = document.createElement('span');
    rip.className = 'ux-ripple';
    rip.style.left = cx + 'px';
    rip.style.top  = cy + 'px';
    el.appendChild(rip);
    setTimeout(function () { rip.remove(); }, 600);
  }

  function initRipples() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('.pk-side, .pk-pick-btn, .lb-tab, .ev-card-cta');
      if (el) spawnRipple(el, e);
    });
  }


  /* ─────────────────────────────────────────────
     11. FIGHT ROW STAGGER (overlay)
  ───────────────────────────────────────────── */
  function microStaggerFights(col) {
    if (!col) return;
    var rows = col.querySelectorAll('.ov-fight');
    rows.forEach(function (row, i) {
      row.style.opacity = '0';
      row.style.transform = 'translateY(14px)';
      row.style.transition = 'none';
      setTimeout(function () {
        row.style.transition = 'opacity 0.32s ease, transform 0.32s cubic-bezier(0.22,1,0.36,1)';
        row.style.opacity = '1';
        row.style.transform = 'translateY(0)';
      }, 30 + i * 42);
    });
  }
  window.MicroStaggerFights = microStaggerFights;


  /* ─────────────────────────────────────────────
     12. PICK FLOOD FILL
  ───────────────────────────────────────────── */
  function pickFlood(el, e) {
    var existing = el.querySelectorAll('.ux-flood');
    existing.forEach(function (f) { f.remove(); });

    var rect = el.getBoundingClientRect();
    var cx = e ? (e.clientX || e.touches && e.touches[0] && e.touches[0].clientX || rect.left + rect.width / 2) : rect.left + rect.width / 2;
    var cy = e ? (e.clientY || e.touches && e.touches[0] && e.touches[0].clientY || rect.top + rect.height / 2) : rect.top + rect.height / 2;
    var x = cx - rect.left;
    var y = cy - rect.top;

    var flood = document.createElement('span');
    flood.className = 'ux-flood';
    flood.style.left = x + 'px';
    flood.style.top  = y + 'px';
    el.appendChild(flood);
    setTimeout(function () { flood.remove(); }, 650);
  }
  window.MMAPickFlood = pickFlood;


  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', function () {
    initReveals();
    initTilt();
    initSpring();
    initSwipeBack();
    initCounters();
    initBlurUp();
    initRipples();
    hookToast();
  });

})();
