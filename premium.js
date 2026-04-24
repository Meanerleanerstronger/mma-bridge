/* ═══════════════════════════════════════════════════════════════
   MMA BRIDGE — PREMIUM.JS v2.0
   ① Page transitions      ② Parallax hero
   ③ Kinetic typography    ④ Film grain overlay
   ⑤ Glassmorphism cards   ⑥ Number countups
   ⑦ Scroll reveal         ⑧ Cursor glow
   ⑨ Micro interactions
═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ════════════════════════════════════════
   ① PAGE TRANSITIONS — fade between pages
═════════════════════════════════════════ */
function initPageTransitions() {
  document.body.style.opacity = '0';
  document.body.style.transition = 'none';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.style.transition = 'opacity 0.32s cubic-bezier(0.4,0,0.2,1)';
    document.body.style.opacity = '1';
  }));

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('http') || href.startsWith('//') ||
        href.startsWith('mailto') || href.startsWith('#') ||
        href.startsWith('javascript') || a.target === '_blank') return;
    // Don't intercept overlay links
    if (a.closest('.ev-overlay, .ov-panel')) return;
    e.preventDefault();
    document.body.style.transition = 'opacity 0.2s ease';
    document.body.style.opacity = '0';
    setTimeout(() => { window.location.href = href; }, 215);
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) {
      document.body.style.transition = 'none';
      document.body.style.opacity = '1';
    }
  });
}

/* ════════════════════════════════════════
   ② PARALLAX HERO — poster drifts on scroll
═════════════════════════════════════════ */
function initParallax() {
  const heroImg     = document.getElementById('heroImg');
  const heroSection = document.getElementById('heroSection');
  const heroContent = document.getElementById('hero-content');
  if (!heroImg || !heroSection) return;

  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sy = window.scrollY;
      const hh = heroSection.offsetHeight;
      if (sy < hh * 1.5) {
        // Poster moves at 40% of scroll speed — creates depth
        heroImg.style.transform = `translateY(${sy * 0.38}px) scale(1.06)`;
        // Content drifts up and fades
        if (heroContent) {
          heroContent.style.transform = `translateY(${sy * 0.14}px)`;
          heroContent.style.opacity = Math.max(0, 1 - sy / (hh * 0.72));
        }
      }
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  // Make sure initial scale is set
  heroImg.style.transformOrigin = 'center top';
  heroImg.style.transition = 'none';
}

/* ════════════════════════════════════════
   ③ KINETIC TYPOGRAPHY — letters slide in
═════════════════════════════════════════ */
function initKineticType() {
  var css = document.createElement('style');
  css.textContent = `
    .kt-wrap { display:inline-block; overflow:hidden; vertical-align:bottom; }
    .kt-char  {
      display:inline-block;
      opacity:0;
      transform:translateY(105%);
      transition:opacity 0.5s cubic-bezier(0.22,1,0.36,1),
                 transform 0.5s cubic-bezier(0.22,1,0.36,1);
    }
    .kt-char.kt-in { opacity:1; transform:translateY(0); }
    .kt-done { opacity:1 !important; transform:none !important; }
  `;
  document.head.appendChild(css);

  function splitElement(el) {
    if (el.dataset.ktDone) return;
    el.dataset.ktDone = '1';
    var text = el.textContent.trim();
    var words = text.split(' ');
    el.innerHTML = '';
    words.forEach((word, wi) => {
      var wrap = document.createElement('span');
      wrap.className = 'kt-wrap';
      word.split('').forEach((ch, ci) => {
        var span = document.createElement('span');
        span.className = 'kt-char';
        span.textContent = ch === ' ' ? '\u00a0' : ch;
        span.style.transitionDelay = ((wi * word.length + ci) * 0.028) + 's';
        wrap.appendChild(span);
      });
      el.appendChild(wrap);
      if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }

  function animateIn(el) {
    el.querySelectorAll('.kt-char').forEach(c => c.classList.add('kt-in'));
  }

  // Apply to hero title on index
  var heroTitle = document.getElementById('heroTitle');
  if (heroTitle) {
    // Watch for content to be injected by script.js
    var prevText = '';
    setInterval(() => {
      var t = heroTitle.textContent.trim();
      if (t && t !== prevText && !t.includes('kt-char')) {
        prevText = t;
        splitElement(heroTitle);
        requestAnimationFrame(() => requestAnimationFrame(() => animateIn(heroTitle)));
      }
    }, 200);
  }

  // Apply to page headings via IntersectionObserver
  var ktObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      splitElement(el);
      requestAnimationFrame(() => requestAnimationFrame(() => animateIn(el)));
      ktObserver.unobserve(el);
    });
  }, { threshold: 0.3 });

  function observeHeadings() {
    document.querySelectorAll(
      '.ev-hero h1, .pfp-hero h1, h2.page-title, .ov-matchup'
    ).forEach(el => {
      if (!el.dataset.ktDone) ktObserver.observe(el);
    });
  }
  observeHeadings();
  setTimeout(observeHeadings, 800);
}

/* ════════════════════════════════════════
   ④ FILM GRAIN — cinematic texture overlay
═════════════════════════════════════════ */
function initFilmGrain() {
  // SVG noise filter — zero performance cost
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;';
  svg.innerHTML = `
    <defs>
      <filter id="mb-grain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="4"
          stitchTiles="stitch" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
        <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend"/>
        <feComposite in="blend" in2="SourceGraphic" operator="in"/>
      </filter>
    </defs>
  `;
  document.body.appendChild(svg);

  // Canvas-based animated grain overlay
  var canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position:fixed;inset:0;width:100%;height:100%;
    pointer-events:none;z-index:9998;opacity:0.038;
    mix-blend-mode:overlay;
  `;
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  var frame = 0;

  function resize() {
    canvas.width  = Math.ceil(window.innerWidth  / 2);
    canvas.height = Math.ceil(window.innerHeight / 2);
    canvas.style.imageRendering = 'pixelated';
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function drawGrain() {
    var w = canvas.width, h = canvas.height;
    var img = ctx.createImageData(w, h);
    var data = img.data;
    for (var i = 0; i < data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      data[i] = data[i+1] = data[i+2] = v;
      data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  var grainRaf;
  function grainLoop() {
    frame++;
    if (frame % 3 === 0) drawGrain(); // update every 3 frames for subtle flicker
    grainRaf = requestAnimationFrame(grainLoop);
  }
  grainLoop();

  // Pause when tab hidden for performance
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(grainRaf);
    else grainLoop();
  });
}

/* ════════════════════════════════════════
   ⑤ GLASSMORPHISM — frosted glass cards
═════════════════════════════════════════ */
function initGlassmorphism() {
  var css = document.createElement('style');
  css.textContent = `
    /* Glassmorphism on news/trending cards */
    .news-card, .trending-card {
      background: rgba(255,255,255,0.04) !important;
      backdrop-filter: blur(12px) saturate(1.4) !important;
      -webkit-backdrop-filter: blur(12px) saturate(1.4) !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06) !important;
      transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1),
                  box-shadow 0.28s ease,
                  border-color 0.2s ease !important;
    }
    .news-card:hover, .trending-card:hover {
      transform: translateY(-5px) !important;
      box-shadow: 0 20px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1) !important;
      border-color: rgba(0,229,255,0.2) !important;
    }

    /* Glassmorphism on sidebar */
    .sidebar {
      background: rgba(255,255,255,0.025) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
    }

    /* Live feed glass */
    #liveFeed {
      background: rgba(255,255,255,0.025) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255,255,255,0.07) !important;
    }

    /* Navbar glass */
    .navbar {
      background: rgba(6,6,8,0.75) !important;
      backdrop-filter: blur(24px) saturate(1.8) !important;
      -webkit-backdrop-filter: blur(24px) saturate(1.8) !important;
    }
    .navbar.scrolled {
      background: rgba(6,6,8,0.92) !important;
      box-shadow: 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5) !important;
    }

    /* Event overlay glass panels */
    .ov-hype-bar {
      background: rgba(255,255,255,0.03) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
    }
    .ov-sb-section {
      background: rgba(255,255,255,0.02) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
    }

    /* Result cards glass */
    .result-card {
      background: rgba(255,255,255,0.035) !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
      border: 1px solid rgba(255,255,255,0.07) !important;
    }
    .result-card:hover {
      transform: translateY(-4px) scale(1.025) !important;
      box-shadow: 0 16px 40px rgba(0,0,0,0.6) !important;
      border-color: rgba(0,229,255,0.18) !important;
    }

    /* Light mode glass */
    body.light-mode .news-card,
    body.light-mode .trending-card {
      background: rgba(255,255,255,0.7) !important;
      backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(0,0,0,0.08) !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
    }
    body.light-mode .navbar {
      background: rgba(255,255,255,0.82) !important;
      backdrop-filter: blur(24px) !important;
    }
    body.light-mode #liveFeed,
    body.light-mode .sidebar {
      background: rgba(255,255,255,0.6) !important;
      backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(0,0,0,0.07) !important;
    }
  `;
  document.head.appendChild(css);
}

/* ════════════════════════════════════════
   ⑥ NUMBER COUNTUPS — stats count from 0
═════════════════════════════════════════ */
function initCountups() {
  var css = document.createElement('style');
  css.textContent = `
    .countup-stat {
      font-family: 'Barlow Condensed','Montserrat',sans-serif;
      font-weight: 900;
      font-size: 3.2rem;
      line-height: 1;
      color: #00e5ff;
      display: inline-block;
    }
    .countup-label {
      font-family: 'Inter',sans-serif;
      font-size: 0.68rem;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      display: block;
      margin-top: 4px;
    }
    .stats-strip {
      display: flex;
      gap: 48px;
      padding: 32px 48px;
      border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      margin: 0 0 32px;
      flex-wrap: wrap;
    }
    .stat-item { text-align: center; }
    @media(max-width:768px) { .stats-strip { gap:28px; padding:24px 20px; } .countup-stat { font-size:2.2rem; } }
  `;
  document.head.appendChild(css);

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el, target, duration) {
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(easeOut(p) * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Inject stats strip on homepage below hero
  var hero = document.getElementById('heroSection');
  if (hero) {
    var strip = document.createElement('div');
    strip.className = 'stats-strip';
    strip.innerHTML = `
      <div class="stat-item">
        <span class="countup-stat" data-target="327">0</span>
        <span class="countup-label">Events Covered</span>
      </div>
      <div class="stat-item">
        <span class="countup-stat" data-target="75">0</span>
        <span class="countup-label">In Our Database</span>
      </div>
      <div class="stat-item">
        <span class="countup-stat" data-target="16">0</span>
        <span class="countup-label">PFP Fighters</span>
      </div>
      <div class="stat-item">
        <span class="countup-stat" data-target="5">0</span>
        <span class="countup-label">Upcoming Events</span>
      </div>
    `;
    hero.insertAdjacentElement('afterend', strip);

    // Trigger countup when strip enters viewport
    var triggered = false;
    var obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || triggered) return;
      triggered = true;
      strip.querySelectorAll('.countup-stat').forEach(el => {
        countUp(el, parseInt(el.dataset.target), 1800);
      });
      obs.disconnect();
    }, { threshold: 0.4 });
    obs.observe(strip);
  }

  // Also trigger any existing [data-countup] elements
  var cuObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      countUp(el, parseInt(el.dataset.countup), 1600);
      cuObs.unobserve(el);
    });
  }, { threshold: 0.5 });

  function observeCountups() {
    document.querySelectorAll('[data-countup]:not([data-counted])').forEach(el => cuObs.observe(el));
  }
  observeCountups();
  setTimeout(observeCountups, 1000);
}

/* ════════════════════════════════════════
   ⑦ SCROLL REVEAL — staggered glide-in
═════════════════════════════════════════ */
function initScrollReveal() {
  var css = document.createElement('style');
  css.textContent = `
    .sr-hidden {
      opacity: 0;
      transform: translateY(28px);
      transition: opacity 0.6s cubic-bezier(0.22,1,0.36,1),
                  transform 0.6s cubic-bezier(0.22,1,0.36,1);
    }
    .sr-hidden.sr-visible {
      opacity: 1;
      transform: translateY(0);
    }
    .sr-d1 { transition-delay: 0.07s !important; }
    .sr-d2 { transition-delay: 0.14s !important; }
    .sr-d3 { transition-delay: 0.21s !important; }
    .sr-d4 { transition-delay: 0.28s !important; }
    .sr-d5 { transition-delay: 0.35s !important; }
    @media(prefers-reduced-motion:reduce) {
      .sr-hidden { opacity:1 !important; transform:none !important; }
    }
  `;
  document.head.appendChild(css);

  var SELECTORS = [
    '.ev-card', '.review-card', '.pfp-card', '.pfp-row',
    '.result-card', '.news-card', '.trending-card',
    '.ov-fight', '.section-title', '.results-section-label',
    '.stats-strip', '.ov-sb-section',
  ];

  var observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('sr-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -32px 0px' });

  function applyReveal() {
    SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el.dataset.srDone) return;
        el.dataset.srDone = '1';
        el.classList.add('sr-hidden');
        var d = Math.min(i % 6, 5);
        if (d > 0) el.classList.add('sr-d' + d);
        observer.observe(el);
      });
    });
  }

  applyReveal();
  // Watch for dynamically added content
  var mo = new MutationObserver(() => { clearTimeout(mo._t); mo._t = setTimeout(applyReveal, 80); });
  mo.observe(document.body, { childList: true, subtree: true });
}

/* ════════════════════════════════════════
   ⑧ CURSOR GLOW — follows mouse on desktop
═════════════════════════════════════════ */
function initCursorGlow() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  if (document.getElementById('mb-cursor-glow')) return;

  var glow = document.createElement('div');
  glow.id = 'mb-cursor-glow';
  glow.style.cssText = `
    position:fixed;width:340px;height:340px;border-radius:50%;
    pointer-events:none;z-index:9997;
    background:radial-gradient(circle, rgba(0,229,255,0.055) 0%, transparent 70%);
    transform:translate(-50%,-50%);
    transition:opacity 0.35s ease,width 0.3s ease,height 0.3s ease,background 0.3s ease;
    opacity:0;top:0;left:0;will-change:left,top;
  `;
  document.body.appendChild(glow);

  var mx = 0, my = 0, cx = 0, cy = 0;
  var active = false;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; if (!active) { active=true; glow.style.opacity='1'; } });
  document.addEventListener('mouseleave', () => { glow.style.opacity = '0'; active = false; });

  function loop() {
    cx += (mx - cx) * 0.1;
    cy += (my - cy) * 0.1;
    glow.style.left = cx + 'px';
    glow.style.top  = cy + 'px';
    requestAnimationFrame(loop);
  }
  loop();

  // Intensify on cards/buttons
  document.addEventListener('mouseover', e => {
    if (e.target.closest('a,button,.ev-card,.review-card,.result-card,.pfp-card,.news-card')) {
      glow.style.width = '420px'; glow.style.height = '420px';
      glow.style.background = 'radial-gradient(circle, rgba(0,229,255,0.1) 0%, transparent 65%)';
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('a,button,.ev-card,.review-card,.result-card,.pfp-card,.news-card')) {
      glow.style.width = '340px'; glow.style.height = '340px';
      glow.style.background = 'radial-gradient(circle, rgba(0,229,255,0.055) 0%, transparent 70%)';
    }
  });
}

/* ════════════════════════════════════════
   ⑨ MICRO INTERACTIONS
═════════════════════════════════════════ */
function initMicroInteractions() {
  var css = document.createElement('style');
  css.textContent = `
    /* Nav underline slide */
    .nav-links a { position:relative; }
    .nav-links a::after {
      content:''; position:absolute; bottom:-3px; left:0;
      width:0; height:1.5px; background:#00e5ff;
      transition:width 0.25s cubic-bezier(0.22,1,0.36,1); border-radius:1px;
    }
    .nav-links a:hover::after,
    .nav-links a.active::after { width:100%; }

    /* Logo hover */
    .nav-logo-img {
      height: 52px !important; width:auto; object-fit:contain;
      transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1), filter 0.2s !important;
    }
    .nav-logo-img:hover { transform:scale(1.07) !important; filter:brightness(1.12) !important; }
    @media(max-width:768px) { .nav-logo-img { height:40px !important; } }

    /* Button spring */
    .theme-toggle, button { position:relative; overflow:hidden; }
    .theme-toggle:active, button:active { transform:scale(0.93) !important; }
    .theme-toggle { transition:background 0.2s,border-color 0.2s,transform 0.12s cubic-bezier(0.34,1.56,0.64,1) !important; }

    /* Hero CTA pulse */
    #heroBtn {
      position:relative; overflow:hidden;
      transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s !important;
    }
    #heroBtn:hover {
      transform:translateY(-3px) scale(1.04) !important;
      box-shadow:0 12px 32px rgba(0,229,255,0.35) !important;
    }

    /* Search focus */
    .search-box input:focus {
      box-shadow:0 0 0 1.5px rgba(0,229,255,0.4), 0 4px 20px rgba(0,229,255,0.1) !important;
    }

    /* Fight row hover accent */
    .ov-fight {
      transition:background 0.18s, box-shadow 0.18s !important;
    }
    .ov-fight:hover {
      box-shadow: inset 3px 0 0 rgba(0,229,255,0.45) !important;
    }

    /* Hype thumb springy */
    .ov-hype-thumb {
      transition:left 0.08s ease, background 0.25s, border-color 0.25s,
                 transform 0.18s cubic-bezier(0.34,1.56,0.64,1) !important;
    }

    /* Event card 3D tilt handled by JS */
    .ev-card, .review-card {
      transform-style:preserve-3d; will-change:transform;
      transition:border-color 0.25s, box-shadow 0.3s !important;
    }

    /* Cursor hide on touch */
    @media(pointer:coarse) { #mb-cursor-glow { display:none !important; } }
  `;
  document.head.appendChild(css);

  // 3D card tilt (desktop only)
  if (!window.matchMedia('(pointer:coarse)').matches) {
    document.addEventListener('mousemove', e => {
      var card = e.target.closest('.ev-card, .review-card');
      if (!card) return;
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width  - 0.5;
      var y = (e.clientY - r.top)  / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y*7}deg) rotateY(${x*7}deg) translateY(-4px) scale(1.01)`;
    });
    document.addEventListener('mouseleave', e => {
      var card = e.target.closest('.ev-card, .review-card');
      if (card) card.style.transform = '';
    }, true);
  }

  // Ripple on buttons
  document.addEventListener('click', e => {
    var btn = e.target.closest('.theme-toggle, #heroBtn, .ov-lock-btn');
    if (!btn) return;
    var rpl = document.createElement('span');
    var r = btn.getBoundingClientRect();
    var sz = Math.max(r.width, r.height) * 2.2;
    rpl.style.cssText = `
      position:absolute;border-radius:50%;pointer-events:none;
      width:${sz}px;height:${sz}px;
      left:${e.clientX - r.left - sz/2}px;top:${e.clientY - r.top - sz/2}px;
      background:rgba(0,229,255,0.18);
      transform:scale(0);animation:mb-ripple 0.55s ease-out forwards;
    `;
    btn.style.position = btn.style.position || 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(rpl);
    setTimeout(() => rpl.remove(), 580);
  });

  // Ripple keyframe
  var ks = document.createElement('style');
  ks.textContent = `
    @keyframes mb-ripple { to { transform:scale(1); opacity:0; } }
  `;
  document.head.appendChild(ks);
}

/* ════════════════════════════════════════
   GRADIENT ANIMATED BACKGROUND
═════════════════════════════════════════ */
function initAnimatedBg() {
  var css = document.createElement('style');
  css.textContent = `
    body {
      background: #060608 !important;
      background-image:
        radial-gradient(ellipse 80% 50% at 15% -10%, rgba(0,229,255,0.04) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 85% 110%, rgba(200,168,75,0.03) 0%, transparent 55%)
        !important;
    }
    /* Subtle animated gradient shift */
    @keyframes bgPulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.7; }
    }
  `;
  document.head.appendChild(css);
}

/* ════════════════════════════════════════
   SCROLL PROGRESS BAR
═════════════════════════════════════════ */
function initScrollProgress() {
  var bar = document.createElement('div');
  bar.style.cssText = `
    position:fixed;top:0;left:0;height:2px;width:0%;z-index:99999;
    background:linear-gradient(90deg,#00e5ff,#00b8d4,#00e5ff);
    background-size:200% auto;
    transition:width 0.1s ease;
    pointer-events:none;
    box-shadow:0 0 8px rgba(0,229,255,0.6);
  `;
  document.body.appendChild(bar);

  window.addEventListener('scroll', () => {
    var doc = document.documentElement;
    var pct = (doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
  }, { passive: true });
}

/* ════════════════════════════════════════
   INIT ALL
═════════════════════════════════════════ */
function init() {
  initPageTransitions();
  initParallax();
  initFilmGrain();
  initGlassmorphism();
  initScrollReveal();
  initCursorGlow();
  initMicroInteractions();
  initAnimatedBg();
  initScrollProgress();

  // Countups + kinetic type after fonts load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCountups();
      initKineticType();
    });
  } else {
    initCountups();
    initKineticType();
  }
}

init();

})();
