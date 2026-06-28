/*!
 * MMA Bridge — Onboarding Tour v2.0
 * Multi-page scripted tour with spotlight, animated cursor, page transitions
 */
(function () {
  'use strict';

  const SK_SEEN   = 'mma_tour_seen';
  const SK_ACTIVE = 'mma_tour_active';
  const SK_STEP   = 'mma_tour_step';
  const OFFER_DELAY = 2600;
  const IS_MOBILE   = window.innerWidth < 700;

  /* ── State ───────────────────────────────── */
  let currentStep = 0;
  let running     = false;
  let autoTimer   = null;

  /* ── DOM ─────────────────────────────────── */
  let elTop, elBot, elLeft, elRight, elGlow;
  let elCursor, elBubble, elBubbleText, elDots, elNextBtn, elProgressFill;

  /* ── Page detection ──────────────────────── */
  const PAGE = (() => {
    const p = location.pathname.split('/').pop() || 'index.html';
    if (p === '' || p === 'index.html') return 'index';
    return p.replace('.html', '');
  })();

  /* ── Step definitions ────────────────────── */
  function allSteps() {
    const ev = window._tourNextEvent;
    const evName = ev ? ev.name : 'the next event';
    const evId   = ev ? encodeURIComponent(ev.id) : '';

    const lastEv = window._tourLastEvent;
    const lastName = lastEv ? lastEv.name : 'the last event';

    return [
      // ── INDEX ──────────────────────────────
      {
        page: 'index',
        target: () => document.getElementById('heroSection'),
        cursor: () => document.getElementById('heroBtn'),
        text: `${lastName} just finished. This hero updates automatically — review mode now, then flips to Make Your Picks when ${evName} gets close.`,
        pad: 0, scroll: false, ttl: 6500,
      },
      {
        page: 'index',
        target: () => document.getElementById('resultsTrack') || document.querySelector('.results-section'),
        cursor: () => document.querySelector('#resultsInner a'),
        text: "Every result from last weekend right here — scroll through, tap a card, see the full breakdown.",
        pad: 8, scroll: true, ttl: 5000,
      },
      {
        page: 'index',
        target: () => document.getElementById('lw-btn') || document.querySelector('.ev-help-btn'),
        cursor: () => document.getElementById('lw-btn'),
        text: "Got questions? I'm Lucas. I live in that chat button on every page. Hit me anytime — fighters, picks, rules, I got you.",
        pad: 14, scroll: false, ttl: 5500,
        onShow: () => {
          // pulse the chat button
          const btn = document.getElementById('lw-btn');
          if (btn) { btn.style.transform = 'scale(1.18)'; btn.style.transition = 'transform .3s'; after(600, () => { btn.style.transform = ''; }); }
        },
        nav: 'events.html', navStep: 3,
        nextLabel: 'See Events →',
      },

      // ── EVENTS ─────────────────────────────
      {
        page: 'events',
        target: () => document.getElementById('listAll') || document.querySelector('.ev-list'),
        cursor: () => document.querySelector('.ev-card') || document.querySelector('#listAll > *'),
        text: "Every currently announced UFC event — PPVs, Fight Nights, numbered cards. Updates the second a new one is confirmed.",
        pad: 12, scroll: false, ttl: 5500,
        onShow: () => scrollToTop(),
      },
      {
        page: 'events',
        target: () => document.getElementById('evReviewBtn'),
        cursor: () => document.getElementById('evReviewBtn'),
        text: "Made picks for a past event? Review Your Picks shows exactly how you did — green for right, red for wrong.",
        pad: 12, scroll: false, ttl: 5200,
        clickTarget: true,
        nav: 'pfp.html', navStep: 5,
        nextLabel: 'See Rankings →',
      },

      // ── PFP ────────────────────────────────
      {
        page: 'pfp',
        target: () => document.querySelector('.pfp-hero'),
        cursor: () => document.querySelector('.pfp-hero-name'),
        text: "The pound-for-pound top 15 — best fighters in the world regardless of weight class. Islam Makhachev sitting at number one.",
        pad: 0, scroll: false, ttl: 5800,
        onShow: () => scrollToTop(),
      },
      {
        page: 'pfp',
        target: () => document.querySelector('.pfp-row'),
        cursor: () => document.querySelector('.pfp-row'),
        text: "Click any fighter to see their full profile — last 5 fights, record, stance, country, finishing rate.",
        pad: 8, scroll: false, ttl: 5000,
        clickTarget: true,
      },
      {
        page: 'pfp',
        target: () => document.querySelector('.rnk-tab[data-tab="womens-p4p"]'),
        cursor: () => document.querySelector('.rnk-tab[data-tab="womens-p4p"]'),
        text: "Women's P4P is right here too — same format, best pound-for-pound across all women's divisions.",
        pad: 10, scroll: false, ttl: 4500,
        clickTarget: true,
      },
      {
        page: 'pfp',
        target: () => document.querySelector('.rnk-tab[data-tab="divisional"]'),
        cursor: () => document.querySelector('.rnk-tab[data-tab="divisional"]'),
        text: "Divisional rankings — all 12 weight classes, top 15 contenders each. Cycle through any division.",
        pad: 10, scroll: false, ttl: 5200,
        clickTarget: true,
        onAfter: () => cycleDivisions(),
        nav: 'reviews.html', navStep: 8,
        nextLabel: 'See Reviews →',
      },

      // ── REVIEWS ────────────────────────────
      {
        page: 'reviews',
        target: () => document.querySelector('.rv-search-wrap'),
        cursor: () => document.querySelector('.rv-search-wrap input'),
        text: "Search up any event you loved or hated 😛 — PPVs, Fight Nights, numbered events. Spill your heart out.",
        pad: 14, scroll: false, ttl: 5500,
        onShow: () => scrollToTop(),
      },
      {
        page: 'reviews',
        target: () => document.querySelector('.rv-card.ppv') || document.querySelector('.rv-card'),
        cursor: () => document.querySelector('.rv-card.ppv') || document.querySelector('.rv-card'),
        text: "Rate any card 1 to 10, write what you thought, see what the community rated it. Talk about the fights you wish had gone different.",
        pad: 8, scroll: false, ttl: 6000,
        onAfter: () => showFakeReview(),
        nav: 'leaderboard.html', navStep: 10,
        nextLabel: 'See Leaderboard →',
      },

      // ── LEADERBOARD ────────────────────────
      {
        page: 'leaderboard',
        target: () => document.getElementById('lbRoot') || document.querySelector('.lb-page'),
        cursor: () => document.getElementById('lbRoot'),
        text: "Community leaderboard — everyone ranked by accuracy. Join a group with your crew for a private season-long league.",
        pad: 0, scroll: false, ttl: 5500,
        onShow: () => scrollToTop(),
        nav: 'lucas.html', navStep: 11,
        nextLabel: 'Meet Lucas →',
      },

      // ── LUCAS ──────────────────────────────
      {
        page: 'lucas',
        target: () => document.getElementById('lw-window') || document.querySelector('.lucas-page') || document.body,
        cursor: null,
        text: "This is where I live. Every page has my chat widget, but this is my full house — long form questions, fight breakdowns, predictions, all of it.",
        pad: 0, scroll: false, ttl: 0,
        isFinal: true,
      },
    ];
  }

  /* ── Page steps ───────────────────────────── */
  function stepsForPage() {
    return allSteps()
      .map((s, i) => ({ ...s, idx: i }))
      .filter(s => s.page === PAGE);
  }

  /* ── Offer modal ──────────────────────────── */
  function showOffer() {
    if (document.getElementById('trOffer')) return;
    const wrap = make('div', { id: 'trOffer' });
    wrap.innerHTML = `
      <div id="trOfferCard">
        <div id="trOfferHead">
          <div id="trOfferAv">L</div>
          <div>
            <div id="trOfferName">Lucas</div>
            <div id="trOfferSub">MMA Bridge AI</div>
          </div>
        </div>
        <p id="trOfferMsg">First time here? Let me show you around — takes about a minute.</p>
        <div id="trOfferBtns">
          <button id="trNo">No thanks</button>
          <button id="trYes">Show me around →</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    raf(() => wrap.classList.add('tr-in'));
    document.getElementById('trYes').onclick = () => { killOffer(); startTour(); };
    document.getElementById('trNo').onclick  = () => { killOffer(); ls(SK_SEEN, '1'); };
  }

  function killOffer() {
    const el = document.getElementById('trOffer');
    if (!el) return;
    el.classList.remove('tr-in');
    el.classList.add('tr-out');
    after(360, () => el.remove());
  }

  /* ── Build tour DOM ───────────────────────── */
  function buildDOM() {
    const panelCSS = {
      position:'fixed', zIndex:'9980', pointerEvents:'none',
      background:'rgba(0,0,0,0.86)', backdropFilter:'blur(3px)',
      transition:'top .48s cubic-bezier(.4,0,.2,1), left .48s cubic-bezier(.4,0,.2,1), width .48s cubic-bezier(.4,0,.2,1), height .48s cubic-bezier(.4,0,.2,1)',
    };
    elTop   = make('div'); css(elTop,   { ...panelCSS, top:'0', left:'0', right:'0', height:'0' });
    elBot   = make('div'); css(elBot,   { ...panelCSS, bottom:'0', left:'0', right:'0', height:'0' });
    elLeft  = make('div'); css(elLeft,  { ...panelCSS, top:'0', left:'0', width:'0', height:'100vh' });
    elRight = make('div'); css(elRight, { ...panelCSS, top:'0', right:'0', width:'0', height:'100vh' });

    elGlow = make('div');
    css(elGlow, {
      position:'fixed', zIndex:'9981', pointerEvents:'none',
      border:'1.5px solid rgba(240,180,41,.55)', borderRadius:'10px',
      boxShadow:'0 0 0 1px rgba(240,180,41,.1), 0 0 44px rgba(240,180,41,.2)',
      transition:'all .48s cubic-bezier(.4,0,.2,1)', opacity:'0',
      animation:'trGlowPulse 2.2s ease-in-out infinite',
    });

    // Progress bar
    const progWrap = make('div');
    css(progWrap, { position:'fixed', top:'0', left:'0', right:'0', height:'3px', zIndex:'9995', background:'rgba(255,255,255,.06)', pointerEvents:'none' });
    elProgressFill = make('div');
    css(elProgressFill, { height:'100%', width:'0%', background:'linear-gradient(90deg,#c98a00,#f0b429,#ffd960)', transition:'width .55s cubic-bezier(.4,0,.2,1)' });
    progWrap.appendChild(elProgressFill);

    // Skip
    const skip = make('button', { id:'trSkip' });
    skip.textContent = 'Skip tour';
    skip.onclick = endTour;

    // Cursor
    elCursor = make('div', { id:'trCursor' });
    elCursor.innerHTML = `<svg viewBox="0 0 24 28" width="22" height="26" fill="none">
      <path d="M4 3L20 12.5L12.5 14.8L8.5 23L4 3Z" fill="white" stroke="rgba(0,0,0,0.35)" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
    if (IS_MOBILE) elCursor.style.display = 'none';

    // Bubble
    elBubble = make('div', { id:'trBubble' });
    elBubble.innerHTML = `
      <div id="trBubbleHead">
        <div id="trBubbleAv">L</div>
        <span id="trBubbleLabel">Lucas</span>
        <div id="trDots"></div>
        <button id="trX" title="Close">✕</button>
      </div>
      <div id="trBubbleText"></div>
      <div id="trBubbleFoot">
        <button id="trNext">Next →</button>
      </div>`;

    document.body.append(elTop, elBot, elLeft, elRight, elGlow, progWrap, skip, elCursor, elBubble);

    elBubbleText = document.getElementById('trBubbleText');
    elDots       = document.getElementById('trDots');
    elNextBtn    = document.getElementById('trNext');
    elNextBtn.onclick = advance;
    document.getElementById('trX').onclick = endTour;
  }

  /* ── Spotlight ────────────────────────────── */
  function spotlight(rect, pad) {
    const p  = pad ?? 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const t  = Math.max(0, rect.top    - p);
    const b  = Math.max(0, vh - rect.bottom - p);
    const l  = Math.max(0, rect.left   - p);
    const r  = Math.max(0, vw - rect.right  - p);
    const mh = vh - t - b;

    elTop.style.height   = t + 'px';
    elBot.style.height   = b + 'px';
    elLeft.style.top     = t + 'px'; elLeft.style.height = mh + 'px'; elLeft.style.width = l + 'px';
    elRight.style.top    = t + 'px'; elRight.style.height = mh + 'px'; elRight.style.width = r + 'px';
    css(elGlow, { top:(rect.top-p)+'px', left:(rect.left-p)+'px', width:(rect.width+p*2)+'px', height:(rect.height+p*2)+'px', opacity:'1' });
  }

  function clearSpot() {
    elTop.style.height = elBot.style.height = '0';
    elLeft.style.width = elRight.style.width = '0';
    elGlow.style.opacity = '0';
  }

  /* ── Cursor ───────────────────────────────── */
  function moveCursor(el) {
    if (IS_MOBILE || !el) { elCursor.style.opacity = '0'; return; }
    const r = el.getBoundingClientRect();
    css(elCursor, { left:(r.left + r.width*.22)+'px', top:(r.top + r.height*.22)+'px', opacity:'1' });
  }

  function clickCursor() {
    elCursor.classList.add('tr-clicking');
    after(170, () => elCursor.classList.remove('tr-clicking'));
  }

  /* ── Dots ─────────────────────────────────── */
  function renderDots(total, cur) {
    elDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = make('div');
      css(d, { width:'5px', height:'5px', borderRadius:'50%', flexShrink:'0',
        background: i === cur ? '#f0b429' : 'rgba(255,255,255,.2)', transition:'background .3s' });
      elDots.appendChild(d);
    }
  }

  /* ── Typewriter ───────────────────────────── */
  function typeIn(el, text, sound, done) {
    el.textContent = '';
    let i = 0;
    function tick() {
      if (!running) return;
      el.textContent += text[i++];
      if (sound && i % 3 === 0) playTick();
      if (i < text.length) after(18, tick);
      else if (done) after(100, done);
    }
    tick();
  }

  /* ── Typing sound ─────────────────────────── */
  function playTick() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ctx.createBuffer(1, 256, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < 256; i++) d[i] = (Math.random()*2-1) * 0.07;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      src.connect(gain); gain.connect(ctx.destination);
      src.start();
    } catch {}
  }

  /* ── Division cycling ─────────────────────── */
  function cycleDivisions() {
    const pills = [...document.querySelectorAll('.div-pill:not(.div-pill-sep)')];
    if (!pills.length) return;
    let i = 0;
    function next() {
      if (!running || i >= Math.min(3, pills.length)) return;
      pills[i].click();
      moveCursor(pills[i]);
      spotlight(pills[i].getBoundingClientRect(), 10);
      i++;
      after(900, next);
    }
    next();
  }

  /* ── Fake review overlay ──────────────────── */
  function showFakeReview() {
    const existing = document.getElementById('trFakeReview');
    if (existing) existing.remove();

    const panel = make('div', { id:'trFakeReview' });
    panel.innerHTML = `
      <div id="trFakeRevHead">UFC Freedom 250: Topuria vs Gaethje</div>
      <div id="trFakeStars">★★★★★<span style="opacity:.3">★★★★★</span></div>
      <div id="trFakeRevText" style="min-height:52px;font-family:Inter,sans-serif;font-size:.82rem;line-height:1.6;color:rgba(255,255,255,.75);"></div>
      <div id="trFakeRevComm" style="margin-top:12px;font-family:Inter,sans-serif;font-size:.72rem;color:rgba(255,255,255,.35);">47 community reviews · avg 4.3 ★</div>`;
    document.body.appendChild(panel);

    const fakeReviewText = "One of the best UFC events I've watched in years. Gaethje walked through everything Topuria threw at him. The atmosphere was electric from prelims to the main event. Fiziev vs Torres fight of the night no question.";
    const textEl = document.getElementById('trFakeRevText');
    typeIn(textEl, fakeReviewText, true, null);

    after(6000, () => {
      panel.style.transition = 'opacity .4s';
      panel.style.opacity = '0';
      after(400, () => panel.remove());
    });
  }

  /* ── Navigate to next page ────────────────── */
  function navigateTo(url, nextStep) {
    ss(SK_ACTIVE, '1');
    ss(SK_STEP, String(nextStep));
    clearSpot();
    if (elCursor) elCursor.style.opacity = '0';

    // Cinematic fade out
    const curtain = make('div', { id:'trCurtain' });
    css(curtain, { position:'fixed', inset:'0', zIndex:'9999', background:'#000', opacity:'0', transition:'opacity .45s ease', pointerEvents:'all' });
    document.body.appendChild(curtain);
    raf(() => { curtain.style.opacity = '1'; });
    after(480, () => { window.location.href = url; });
  }

  /* ── Run steps for current page ───────────── */
  function runPageTour() {
    const steps = stepsForPage();
    const globalStep = parseInt(ss(SK_STEP) || '0', 10);

    // Find which local step to start from
    let localIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].idx <= globalStep) localIdx = i;
    }
    // If we just arrived on this page, start from the first step of this page
    if (!ss(SK_ACTIVE)) localIdx = 0;

    currentStep = localIdx;
    buildDOM();
    after(IS_MOBILE ? 200 : 300, () => runLocalStep(currentStep, steps));
  }

  function runLocalStep(localIdx, steps) {
    if (!running || localIdx >= steps.length) return;
    const s = steps[localIdx];
    const total = steps.length;

    clearTimeout(autoTimer);

    // Progress across ALL steps
    const allS = allSteps();
    const pct  = (s.idx / Math.max(1, allS.length - 1)) * 100;
    elProgressFill.style.width = pct + '%';

    // Dots for current page
    renderDots(total, localIdx);

    // Button label
    const isLastOfPage = localIdx === total - 1;
    if (isLastOfPage && s.nav) {
      elNextBtn.textContent = s.nextLabel || 'Next →';
    } else if (s.isFinal) {
      elNextBtn.style.display = 'none';
    } else {
      elNextBtn.textContent = localIdx === total - 1 ? 'Got it →' : 'Next →';
    }

    if (s.isFinal) { runFinalStep(s); return; }

    // Scroll
    if (s.scroll) {
      const tEl = s.target?.();
      if (tEl) { tEl.scrollIntoView({ behavior:'smooth', block:'center' }); }
      after(700, () => doStep(s, localIdx, steps));
    } else {
      if (s.scroll === false && localIdx === 0) scrollToTop();
      // Give JS-rendered pages more time on first step after navigation
      const initDelay = (localIdx === 0 && ss(SK_ACTIVE)) ? 1200 : 300;
      after(localIdx === 0 ? initDelay : 300, () => doStep(s, localIdx, steps));
    }
  }

  function doStep(s, localIdx, steps, attempt) {
    if (!running) return;
    attempt = attempt || 0;
    const targetEl = s.target?.();
    if (!targetEl) {
      if (attempt < 18) { after(280, () => doStep(s, localIdx, steps, attempt + 1)); return; }
      advanceLocal(localIdx, steps); return;
    }

    // Spotlight
    spotlight(targetEl.getBoundingClientRect(), s.pad);

    // Cursor
    const curEl = s.cursor?.() || targetEl;
    moveCursor(curEl);

    // Click target
    if (s.clickTarget && curEl) {
      after(400, () => { if (!running) return; clickCursor(); curEl.click(); });
    }

    // onShow callback
    if (s.onShow) s.onShow();

    // Slide bubble in
    elBubble.classList.add('tr-bubble-in');
    elBubbleText.textContent = '';

    after(260, () => {
      if (!running) return;
      typeIn(elBubbleText, s.text, false, () => {
        if (!running) return;
        if (s.onAfter) after(300, s.onAfter);
        if (s.ttl > 0) {
          autoTimer = after(s.ttl, () => advanceLocal(localIdx, steps));
        }
      });
    });

    // Wire Next button for this step
    elNextBtn.onclick = () => { clearTimeout(autoTimer); advanceLocal(localIdx, steps); };
  }

  function advanceLocal(localIdx, steps) {
    clearTimeout(autoTimer);
    const s = steps[localIdx];
    const next = localIdx + 1;

    // If this step navigates to another page
    if (next >= steps.length && s.nav) {
      navigateTo(s.nav, s.navStep);
      return;
    }
    if (next >= steps.length) { endTour(); return; }

    currentStep = next;
    runLocalStep(next, steps);
  }

  /* ── Final step ───────────────────────────── */
  function runFinalStep(s) {
    clearSpot();
    if (elCursor) elCursor.style.opacity = '0';
    elProgressFill.style.width = '100%';
    elBubble.classList.add('tr-bubble-in');

    elBubble.innerHTML = `
      <div id="trBubbleHead">
        <div id="trBubbleAv">L</div>
        <span id="trBubbleLabel">Lucas</span>
        <button id="trX" title="Close">✕</button>
      </div>
      <div id="trBubbleText" style="margin-bottom:18px;">${s.text}</div>
      <div id="trFinalBtns">
        <a href="auth.html" id="trCreateBtn">Create Account →</a>
        <button id="trExploreBtn" onclick="window._tourEnd()">Keep Exploring</button>
      </div>`;
    document.getElementById('trX').onclick = endTour;
  }

  /* ── End tour ─────────────────────────────── */
  function endTour() {
    running = false;
    clearTimeout(autoTimer);
    ls(SK_SEEN, '1');
    sessionStorage.removeItem(SK_ACTIVE);
    sessionStorage.removeItem(SK_STEP);

    const targets = [elTop, elBot, elLeft, elRight, elGlow, elCursor, elBubble,
      elProgressFill?.parentElement, document.getElementById('trSkip'),
      document.getElementById('trFakeReview')];
    targets.forEach(el => {
      if (!el) return;
      el.style.transition = 'opacity .35s ease';
      el.style.opacity = '0';
    });
    after(380, () => targets.forEach(el => el?.remove()));
  }

  window._tourEnd = endTour;

  /* ── Start tour ───────────────────────────── */
  function startTour() {
    if (running) return;
    running = true;
    ss(SK_ACTIVE, '1');
    ss(SK_STEP, '0');
    ls(SK_SEEN, '1');
    runPageTour();
  }

  /* ── Helpers ──────────────────────────────── */
  function make(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }
  function css(el, props) { Object.assign(el.style, props); }
  function after(ms, fn) { return setTimeout(fn, ms); }
  function raf(fn) { requestAnimationFrame(fn); }
  function ls(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function ss(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k);
      sessionStorage.setItem(k, v);
    } catch {}
  }
  function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* ── Fade-in on page arrival ──────────────── */
  function fadeIn() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';
    raf(() => {
      document.body.style.transition = 'opacity .45s ease';
      document.body.style.opacity = '1';
    });
  }

  /* ── CSS ──────────────────────────────────── */
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      @keyframes trGlowPulse {
        0%,100% { box-shadow: 0 0 0 1px rgba(240,180,41,.1), 0 0 32px rgba(240,180,41,.14); }
        50%      { box-shadow: 0 0 0 1px rgba(240,180,41,.3), 0 0 56px rgba(240,180,41,.28); }
      }

      /* ── Offer ── */
      #trOffer {
        position:fixed; bottom:32px; left:50%;
        transform:translateX(-50%) translateY(140%);
        width:min(420px,calc(100vw - 40px)); z-index:9985;
        transition:transform .52s cubic-bezier(.34,1.2,.64,1);
      }
      #trOffer.tr-in  { transform:translateX(-50%) translateY(0); }
      #trOffer.tr-out { transform:translateX(-50%) translateY(140%); transition-duration:.34s; transition-timing-function:cubic-bezier(.4,0,.2,1); }
      #trOfferCard {
        background:linear-gradient(135deg,rgba(10,12,20,.97),rgba(20,22,34,.95));
        border:1px solid rgba(240,180,41,.22); border-radius:18px; padding:24px 26px;
        box-shadow:0 24px 64px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.04);
        backdrop-filter:blur(24px);
      }
      #trOfferHead { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
      #trOfferAv {
        width:38px; height:38px; border-radius:50%;
        background:linear-gradient(135deg,#f0b429,#c98a00);
        display:flex; align-items:center; justify-content:center;
        font-family:'Montserrat',sans-serif; font-weight:900; font-size:.9rem; color:#000; flex-shrink:0;
      }
      #trOfferName { font-family:'Montserrat',sans-serif; font-weight:700; font-size:.88rem; color:#fff; }
      #trOfferSub  { font-family:'Inter',sans-serif; font-size:.68rem; color:rgba(255,255,255,.35); margin-top:2px; }
      #trOfferMsg  { font-family:'Inter',sans-serif; font-size:.9rem; line-height:1.65; color:rgba(255,255,255,.82); margin:0 0 20px; }
      #trOfferBtns { display:flex; gap:10px; justify-content:flex-end; }
      #trNo {
        background:none; border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.45);
        font-family:'Montserrat',sans-serif; font-weight:700; font-size:.7rem; letter-spacing:.06em;
        text-transform:uppercase; padding:9px 18px; border-radius:6px; cursor:pointer; transition:all .2s;
      }
      #trNo:hover { color:rgba(255,255,255,.75); border-color:rgba(255,255,255,.28); }
      #trYes {
        background:linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00); color:#fff;
        font-family:'Montserrat',sans-serif; font-weight:800; font-size:.7rem; letter-spacing:.1em;
        text-transform:uppercase; padding:9px 22px; border-radius:6px; border:none; cursor:pointer;
        box-shadow:0 4px 18px rgba(255,120,0,.32); transition:transform .2s,box-shadow .2s;
      }
      #trYes:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(255,120,0,.46); }

      /* ── Cursor ── */
      #trCursor {
        position:fixed; z-index:9990; pointer-events:none; opacity:0;
        width:22px; height:26px;
        filter:drop-shadow(0 2px 10px rgba(0,0,0,.55));
        transition:left .72s cubic-bezier(.34,1.3,.64,1), top .72s cubic-bezier(.34,1.3,.64,1), opacity .3s ease;
        animation:trBob 2s ease-in-out infinite;
      }
      #trCursor.tr-clicking { transform:scale(.7); animation:none; transition:transform .1s; }
      @keyframes trBob { 0%,100%{margin-top:0} 50%{margin-top:-5px} }

      /* ── Skip ── */
      #trSkip {
        position:fixed; top:18px; right:22px; z-index:9995;
        background:none; border:none; color:rgba(255,255,255,.28);
        font-family:'Inter',sans-serif; font-size:.72rem; letter-spacing:.05em;
        cursor:pointer; padding:6px 10px; border-radius:4px; transition:color .2s;
      }
      #trSkip:hover { color:rgba(255,255,255,.7); }

      /* ── Bubble ── */
      #trBubble {
        position:fixed; bottom:28px; left:28px; z-index:9990;
        max-width:400px;
        background:linear-gradient(135deg,rgba(10,12,20,.97),rgba(18,20,30,.95));
        border:1px solid rgba(240,180,41,.18); border-radius:16px; padding:20px 22px;
        box-shadow:0 16px 52px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);
        backdrop-filter:blur(20px);
        transform:translateY(130%); transition:transform .48s cubic-bezier(.34,1.2,.64,1);
        pointer-events:all;
      }
      #trBubble.tr-bubble-in { transform:translateY(0); }
      #trBubbleHead { display:flex; align-items:center; gap:10px; margin-bottom:13px; }
      #trBubbleAv {
        width:26px; height:26px; border-radius:50%;
        background:linear-gradient(135deg,#f0b429,#c98a00);
        display:flex; align-items:center; justify-content:center;
        font-family:'Montserrat',sans-serif; font-weight:900; font-size:.7rem; color:#000; flex-shrink:0;
      }
      #trBubbleLabel { font-family:'Montserrat',sans-serif; font-weight:700; font-size:.68rem; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.4); }
      #trDots { display:flex; gap:5px; margin-left:auto; align-items:center; }
      #trX { background:none; border:none; color:rgba(255,255,255,.28); font-size:.9rem; cursor:pointer; padding:2px 4px; margin-left:6px; border-radius:4px; transition:color .15s; }
      #trX:hover { color:rgba(255,255,255,.8); }
      #trBubbleText { font-family:'Inter',sans-serif; font-size:.875rem; line-height:1.65; color:rgba(255,255,255,.88); min-height:42px; }
      #trBubbleFoot { display:flex; justify-content:flex-end; margin-top:16px; }
      #trNext {
        background:linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00); color:#fff;
        font-family:'Montserrat',sans-serif; font-weight:800; font-size:.68rem; letter-spacing:.1em;
        text-transform:uppercase; padding:9px 22px; border-radius:6px; border:none; cursor:pointer;
        box-shadow:0 4px 14px rgba(255,120,0,.28); transition:transform .18s cubic-bezier(.34,1.4,.64,1),box-shadow .18s;
      }
      #trNext:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 6px 20px rgba(255,120,0,.42); }
      #trFinalBtns { display:flex; gap:10px; flex-wrap:wrap; }
      #trCreateBtn {
        flex:1; text-align:center; min-width:130px;
        background:linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00); color:#fff;
        font-family:'Montserrat',sans-serif; font-weight:800; font-size:.7rem; letter-spacing:.1em;
        text-transform:uppercase; padding:11px 18px; border-radius:6px; text-decoration:none; display:block;
        box-shadow:0 4px 16px rgba(255,120,0,.3); transition:transform .18s,box-shadow .18s;
      }
      #trCreateBtn:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(255,120,0,.44); }
      #trExploreBtn {
        flex:1; min-width:130px;
        background:rgba(255,255,255,.06); color:rgba(255,255,255,.6);
        font-family:'Montserrat',sans-serif; font-weight:700; font-size:.7rem; letter-spacing:.1em;
        text-transform:uppercase; padding:11px 18px; border-radius:6px;
        border:1px solid rgba(255,255,255,.1); cursor:pointer; transition:background .2s,color .2s;
      }
      #trExploreBtn:hover { background:rgba(255,255,255,.1); color:#fff; }

      /* ── Fake review panel ── */
      #trFakeReview {
        position:fixed; bottom:28px; right:28px; z-index:9991;
        width:min(340px,calc(100vw - 56px));
        background:linear-gradient(135deg,rgba(10,12,20,.97),rgba(18,20,30,.95));
        border:1px solid rgba(240,180,41,.2); border-radius:14px; padding:18px 20px;
        box-shadow:0 16px 44px rgba(0,0,0,.55); backdrop-filter:blur(20px);
        animation:trFakeRevIn .4s cubic-bezier(.34,1.2,.64,1) both;
      }
      @keyframes trFakeRevIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
      #trFakeRevHead { font-family:'Montserrat',sans-serif; font-weight:700; font-size:.78rem; color:rgba(255,255,255,.6); margin-bottom:10px; }
      #trFakeStars { font-size:1.3rem; color:#f0b429; margin-bottom:10px; letter-spacing:2px; }

      /* ── Mobile ── */
      @media (max-width:680px) {
        #trOffer { bottom:88px; }
        #trBubble { left:12px !important; right:12px !important; max-width:none !important; bottom:86px !important; }
        #trFakeReview { display:none; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Init ─────────────────────────────────── */
  async function init() {
    // Continuing a cross-page tour
    if (ss(SK_ACTIVE)) {
      fadeIn();
      // Pre-fetch event data
      await prefetchEvents();
      running = true;
      runPageTour();
      return;
    }

    // Fresh visit — only show offer on index
    if (PAGE !== 'index') return;
    if (localStorage.getItem(SK_SEEN)) return;

    await prefetchEvents();

    after(OFFER_DELAY, async () => {
      if (localStorage.getItem(SK_SEEN)) return;
      try {
        const sb = window._sb;
        if (sb) {
          const { data: { user } } = await sb.auth.getUser();
          if (user) return;
        }
      } catch {}
      showOffer();
    });
  }

  async function prefetchEvents() {
    try {
      const all = await fetch('/events.json?_=' + Date.now(), { cache:'no-store' }).then(r => r.json());
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      window._tourNextEvent = all
        .filter(e => e.isoDate >= todayStr && e.status !== 'completed')
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] || null;
      window._tourLastEvent = all
        .filter(e => e.status === 'completed')
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0] || null;
    } catch {}
  }

  // Boot
  injectCSS();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.startTour      = startTour;
  window.startTourOffer = showOffer;

})();
