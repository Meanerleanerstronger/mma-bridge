/* ═══════════════════════════════════════════════════════════
   MMA BRIDGE — PREMIUM ANIMATIONS v1.0
   Page transitions · Scroll animations · Micro interactions
   Cursor glow · Skeleton loaders · Typography entrance
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 1. CURSOR GLOW ──────────────────────────────────────── */
  function initCursorGlow() {
    if (window.matchMedia('(pointer: coarse)').matches) return; // skip mobile/touch
    const glow = document.createElement('div');
    glow.id = 'cursor-glow';
    glow.style.cssText = `
      position:fixed;width:320px;height:320px;border-radius:50%;
      pointer-events:none;z-index:9999;
      background:radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%);
      transform:translate(-50%,-50%);
      transition:opacity 0.3s ease;
      opacity:0;top:0;left:0;
    `;
    document.body.appendChild(glow);

    let mx = 0, my = 0, cx = 0, cy = 0;
    let raf;

    document.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      glow.style.opacity = '1';
    });
    document.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });

    function animateGlow() {
      cx += (mx - cx) * 0.12;
      cy += (my - cy) * 0.12;
      glow.style.left = cx + 'px';
      glow.style.top  = cy + 'px';
      raf = requestAnimationFrame(animateGlow);
    }
    animateGlow();

    // Intensify on hover over interactive elements
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('a,button,.ev-card,.review-card,.pfp-card,.result-card');
      if (t) {
        glow.style.background = 'radial-gradient(circle, rgba(0,229,255,0.11) 0%, transparent 65%)';
        glow.style.width = '380px';
        glow.style.height = '380px';
      }
    });
    document.addEventListener('mouseout', e => {
      const t = e.target.closest('a,button,.ev-card,.review-card,.pfp-card,.result-card');
      if (t) {
        glow.style.background = 'radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%)';
        glow.style.width = '320px';
        glow.style.height = '320px';
      }
    });
  }

  /* ── 2. PAGE TRANSITIONS ─────────────────────────────────── */
  function initPageTransitions() {
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:#060608;
      opacity:0;pointer-events:none;
      transition:opacity 0.22s cubic-bezier(0.4,0,0.2,1);
    `;
    document.body.appendChild(overlay);

    // Fade IN on page load
    requestAnimationFrame(() => {
      document.body.style.opacity = '0';
      document.body.style.transition = 'none';
      requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.28s ease';
        document.body.style.opacity = '1';
      });
    });

    // Intercept internal nav clicks
    document.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;

      const href = a.getAttribute('href');
      if (!href) return;
      if (href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto') || href.startsWith('#')) return;
      if (a.target === '_blank') return;

      // Internal link — do transition
      e.preventDefault();
      document.body.style.transition = 'opacity 0.18s ease';
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = href; }, 190);
    });

    // Handle back/forward
    window.addEventListener('pageshow', e => {
      if (e.persisted) {
        document.body.style.opacity = '1';
      }
    });
  }

  /* ── 3. SCROLL ANIMATIONS ────────────────────────────────── */
  function initScrollAnimations() {
    const style = document.createElement('style');
    style.textContent = `
      .sa-ready {
        opacity: 0;
        transform: translateY(22px);
        transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1);
      }
      .sa-ready.sa-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .sa-ready.sa-delay-1 { transition-delay: 0.06s; }
      .sa-ready.sa-delay-2 { transition-delay: 0.12s; }
      .sa-ready.sa-delay-3 { transition-delay: 0.18s; }
      .sa-ready.sa-delay-4 { transition-delay: 0.24s; }
      .sa-ready.sa-delay-5 { transition-delay: 0.30s; }
    `;
    document.head.appendChild(style);

    // Apply to key elements
    const selectors = [
      '.card-row .news-card',
      '.ev-card',
      '.review-card',
      '.pfp-card',
      '.pfp-row',
      '.result-card',
      '.section-title',
      '.results-section-label',
      '.hero',
      '.content-container',
      '[class*="fight-row"]',
    ];

    // Wait for dynamic content
    function applyToElements() {
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach((el, i) => {
          if (el.dataset.saInit) return;
          el.dataset.saInit = '1';
          el.classList.add('sa-ready');
          const delay = Math.min(i % 6, 5);
          if (delay > 0) el.classList.add(`sa-delay-${delay}`);
        });
      });
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('sa-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    function observeAll() {
      applyToElements();
      document.querySelectorAll('.sa-ready:not(.sa-visible)').forEach(el => {
        observer.observe(el);
      });
    }

    // Run now and watch for dynamic content
    setTimeout(observeAll, 100);
    setTimeout(observeAll, 600);
    setTimeout(observeAll, 1400);

    // MutationObserver for dynamically injected content
    const mo = new MutationObserver(() => {
      clearTimeout(mo._t);
      mo._t = setTimeout(observeAll, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 4. MICRO INTERACTIONS ───────────────────────────────── */
  function initMicroInteractions() {
    const style = document.createElement('style');
    style.textContent = `
      /* Button pulse on click */
      .theme-toggle, .nav-hamburger, button:not(.ov-close):not(.opb) {
        transition: transform 0.12s cubic-bezier(0.34,1.56,0.64,1) !important;
      }
      .theme-toggle:active, button:active {
        transform: scale(0.92) !important;
      }

      /* Card tilt effect */
      .ev-card, .review-card {
        transform-style: preserve-3d;
        will-change: transform;
      }

      /* Nav link underline slide */
      .nav-links a {
        position: relative;
      }
      .nav-links a::after {
        content: '';
        position: absolute;
        bottom: -2px; left: 0;
        width: 0; height: 1.5px;
        background: #00e5ff;
        transition: width 0.22s cubic-bezier(0.22,1,0.36,1);
        border-radius: 1px;
      }
      .nav-links a:hover::after,
      .nav-links a.active::after {
        width: 100%;
      }

      /* Hype thumb bounce */
      .ov-hype-thumb {
        transition: left 0.08s ease, background 0.25s, border-color 0.25s, transform 0.15s cubic-bezier(0.34,1.56,0.64,1) !important;
      }

      /* Fight row hover glow line */
      .ov-fight {
        transition: background 0.18s, box-shadow 0.18s !important;
      }
      .ov-fight:hover {
        box-shadow: inset 2px 0 0 rgba(0,229,255,0.4) !important;
      }

      /* Search box focus glow */
      .search-box input:focus {
        outline: none;
        box-shadow: 0 0 0 1.5px rgba(0,229,255,0.35), 0 4px 20px rgba(0,229,255,0.08) !important;
      }

      /* Logo subtle pulse on hover */
      .nav-logo-img {
        transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), filter 0.2s !important;
      }
      .nav-logo-img:hover {
        transform: scale(1.06) !important;
        filter: brightness(1.1) !important;
      }

      /* Result card hover lift */
      .result-card {
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s !important;
      }
      .result-card:hover {
        transform: translateY(-3px) scale(1.02) !important;
        box-shadow: 0 12px 32px rgba(0,0,0,0.6) !important;
      }
    `;
    document.head.appendChild(style);

    // Card 3D tilt
    function addTilt(selector) {
      document.addEventListener('mousemove', e => {
        const card = e.target.closest(selector);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width  - 0.5;
        const y = (e.clientY - rect.top)  / rect.height - 0.5;
        const rx = -y * 6;
        const ry =  x * 6;
        card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
      });
      document.addEventListener('mouseleave', e => {
        const card = e.target.closest(selector);
        if (!card) return;
        card.style.transform = '';
      }, true);
    }

    // Only tilt on desktop
    if (!window.matchMedia('(pointer: coarse)').matches) {
      addTilt('.ev-card');
    }

    // Button ripple effect
    document.addEventListener('click', e => {
      const btn = e.target.closest('.theme-toggle, .ov-lock-btn, .nav-hamburger');
      if (!btn) return;
      const ripple = document.createElement('span');
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.style.cssText = `
        position:absolute;border-radius:50%;
        width:${size}px;height:${size}px;
        left:${e.clientX - rect.left - size/2}px;
        top:${e.clientY - rect.top - size/2}px;
        background:rgba(0,229,255,0.15);
        transform:scale(0);animation:ripple-anim 0.5s ease-out forwards;
        pointer-events:none;
      `;
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 520);
    });

    // Inject ripple keyframe
    const ks = document.createElement('style');
    ks.textContent = `@keyframes ripple-anim { to { transform: scale(1); opacity: 0; } }`;
    document.head.appendChild(ks);
  }

  /* ── 5. SKELETON LOADERS ─────────────────────────────────── */
  function initSkeletonLoaders() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes skeleton-shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position:  400px 0; }
      }
      .skeleton {
        background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%);
        background-size: 400px 100%;
        animation: skeleton-shimmer 1.4s ease infinite;
        border-radius: 6px;
      }
      .skeleton-card {
        height: 160px;
        border-radius: 16px;
        margin-bottom: 14px;
      }
      .skeleton-text {
        height: 14px;
        margin-bottom: 8px;
        border-radius: 4px;
      }
      .skeleton-text.short { width: 40%; }
      .skeleton-text.medium { width: 65%; }
      .skeleton-text.full { width: 100%; }
    `;
    document.head.appendChild(style);
  }

  /* ── 6. TYPOGRAPHY ENTRANCE ──────────────────────────────── */
  function initTypographyEntrance() {
    // Animate the main hero heading on page load
    const hero = document.querySelector('.hero h1, .ev-hero h1, .pfp-hero h1, [class*="hero"] h1');
    if (!hero) return;

    hero.style.opacity = '0';
    hero.style.transform = 'translateY(20px)';
    hero.style.transition = 'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)';
    hero.style.transitionDelay = '0.15s';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hero.style.opacity = '1';
        hero.style.transform = 'translateY(0)';
      });
    });
  }

  /* ── 7. SMOOTH SCROLL ────────────────────────────────────── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ── INIT ALL ─────────────────────────────────────────────── */
  function init() {
    initCursorGlow();
    initPageTransitions();
    initScrollAnimations();
    initMicroInteractions();
    initSkeletonLoaders();
    initSmoothScroll();

    // Typography entrance after DOM settles
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTypographyEntrance);
    } else {
      setTimeout(initTypographyEntrance, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
