/* MMA Bridge — FX Engine v2.0
   Typewriter · Scramble · CountUp · Progress · Stagger · Glitch · Spotlight · NeonPulse
   Auto-wires via data attributes & class names. No dependencies. */

(function () {
  'use strict';

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!%';

  /* ══════════════════════════════════════════════════
     1. TYPEWRITER
     <el data-typewriter="Text to type" data-tw-speed="40" data-tw-delay="200">
     Or leave content in element: <h1 data-typewriter>Already here</h1>
  ══════════════════════════════════════════════════ */
  function typewriter(el, text, speed, delay) {
    text  = text  || el.dataset.typewriter || el.textContent;
    speed = speed || parseInt(el.dataset.twSpeed)  || 42;
    delay = delay || parseInt(el.dataset.twDelay)  || 0;
    el.textContent = '';
    el.classList.add('fx-tw-cursor');
    var i = 0;
    function tick() {
      el.textContent += text[i++];
      if (i < text.length) setTimeout(tick, speed);
      else setTimeout(function () { el.classList.remove('fx-tw-cursor'); }, 1400);
    }
    if (delay > 0) setTimeout(tick, delay);
    else tick();
  }
  window.FXTypewriter = typewriter;

  function initTypewriters() {
    document.querySelectorAll('[data-typewriter]:not([data-tw-done])').forEach(function (el) {
      el.dataset.twDone = '1';
      typewriter(el);
    });
  }

  /* ══════════════════════════════════════════════════
     2. TEXT SCRAMBLE
     <el data-scramble> — scrambles on hover, resolves to real text
     window.FXScramble(el) for programmatic trigger
  ══════════════════════════════════════════════════ */
  function scramble(el, finalText) {
    var final = finalText || el.dataset.scramble || el.textContent;
    var frames = Math.max(final.replace(/\s/g,'').length * 2, 10);
    var frame  = 0;
    function tick() {
      el.textContent = final.split('').map(function (ch, i) {
        if (ch === ' ') return ' ';
        if (frame / frames > i / final.length) return ch;
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      }).join('');
      frame++;
      if (frame <= frames) requestAnimationFrame(tick);
      else el.textContent = final;
    }
    requestAnimationFrame(tick);
  }
  window.FXScramble = scramble;

  function initScramble() {
    document.querySelectorAll('[data-scramble]:not([data-sc-bound])').forEach(function (el) {
      el.dataset.scBound = '1';
      var original = el.dataset.scramble || el.textContent;
      if (!el.dataset.scramble) el.dataset.scramble = original;
      el.addEventListener('mouseenter', function () { scramble(el); });
    });
  }

  /* ══════════════════════════════════════════════════
     3. COUNT-UP
     <span data-count="67" data-count-suffix="%" data-count-duration="900">
     Triggers when element enters viewport.
  ══════════════════════════════════════════════════ */
  function countUp(el) {
    var end      = parseFloat(el.dataset.count);
    var suffix   = el.dataset.countSuffix   || '';
    var prefix   = el.dataset.countPrefix   || '';
    var decimals = parseInt(el.dataset.countDecimals) || 0;
    var duration = parseInt(el.dataset.countDuration) || 900;
    if (isNaN(end)) return;
    var startTs = null;
    function step(ts) {
      if (!startTs) startTs = ts;
      var p = Math.min((ts - startTs) / duration, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (end * e).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  window.FXCountUp = countUp;

  /* ══════════════════════════════════════════════════
     4. PROGRESS BAR
     <div class="fx-bar"><div class="fx-bar-fill" data-progress="75"></div></div>
     Fills when in viewport. CSS transition handles the animation.
  ══════════════════════════════════════════════════ */
  function fillBar(el) {
    var pct = Math.min(parseFloat(el.dataset.progress) || 0, 100);
    el.style.width = '0%';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.style.width = pct + '%'; });
    });
  }
  window.FXFill = fillBar;

  /* ══════════════════════════════════════════════════
     5. STAGGER CHILDREN
     <div class="stagger-children" data-stagger-delay="55" data-stagger-type="up|left|scale">
     Staggers all direct children when parent enters viewport.
  ══════════════════════════════════════════════════ */
  function staggerChildren(parent, opts) {
    opts  = opts || {};
    var delay = opts.delay || parseInt(parent.dataset.staggerDelay) || 55;
    var type  = opts.type  || parent.dataset.staggerType || 'up';
    var cls   = type === 'scale' ? 'fx-sc-in'
              : type === 'left'  ? 'fx-lft-in'
              :                    'fx-up-in';
    Array.from(parent.children).forEach(function (child, i) {
      child.classList.remove('fx-up-in', 'fx-lft-in', 'fx-sc-in');
      child.style.animationDelay = (i * delay) + 'ms';
      void child.offsetWidth;
      child.classList.add(cls);
    });
  }
  window.FXStagger = staggerChildren;

  /* ══════════════════════════════════════════════════
     6. GLITCH FLASH
     window.FXGlitch(el) — one-shot glitch, then clean
     <el class="glitch-hover"> — glitches on hover automatically
  ══════════════════════════════════════════════════ */
  function glitch(el) {
    el.classList.remove('fx-glitching');
    void el.offsetWidth;
    el.classList.add('fx-glitching');
    el.addEventListener('animationend', function handler() {
      el.classList.remove('fx-glitching');
      el.removeEventListener('animationend', handler);
    });
  }
  window.FXGlitch = glitch;

  function initGlitchHover() {
    document.querySelectorAll('.glitch-hover:not([data-gh-bound])').forEach(function (el) {
      el.dataset.ghBound = '1';
      el.addEventListener('mouseenter', function () { glitch(el); });
    });
  }

  /* ══════════════════════════════════════════════════
     7. SPOTLIGHT CURSOR GLOW
     <section class="spotlight-bg"> — glow follows cursor inside element
  ══════════════════════════════════════════════════ */
  function initSpotlight() {
    document.querySelectorAll('.spotlight-bg:not([data-sp-bound])').forEach(function (el) {
      el.dataset.spBound = '1';
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--sx', ((e.clientX - r.left) / r.width  * 100) + '%');
        el.style.setProperty('--sy', ((e.clientY - r.top)  / r.height * 100) + '%');
      });
    });
  }

  /* ══════════════════════════════════════════════════
     8. SCROLL-REVEAL (enhanced — handles both .reveal and [data-reveal])
  ══════════════════════════════════════════════════ */
  var REVEAL_SEL = '.reveal:not(.visible), [data-reveal]:not(.is-visible)';

  /* ══════════════════════════════════════════════════
     9. IntersectionObserver — drives reveal, count, fill, stagger
  ══════════════════════════════════════════════════ */
  if (typeof IntersectionObserver === 'undefined') return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;

      if (el.classList.contains('reveal') || el.hasAttribute('data-reveal')) {
        el.classList.add('visible', 'is-visible');
      }
      if (el.hasAttribute('data-count') && !el.dataset.counted) {
        el.dataset.counted = '1';
        countUp(el);
      }
      if (el.hasAttribute('data-progress') && !el.dataset.filled) {
        el.dataset.filled = '1';
        fillBar(el);
      }
      if (el.classList.contains('stagger-children') && !el.dataset.staggered) {
        el.dataset.staggered = '1';
        staggerChildren(el);
      }

      io.unobserve(el);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  function observe() {
    var sel = [
      REVEAL_SEL,
      '[data-count]:not([data-counted])',
      '[data-progress]:not([data-filled])',
      '.stagger-children:not([data-staggered])',
    ].join(', ');
    document.querySelectorAll(sel).forEach(function (el) { io.observe(el); });
  }
  window.FXObserve = observe;

  /* ══════════════════════════════════════════════════
     10. RE-RUN on dynamic content (called by page scripts after rendering)
  ══════════════════════════════════════════════════ */
  window.FXInit = function () {
    initTypewriters();
    initScramble();
    initGlitchHover();
    initSpotlight();
    observe();
  };

  /* ── Boot ── */
  function boot() {
    initTypewriters();
    initScramble();
    initGlitchHover();
    initSpotlight();
    observe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
