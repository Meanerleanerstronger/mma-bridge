/*!
 * MMA Bridge — Onboarding Tour v3.0
 * Fully automatic cinematic tour. No Next button — plays like a video.
 */
(function () {
  'use strict';

  const SK_SEEN   = 'mma_tour_seen';
  const SK_ACTIVE = 'mma_tour_active';
  const SK_STEP   = 'mma_tour_step';

  /* ─── State ───────────────────────────── */
  let running    = false;
  let stepTimer  = null;
  let localIdx   = 0;
  let typeToken  = 0; // increments each typeIn call to cancel previous

  /* ─── DOM refs ────────────────────────── */
  let elTop, elBot, elLeft, elRight, elGlow, elCursor, elBubble, elBubbleText, elEndBtn, elBar;

  /* ─── Page ────────────────────────────── */
  const PAGE = (function () {
    const p = location.pathname.split('/').pop();
    if (!p || p === 'index.html') return 'index';
    return p.replace('.html', '');
  })();

  const IS_MOB = window.innerWidth < 680;

  /* ─── Steps ───────────────────────────── */
  function allSteps() {
    const nev  = window._tourNextEvent;
    const lev  = window._tourLastEvent;
    const nId  = nev ? encodeURIComponent(nev.id) : '';
    const nName = nev ? nev.name : 'the next event';
    const lName = lev ? lev.name : 'the last event';

    return [
      /* 0 — index: hero */
      {
        page: 'index',
        sel: '#heroSection',
        cursorSel: '#heroBtn',
        text: `${lName} just wrapped. This hero updates automatically — shows results now, flips to picks mode when ${nName} gets close.`,
        dur: 4000, scroll: false,
      },
      /* 1 — index: results */
      {
        page: 'index',
        sel: '#resultsTrack',
        cursorSel: '#resultsInner',
        text: 'Recent results scroll right here. Every finish, every decision — tap a card for the full breakdown.',
        dur: 3500, scroll: true,
        nav: 'events.html', navStep: 2,
      },
      /* 2 — events: card list — NO click, cursor just hovers */
      {
        page: 'events',
        sel: '.ev-list',
        cursorSel: '.ev-card',
        text: 'Every announced UFC event — PPVs, Fight Nights, numbered cards. Tap any card to see the full fight card and make your picks.',
        dur: 4500, scroll: false,
        onEnter: scrollTop,
        nav: nId ? `picks.html?event=${nId}` : 'pfp.html',
        navStep: nId ? 3 : 5,
      },
      /* 3 — picks: spotlight fight list */
      {
        page: 'picks',
        sel: '.sb-side[data-pick]',
        cursorSel: '.sb-side[data-pick]',
        text: `${nName} — pick a winner for every fight before the card locks. Picks are auto-locked at event start.`,
        dur: 3800, scroll: false,
        onEnter: scrollTop,
      },
      /* 4 — picks: cursor clicks 3 real picks */
      {
        page: 'picks',
        sel: '.sb-side[data-pick]',
        cursorSel: '.sb-side[data-pick]',
        text: 'Tap a fighter to lock your pick. Green when right, red when wrong. Track your accuracy on the leaderboard.',
        dur: 4200, scroll: false,
        onEnter: () => {
          const sides = [...document.querySelectorAll('.sb-side[data-pick]')];
          if (sides[0]) after(300,  () => { animateClick(); clickEl(sides[0]); moveCursor(sides[0]); });
          if (sides[3]) after(900,  () => { animateClick(); clickEl(sides[3]); moveCursor(sides[3]); });
          if (sides[5]) after(1600, () => { animateClick(); clickEl(sides[5]); moveCursor(sides[5]); });
        },
        nav: 'pfp.html', navStep: 5,
      },
      /* 6 — pfp: hero */
      {
        page: 'pfp',
        sel: '.pfp-hero',
        cursorSel: '.pfp-hero-name',
        text: 'Pound-for-pound top 15 — best fighters in the world regardless of weight class. Updated after every title fight.',
        dur: 3500, scroll: false,
        onEnter: scrollTop,
      },
      /* 7 — pfp: click a fighter row */
      {
        page: 'pfp',
        sel: '.pfp-grid, .pfp-list',
        cursorSel: '.pfp-row',
        text: 'Click any fighter for their full profile — last 5 fights, record, country, stance, finishing rate.',
        dur: 3500, scroll: false,
        click: true,
        onEnter: () => after(500, () => { const r = q('.pfp-row'); if (r) r.click(); }),
      },
      /* 8 — pfp: divisional tab */
      {
        page: 'pfp',
        sel: '.rnk-tabs',
        cursorSel: '.rnk-tab[data-tab="divisional"]',
        text: 'Divisional rankings across all 12 weight classes. Top 15 contenders, updated after every card.',
        dur: 3500, scroll: false,
        click: true,
        onEnter: () => after(300, () => { const t = q('.rnk-tab[data-tab="divisional"]'); if (t) t.click(); }),
        nav: 'reviews.html', navStep: 8,
      },
      /* 8 — reviews: card grid */
      {
        page: 'reviews',
        sel: '.rv-grid, .rv-cards, [class*="rv-"]',
        cursorSel: '.rv-card.ppv, .rv-card',
        text: 'Rate any UFC event 1 to 10. Write exactly what you thought. See what the whole community rated it.',
        dur: 4000, scroll: false,
        onEnter: scrollTop,
      },
      /* 10 — reviews: fake review */
      {
        page: 'reviews',
        sel: '.rv-card.ppv, .rv-card',
        cursorSel: '.rv-card.ppv, .rv-card',
        text: 'Spill your heart out. Fights you loved, results you wish had gone different — it all lives here.',
        dur: 5500, scroll: false,
        click: false,
        onEnter: showFakeReview,
        nav: 'leaderboard.html', navStep: 10,
      },
      /* 10 — leaderboard */
      {
        page: 'leaderboard',
        sel: '#lbRoot, .lb-page',
        cursorSel: '#lbRoot',
        text: 'Community leaderboard — everyone ranked by pick accuracy. Join a group with your friends for a private season league.',
        dur: 4000, scroll: false,
        onEnter: scrollTop,
        nav: 'lucas.html', navStep: 11,
      },
      /* 12 — lucas: final */
      {
        page: 'lucas',
        sel: null,
        cursorSel: null,
        text: "That's the whole site. Make an account, it's free — your picks, your rank, your group. I'll be right here if you need anything.",
        dur: 0, scroll: false,
        onEnter: scrollTop,
        final: true,
      },
    ];
  }

  /* ─── Page steps ──────────────────────── */
  function pageSteps() {
    return allSteps()
      .map((s, i) => ({ ...s, gIdx: i }))
      .filter(s => s.page === PAGE);
  }

  /* ─── Helpers ─────────────────────────── */
  function q(sel) {
    if (!sel) return null;
    const parts = sel.split(',').map(s => s.trim());
    for (const p of parts) {
      try { const el = document.querySelector(p); if (el) return el; } catch {}
    }
    return null;
  }
  function make(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }
  function css(el, props) { if (el) Object.assign(el.style, props); }
  function after(ms, fn) { return setTimeout(fn, ms); }
  function raf(fn) { requestAnimationFrame(fn); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function clickEl(el) { if (el) { el.click(); } }

  /* ─── Typing sound ────────────────────── */
  let _actx;
  function getACtx() {
    if (!_actx) try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    return _actx;
  }
  function playTick() {
    try {
      const ctx = getACtx(); if (!ctx) return;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + Math.random() * 400, ctx.currentTime);
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }

  /* ─── Spotlight ───────────────────────── */
  function spotlight(el, pad) {
    if (!el) { clearSpot(); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    after(320, () => {
      if (!running) return;
      const r  = el.getBoundingClientRect();
      const p  = pad ?? 14;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const t  = Math.max(0, r.top - p);
      const b  = Math.max(0, vh - r.bottom - p);
      const l  = Math.max(0, r.left - p);
      const ri = Math.max(0, vw - r.right - p);
      const mh = vh - t - b;
      elTop.style.height   = t + 'px';
      elBot.style.height   = b + 'px';
      elLeft.style.cssText  += `;top:${t}px;height:${mh}px;width:${l}px`;
      elRight.style.cssText += `;top:${t}px;height:${mh}px;width:${ri}px`;
      css(elGlow, { top:(r.top-p)+'px', left:(r.left-p)+'px', width:(r.width+p*2)+'px', height:(r.height+p*2)+'px', opacity:'1' });
    });
  }

  function clearSpot() {
    elTop.style.height = elBot.style.height = '0';
    elLeft.style.width = elRight.style.width = '0';
    elGlow.style.opacity = '0';
  }

  /* ─── Cursor ──────────────────────────── */
  function moveCursor(el) {
    if (IS_MOB || !el || !elCursor) return;
    const r = el.getBoundingClientRect();
    css(elCursor, { left:(r.left + r.width * .22)+'px', top:(r.top + r.height * .22)+'px', opacity:'1' });
  }

  function animateClick() {
    if (!elCursor) return;
    elCursor.classList.add('tr-clicking');
    after(160, () => elCursor.classList.remove('tr-clicking'));
  }

  /* ─── Typewriter ──────────────────────── */
  function typeIn(el, text, useSound, done) {
    el.textContent = '';
    const myToken = ++typeToken;
    let i = 0;
    function tick() {
      if (!running || typeToken !== myToken) return; // cancelled by new step
      el.textContent += text[i++];
      if (useSound && i % 2 === 0) playTick();
      if (i < text.length) after(11, tick);
      else if (done) done();
    }
    tick();
  }

  /* ─── Fake review panel ───────────────── */
  function showFakeReview() {
    const old = document.getElementById('trFakeRev');
    if (old) old.remove();
    const panel = make('div', { id: 'trFakeRev' });
    panel.innerHTML = `
      <div class="trfr-title">UFC Freedom 250 — Topuria vs Gaethje</div>
      <div class="trfr-stars">★★★★★<span>★★★★★</span></div>
      <div class="trfr-text" id="trFrText"></div>
      <div class="trfr-meta">47 reviews · community avg 4.3 ★</div>`;
    document.body.appendChild(panel);
    raf(() => panel.classList.add('trfr-in'));
    const fake = "Watched every second. Gaethje walked through everything Topuria threw at him — the crowd was unreal. Fiziev vs Torres was fight of the night easy. One of the best PPVs in years.";
    typeIn(document.getElementById('trFrText'), fake, true, null);
    after(5200, () => { panel.style.opacity = '0'; after(400, () => panel.remove()); });
  }

  /* ─── Offer modal ─────────────────────── */
  function showOffer() {
    if (document.getElementById('trOffer') || running) return;
    const wrap = make('div', { id: 'trOffer' });
    wrap.innerHTML = `
      <div id="trOfferAv">L</div>
      <p id="trOfferMsg">Hey, I'm Lucas. Want me to show you around?</p>
      <div id="trOfferBtns">
        <button id="trNo">No, I'm good</button>
        <button id="trYes">Yes, show me →</button>
      </div>`;
    document.body.appendChild(wrap);
    raf(() => wrap.classList.add('tr-offer-in'));
    document.getElementById('trYes').onclick = () => { killOffer(); startTour(); };
    document.getElementById('trNo').onclick  = () => { killOffer(); lsSet(SK_SEEN, '1'); };
  }

  function killOffer() {
    const el = document.getElementById('trOffer');
    if (!el) return;
    el.classList.remove('tr-offer-in');
    after(360, () => el.remove());
  }

  /* ─── Navigate ────────────────────────── */
  function navigate(url, gIdx) {
    ssSet(SK_ACTIVE, '1');
    ssSet(SK_STEP, String(gIdx));
    clearSpot();
    if (elCursor) elCursor.style.opacity = '0';
    const curtain = make('div', { id: 'trCurtain' });
    css(curtain, { position:'fixed', inset:'0', zIndex:'9999', background:'#000', opacity:'0', pointerEvents:'all', transition:'opacity .4s ease' });
    document.body.appendChild(curtain);
    raf(() => { curtain.style.opacity = '1'; });
    after(440, () => { window.location.href = url; });
  }

  /* ─── Build tour DOM ──────────────────── */
  function buildDOM() {
    if (document.getElementById('trEndBtn')) return; // already built

    // Full-page click blocker — sits above page, below tour UI
    // Prevents user from interacting with anything except End Tour
    const blocker = make('div', { id: 'trBlocker' });
    css(blocker, { position:'fixed', inset:'0', zIndex:'9970', pointerEvents:'all', cursor:'default' });
    document.body.appendChild(blocker);

    const panelBase = { position:'fixed', zIndex:'9980', pointerEvents:'none', background:'rgba(0,0,0,.84)', backdropFilter:'blur(2px)', transition:'all .42s cubic-bezier(.4,0,.2,1)' };
    elTop   = make('div'); css(elTop,   { ...panelBase, top:'0', left:'0', right:'0', height:'0' });
    elBot   = make('div'); css(elBot,   { ...panelBase, bottom:'0', left:'0', right:'0', height:'0' });
    elLeft  = make('div'); css(elLeft,  { ...panelBase, top:'0', left:'0', width:'0', height:'100vh' });
    elRight = make('div'); css(elRight, { ...panelBase, top:'0', right:'0', width:'0', height:'100vh' });

    elGlow = make('div');
    css(elGlow, { position:'fixed', zIndex:'9981', pointerEvents:'none', border:'1.5px solid rgba(240,180,41,.5)', borderRadius:'10px', boxShadow:'0 0 0 1px rgba(240,180,41,.1),0 0 40px rgba(240,180,41,.18)', transition:'all .42s cubic-bezier(.4,0,.2,1)', opacity:'0', animation:'trGlowPulse 2.4s ease-in-out infinite' });

    // Progress bar
    const progWrap = make('div');
    css(progWrap, { position:'fixed', top:'0', left:'0', right:'0', height:'2px', zIndex:'9995', background:'rgba(255,255,255,.05)', pointerEvents:'none' });
    elBar = make('div');
    css(elBar, { height:'100%', width:'0%', background:'linear-gradient(90deg,#c98a00,#f0b429,#ffd960)', transition:'width .5s ease' });
    progWrap.appendChild(elBar);

    // Always-on End button
    elEndBtn = make('button', { id: 'trEndBtn' });
    elEndBtn.innerHTML = '&#x2715; End Tour';
    elEndBtn.onclick = endTour;

    // Cursor
    elCursor = make('div', { id: 'trCursor' });
    elCursor.innerHTML = `<svg viewBox="0 0 22 26" width="20" height="24" fill="none"><path d="M3 2.5L19 12L12 14L8.5 22L3 2.5Z" fill="white" stroke="rgba(0,0,0,.4)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

    // Bubble
    elBubble = make('div', { id: 'trBubble' });
    elBubble.innerHTML = `
      <div id="trBubbleHead"><div id="trBubbleAv">L</div><span id="trBubbleLbl">Lucas</span></div>
      <div id="trBubbleText"></div>`;
    elBubbleText = elBubble.querySelector('#trBubbleText');

    document.body.append(elTop, elBot, elLeft, elRight, elGlow, progWrap, elEndBtn, elCursor, elBubble);
  }

  /* ─── Play a step ─────────────────────── */
  function playStep(steps, idx, retries) {
    if (!running || idx >= steps.length) return;
    retries = retries || 0;
    const s = steps[idx];

    clearTimeout(stepTimer);

    // Update progress bar
    const all = allSteps();
    if (elBar) elBar.style.width = ((s.gIdx / Math.max(1, all.length - 1)) * 100) + '%';

    // onEnter callback
    if (s.onEnter && retries === 0) s.onEnter();

    // Find target
    const targetEl = q(s.sel);
    if (!targetEl && retries < 20) {
      after(250, () => playStep(steps, idx, retries + 1));
      return;
    }

    // Spotlight & cursor
    if (targetEl) {
      spotlight(targetEl, 14);
      after(350, () => {
        if (!running) return;
        const curEl = q(s.cursorSel) || targetEl;
        moveCursor(curEl);
        if (s.click) { after(300, () => { animateClick(); }); }
      });
    } else {
      clearSpot();
    }

    // Show bubble
    elBubble.classList.add('tr-bubble-in');
    elBubbleText.textContent = '';
    after(120, () => {
      if (!running) return;
      typeIn(elBubbleText, s.text, false, () => {
        if (!running || s.dur === 0) return;
        stepTimer = after(s.dur - 800, () => advance(steps, idx));
      });
    });
  }

  function advance(steps, idx) {
    if (!running) return;
    const s = steps[idx];
    const next = idx + 1;

    if (s.nav) { navigate(s.nav, s.navStep); return; }
    if (next >= steps.length) { endTour(); return; }

    localIdx = next;
    playStep(steps, next);
  }

  /* ─── Final step ──────────────────────── */
  function playFinal() {
    clearSpot();
    if (elCursor) elCursor.style.opacity = '0';
    if (elBar) elBar.style.width = '100%';

    elBubble.classList.add('tr-bubble-in');
    elBubble.innerHTML = `
      <div id="trBubbleHead"><div id="trBubbleAv">L</div><span id="trBubbleLbl">Lucas</span></div>
      <div id="trBubbleText" style="margin-bottom:18px;">That's the whole site. Make an account, it's free — your picks, your rank, your group. I'll be right here if you need anything.</div>
      <div id="trFinalBtns">
        <a href="auth.html" id="trCreateBtn">Create Account →</a>
        <button id="trExpBtn" onclick="window._tourEnd()">Keep Exploring</button>
      </div>`;
  }

  /* ─── Run page ────────────────────────── */
  function runPage() {
    buildDOM();

    const steps = pageSteps();
    if (!steps.length) return;

    // Find which step to start at (cross-page navigation)
    const gTarget = parseInt(ssGet(SK_STEP) || '0', 10);
    let start = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].gIdx <= gTarget) start = i;
    }
    localIdx = start;

    const s = steps[start];
    if (s.final) { playFinal(); return; }

    // Small boot delay so page fully paints
    const bootDelay = ssGet(SK_ACTIVE) ? 1400 : 200;
    after(bootDelay, () => { if (running) playStep(steps, start); });
  }

  /* ─── End tour ────────────────────────── */
  function endTour() {
    running = false;
    clearTimeout(stepTimer);
    lsSet(SK_SEEN, '1');
    ssSet(SK_ACTIVE, null);
    ssSet(SK_STEP, null);
    sessionStorage.removeItem(SK_ACTIVE);
    sessionStorage.removeItem(SK_STEP);

    const els = [elTop, elBot, elLeft, elRight, elGlow, elCursor, elBubble,
      elEndBtn, elBar?.parentElement, document.getElementById('trFakeRev'),
      document.getElementById('trBlocker')];
    els.forEach(el => { if (!el) return; el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; });
    after(340, () => els.forEach(el => el?.remove()));
  }
  window._tourEnd = endTour;

  /* ─── Start ───────────────────────────── */
  function startTour() {
    if (running) return;
    running = true;
    ssSet(SK_ACTIVE, '1');
    ssSet(SK_STEP, '0');
    lsSet(SK_SEEN, '1');
    killOffer();
    runPage();
  }

  /* ─── CSS ─────────────────────────────── */
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      @keyframes trGlowPulse {
        0%,100%{box-shadow:0 0 0 1px rgba(240,180,41,.1),0 0 28px rgba(240,180,41,.12)}
        50%{box-shadow:0 0 0 1px rgba(240,180,41,.28),0 0 50px rgba(240,180,41,.24)}
      }
      @keyframes trCurBob {0%,100%{margin-top:0}50%{margin-top:-5px}}

      /* End button — always visible, gold, unmissable */
      #trEndBtn {
        position:fixed; top:18px; right:22px; z-index:9996;
        background:rgba(240,180,41,.12); border:1.5px solid rgba(240,180,41,.5);
        color:rgba(240,180,41,.95); font-family:'Montserrat',sans-serif;
        font-weight:800; font-size:.74rem; letter-spacing:.1em; text-transform:uppercase;
        padding:10px 22px; border-radius:7px; cursor:pointer;
        backdrop-filter:blur(12px); transition:all .18s ease;
        box-shadow:0 2px 16px rgba(240,180,41,.1);
      }
      #trEndBtn:hover{
        background:rgba(240,180,41,.22); border-color:rgba(240,180,41,.8);
        color:#f0b429; box-shadow:0 4px 24px rgba(240,180,41,.22);
        transform:translateY(-1px);
      }

      /* Cursor */
      #trCursor {
        position:fixed; z-index:9990; pointer-events:none; opacity:0;
        filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));
        transition:left .65s cubic-bezier(.34,1.3,.64,1),top .65s cubic-bezier(.34,1.3,.64,1),opacity .25s;
        animation:trCurBob 2s ease-in-out infinite;
      }
      #trCursor.tr-clicking{transform:scale(.7);animation:none;transition:transform .08s}

      /* Bubble */
      #trBubble {
        position:fixed; bottom:26px; left:26px; z-index:9990;
        width:min(380px,calc(100vw - 52px));
        background:linear-gradient(135deg,rgba(8,10,18,.97),rgba(16,18,28,.96));
        border:1px solid rgba(240,180,41,.16); border-radius:14px; padding:18px 20px;
        box-shadow:0 14px 44px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.03);
        backdrop-filter:blur(18px);
        transform:translateY(120%); transition:transform .44s cubic-bezier(.34,1.2,.64,1);
        pointer-events:none;
      }
      #trBubble.tr-bubble-in{transform:translateY(0)}
      #trBubbleHead{display:flex;align-items:center;gap:9px;margin-bottom:11px}
      #trBubbleAv{
        width:24px;height:24px;border-radius:50%;flex-shrink:0;
        background:linear-gradient(135deg,#f0b429,#c98a00);
        display:flex;align-items:center;justify-content:center;
        font-family:'Montserrat',sans-serif;font-weight:900;font-size:.66rem;color:#000
      }
      #trBubbleLbl{font-family:'Montserrat',sans-serif;font-weight:700;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35)}
      #trBubbleText{font-family:'Inter',sans-serif;font-size:.84rem;line-height:1.65;color:rgba(255,255,255,.88);min-height:38px}
      #trFinalBtns{display:flex;gap:9px;margin-top:16px;flex-wrap:wrap}
      #trCreateBtn{
        flex:1;min-width:120px;text-align:center;
        background:linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00);color:#fff;
        font-family:'Montserrat',sans-serif;font-weight:800;font-size:.68rem;letter-spacing:.1em;
        text-transform:uppercase;padding:10px 16px;border-radius:6px;text-decoration:none;display:block;
        box-shadow:0 4px 16px rgba(255,120,0,.28);transition:transform .18s,box-shadow .18s
      }
      #trCreateBtn:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(255,120,0,.44)}
      #trExpBtn{
        flex:1;min-width:120px;
        background:rgba(255,255,255,.05);color:rgba(255,255,255,.55);
        font-family:'Montserrat',sans-serif;font-weight:700;font-size:.68rem;letter-spacing:.1em;
        text-transform:uppercase;padding:10px 16px;border-radius:6px;
        border:1px solid rgba(255,255,255,.09);cursor:pointer;transition:background .2s,color .2s;
        pointer-events:all
      }
      #trExpBtn:hover{background:rgba(255,255,255,.1);color:#fff}

      /* Offer */
      #trOffer{
        position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(140%);
        width:min(400px,calc(100vw - 40px));z-index:9985;
        background:linear-gradient(135deg,rgba(8,10,18,.97),rgba(16,18,28,.95));
        border:1px solid rgba(240,180,41,.2);border-radius:16px;padding:24px 26px;
        box-shadow:0 20px 56px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.03);
        backdrop-filter:blur(20px);transition:transform .5s cubic-bezier(.34,1.2,.64,1)
      }
      #trOffer.tr-offer-in{transform:translateX(-50%) translateY(0)}
      #trOfferAv{
        width:36px;height:36px;border-radius:50%;
        background:linear-gradient(135deg,#f0b429,#c98a00);
        display:flex;align-items:center;justify-content:center;
        font-family:'Montserrat',sans-serif;font-weight:900;font-size:.84rem;color:#000;
        margin-bottom:12px
      }
      #trOfferMsg{font-family:'Inter',sans-serif;font-size:.92rem;line-height:1.6;color:rgba(255,255,255,.8);margin:0 0 18px}
      #trOfferBtns{display:flex;gap:9px;justify-content:flex-end}
      #trNo{
        background:none;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.38);
        font-family:'Montserrat',sans-serif;font-weight:700;font-size:.68rem;letter-spacing:.08em;
        text-transform:uppercase;padding:9px 18px;border-radius:6px;cursor:pointer;transition:all .18s
      }
      #trNo:hover{color:rgba(255,255,255,.7);border-color:rgba(255,255,255,.25)}
      #trYes{
        background:linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00);color:#fff;
        font-family:'Montserrat',sans-serif;font-weight:800;font-size:.68rem;letter-spacing:.1em;
        text-transform:uppercase;padding:9px 22px;border-radius:6px;border:none;cursor:pointer;
        box-shadow:0 4px 16px rgba(255,120,0,.3);transition:transform .18s,box-shadow .18s
      }
      #trYes:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(255,120,0,.44)}

      /* Fake review panel */
      #trFakeRev{
        position:fixed;bottom:26px;right:26px;z-index:9991;
        width:min(320px,calc(100vw - 52px));
        background:linear-gradient(135deg,rgba(8,10,18,.97),rgba(16,18,28,.95));
        border:1px solid rgba(240,180,41,.18);border-radius:12px;padding:16px 18px;
        box-shadow:0 14px 40px rgba(0,0,0,.55);backdrop-filter:blur(18px);
        opacity:0;transition:opacity .4s ease;pointer-events:none;
      }
      #trFakeRev.trfr-in{opacity:1}
      .trfr-title{font-family:'Montserrat',sans-serif;font-weight:700;font-size:.72rem;color:rgba(255,255,255,.55);margin-bottom:8px}
      .trfr-stars{font-size:1.1rem;color:#f0b429;letter-spacing:2px;margin-bottom:8px}
      .trfr-stars span{opacity:.25}
      .trfr-text{font-family:'Inter',sans-serif;font-size:.78rem;line-height:1.6;color:rgba(255,255,255,.72);min-height:44px}
      .trfr-meta{font-family:'Inter',sans-serif;font-size:.66rem;color:rgba(255,255,255,.28);margin-top:10px}

      /* Mobile */
      @media(max-width:680px){
        #trCursor{display:none}
        #trBubble{left:10px !important;right:10px !important;width:auto !important;bottom:80px !important}
        #trFakeRev{display:none}
        #trOffer{bottom:80px}
      }
    `;
    document.head.appendChild(s);
  }

  /* ─── Fade in on page arrival ─────────── */
  function fadeIn() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'none';
    raf(() => {
      document.body.style.transition = 'opacity .4s ease';
      document.body.style.opacity    = '1';
    });
  }

  /* ─── Prefetch events ─────────────────── */
  async function prefetchEvents() {
    try {
      const all = await fetch('events.json?_=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
      const now = new Date(); const today = now.toISOString().slice(0, 10);
      window._tourNextEvent = all.filter(e => e.isoDate >= today && e.status !== 'completed').sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] || null;
      window._tourLastEvent = all.filter(e => e.status === 'completed').sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0] || null;
    } catch {}
  }

  /* ─── Init ────────────────────────────── */
  async function init() {
    // Resuming cross-page tour
    if (ssGet(SK_ACTIVE)) {
      fadeIn();
      await prefetchEvents();
      running = true;
      runPage();
      return;
    }

    // Show offer only on index for first-time guests
    if (PAGE !== 'index') return;
    if (lsGet(SK_SEEN)) return;

    await prefetchEvents();

    // Wait for Supabase to init, then check auth — single clean check at 1.6s
    after(1600, async () => {
      if (lsGet(SK_SEEN) || running) return;
      let loggedIn = false;
      try {
        if (window._sb) {
          const { data: { user } } = await window._sb.auth.getUser();
          if (user) loggedIn = true;
        }
      } catch {}
      if (!loggedIn && !lsGet(SK_SEEN) && !running) showOffer();
    });
  }

  /* ─── Boot ────────────────────────────── */
  injectCSS();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.startTour      = startTour;
  window.startTourOffer = showOffer;

})();
