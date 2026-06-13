/* MMA Bridge — Micro-interactions v1.0
   Loaded on every page. Pure vanilla JS — no dependencies.
   Provides utilities for stagger reveals, bar fills, count-ups, theme transitions.
*/
(function () {
  'use strict';

  /* ── 1. Smooth theme transition ─────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.body.classList.add('theme-transitioning');
      setTimeout(function () {
        document.body.classList.remove('theme-transitioning');
      }, 480);
    }, true); // capture — fires before theme.js toggle
  });

  /* ── 2. Stagger reveal ───────────────────────────── */
  //   type: 'up' | 'left' | 'scale'
  window.MicroStagger = function (elements, opts) {
    opts = opts || {};
    var delay  = opts.delay  !== undefined ? opts.delay  : 60;
    var base   = opts.base   !== undefined ? opts.base   : 0;
    var type   = opts.type   || 'up';
    var cls    = type === 'scale' ? 'micro-stagger-sc'
               : type === 'left'  ? 'micro-stagger-lft'
               :                    'micro-stagger-up';

    Array.from(elements).forEach(function (el, i) {
      el.classList.remove(cls);
      el.style.animationDelay = (base + i * delay) + 'ms';
      // Force reflow so removing + re-adding restarts the animation
      void el.offsetWidth;
      el.classList.add(cls);
    });
  };

  /* ── 3. Bar fill animator ────────────────────────── */
  //   Animate a .fill element from 0 → targetPct% using the CSS transition
  window.MicroFill = function (el, targetPct) {
    if (!el) return;
    el.style.width = '0%';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.width = targetPct + '%';
      });
    });
  };

  /* ── 4. Count-up animator ────────────────────────── */
  window.MicroCount = function (el, end, duration) {
    if (!el || isNaN(end)) return;
    duration = duration || 750;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(end * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  /* ── 5. News card stagger ────────────────────────── */
  window.MicroStaggerNews = function (container) {
    if (!container) return;
    var cards = container.querySelectorAll('.card-link');
    Array.from(cards).forEach(function (card, i) {
      card.classList.remove('nc-entering');
      card.style.animationDelay = (60 + i * 90) + 'ms';
      void card.offsetWidth;
      card.classList.add('nc-entering');
    });
  };

  /* ── 6. Events overlay fight-row stagger ─────────── */
  window.MicroStaggerFights = function (container) {
    if (!container) return;
    var rows = container.querySelectorAll('.ov-fight, .ov-section-header');
    Array.from(rows).forEach(function (row, i) {
      row.classList.remove('ov-entering');
      row.style.animationDelay = (30 + i * 42) + 'ms';
      void row.offsetWidth;
      row.classList.add('ov-entering');
    });
  };

  /* ── 7. PFP streak pill stagger ─────────────────── */
  window.MicroStaggerPills = function (container) {
    if (!container) return;
    var pills = container.querySelectorAll('.pfp-streak-pill');
    Array.from(pills).forEach(function (pill, i) {
      pill.classList.remove('pill-popping');
      pill.style.animationDelay = (100 + i * 60) + 'ms';
      void pill.offsetWidth;
      pill.classList.add('pill-popping');
    });
  };

  /* ── 8. PFP stat box stagger ─────────────────────── */
  window.MicroStaggerStats = function (container) {
    if (!container) return;
    var boxes = container.querySelectorAll('.pfp-stat-box');
    Array.from(boxes).forEach(function (box, i) {
      box.classList.remove('stat-entering');
      box.style.animationDelay = (160 + i * 55) + 'ms';
      void box.offsetWidth;
      box.classList.add('stat-entering');
    });
  };

  /* ── 9. Result track card stagger ────────────────── */
  window.MicroStaggerResults = function (container) {
    if (!container) return;
    var cards = container.querySelectorAll('.result-event-card');
    Array.from(cards).forEach(function (card, i) {
      card.classList.remove('rc-entering');
      card.style.animationDelay = (i * 55) + 'ms';
      void card.offsetWidth;
      card.classList.add('rc-entering');
    });
  };

})();
