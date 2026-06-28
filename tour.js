/*!
 * MMA Bridge — Onboarding Tour v1.0
 * Scripted DOM tour: spotlight panels, animated cursor, Lucas narration
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mma_tour_seen';
  const OFFER_DELAY = 2600;
  const IS_MOBILE   = window.innerWidth < 700;

  /* ── State ───────────────────────────────── */
  let step    = 0;
  let running = false;
  let autoTimer = null;

  /* ── DOM refs ─────────────────────────────── */
  let elTop, elBot, elLeft, elRight;
  let elGlow, elCursor, elBubble, elBubbleText, elDots, elNextBtn, elProgressFill, elSkip;

  /* ── Steps ────────────────────────────────── */
  function getSteps() {
    const ev     = window._tourNextEvent;
    const evName = ev ? ev.name : 'the next event';
    return [
      {
        target:  () => document.getElementById('heroSection'),
        cursor:  () => document.getElementById('heroBtn'),
        text:    `This is your fight week hub. ${evName} is coming up — and when fight week hits, this whole section transforms.`,
        pad:     0,
        scroll:  false,
        ttl:     5800,
      },
      {
        target:  () => document.querySelector('.nav-links') || document.querySelector('.navbar'),
        cursor:  null,
        sweep:   true,
        text:    'Five sections — Events, Rankings, Reviews, Leaderboard. Everything you need to follow the sport seriously.',
        pad:     10,
        scroll:  false,
        ttl:     5200,
      },
      {
        target:  () => document.getElementById('heroBtn'),
        cursor:  () => document.getElementById('heroBtn'),
        click:   true,
        text:    'Before each event locks, you pick every fight — winner, method, round. The more precise, the more points.',
        pad:     14,
        scroll:  false,
        ttl:     5600,
      },
      {
        target:  () => document.getElementById('resultsTrack') || document.querySelector('.results-section'),
        cursor:  () => document.querySelector('#resultsInner a') || document.getElementById('resultsTrack'),
        text:    "Last weekend's results — every finish, every decision. Tap any card to see the full breakdown.",
        pad:     8,
        scroll:  true,
        ttl:     5000,
      },
      {
        final: true,
      },
    ];
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
        <p id="trOfferMsg">First time here? Let me show you around — takes about 30 seconds.</p>
        <div id="trOfferBtns">
          <button id="trNo">No thanks</button>
          <button id="trYes">Show me around →</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    raf(() => wrap.classList.add('tr-in'));

    document.getElementById('trYes').onclick = () => { killOffer(); startTour(); };
    document.getElementById('trNo').onclick  = () => { killOffer(); ls(1); };
  }

  function killOffer() {
    const el = document.getElementById('trOffer');
    if (!el) return;
    el.classList.remove('tr-in');
    el.classList.add('tr-out');
    after(380, () => el.remove());
  }

  /* ── Build tour DOM ───────────────────────── */
  function buildDOM() {
    const panelCSS = {
      position: 'fixed', zIndex: '9980', pointerEvents: 'none',
      background: 'rgba(0,0,0,0.84)', backdropFilter: 'blur(3px)',
      transition: 'top .52s cubic-bezier(.4,0,.2,1), left .52s cubic-bezier(.4,0,.2,1), width .52s cubic-bezier(.4,0,.2,1), height .52s cubic-bezier(.4,0,.2,1)',
    };

    elTop   = make('div'); css(elTop,   { ...panelCSS, top:'0', left:'0', right:'0', height:'0' });
    elBot   = make('div'); css(elBot,   { ...panelCSS, bottom:'0', left:'0', right:'0', height:'0' });
    elLeft  = make('div'); css(elLeft,  { ...panelCSS, top:'0', left:'0', width:'0', height:'100vh' });
    elRight = make('div'); css(elRight, { ...panelCSS, top:'0', right:'0', width:'0', height:'100vh' });

    elGlow  = make('div');
    css(elGlow, {
      position:'fixed', zIndex:'9981', pointerEvents:'none',
      border:'1.5px solid rgba(240,180,41,.5)',
      borderRadius:'10px',
      boxShadow:'0 0 0 1px rgba(240,180,41,.1), 0 0 40px rgba(240,180,41,.18)',
      transition:'all .52s cubic-bezier(.4,0,.2,1)',
      opacity:'0',
      animation:'trGlowPulse 2.4s ease-in-out infinite',
    });

    // Progress bar
    const progWrap = make('div');
    css(progWrap, { position:'fixed', top:'0', left:'0', right:'0', height:'2px', zIndex:'9995', background:'rgba(255,255,255,.07)', pointerEvents:'none' });
    elProgressFill = make('div');
    css(elProgressFill, { height:'100%', width:'0%', background:'linear-gradient(90deg,#f0b429,#ffd960)', transition:'width .5s ease', borderRadius:'0 2px 2px 0' });
    progWrap.appendChild(elProgressFill);

    // Skip
    elSkip = make('button', { id:'trSkip' });
    elSkip.textContent = 'Skip tour';
    elSkip.onclick = endTour;

    // Cursor (hidden on mobile)
    elCursor = make('div', { id:'trCursor' });
    elCursor.innerHTML = `<svg viewBox="0 0 24 28" width="22" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3L20 12.5L12.5 14.8L8.5 23L4 3Z" fill="white" stroke="rgba(0,0,0,0.35)" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`;
    if (IS_MOBILE) elCursor.style.display = 'none';

    // Lucas bubble
    elBubble = make('div', { id:'trBubble' });
    elBubble.innerHTML = `
      <div id="trBubbleHead">
        <div id="trBubbleAv">L</div>
        <span id="trBubbleLabel">Lucas</span>
        <div id="trDots"></div>
        <button id="trX" title="Close tour">✕</button>
      </div>
      <div id="trBubbleText"></div>
      <div id="trBubbleFoot">
        <button id="trNext">Next →</button>
      </div>`;

    document.body.append(elTop, elBot, elLeft, elRight, elGlow, progWrap, elSkip, elCursor, elBubble);

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

    elTop.style.height   = t  + 'px';
    elBot.style.height   = b  + 'px';
    elLeft.style.top     = t  + 'px';
    elLeft.style.height  = mh + 'px';
    elLeft.style.width   = l  + 'px';
    elRight.style.top    = t  + 'px';
    elRight.style.height = mh + 'px';
    elRight.style.width  = r  + 'px';

    css(elGlow, {
      top:    (rect.top    - p) + 'px',
      left:   (rect.left   - p) + 'px',
      width:  (rect.width  + p * 2) + 'px',
      height: (rect.height + p * 2) + 'px',
      opacity: '1',
    });
  }

  function clearSpot() {
    elTop.style.height  = '0';
    elBot.style.height  = '0';
    elLeft.style.width  = '0';
    elRight.style.width = '0';
    elGlow.style.opacity = '0';
  }

  /* ── Cursor ───────────────────────────────── */
  function moveCursor(el) {
    if (IS_MOBILE || !el) { elCursor.style.opacity = '0'; return; }
    const r  = el.getBoundingClientRect();
    const cx = r.left + r.width  * 0.2;
    const cy = r.top  + r.height * 0.2;
    css(elCursor, { left: cx + 'px', top: cy + 'px', opacity: '1' });
  }

  function doCursorClick() {
    elCursor.classList.add('tr-clicking');
    after(160, () => elCursor.classList.remove('tr-clicking'));
  }

  /* ── Nav sweep ────────────────────────────── */
  function sweepNav(navEl) {
    if (IS_MOBILE) return;
    const links = [...navEl.querySelectorAll('a')].filter(a => a.offsetParent);
    if (!links.length) return;
    links.forEach((a, i) => after(i * 480, () => running && moveCursor(a)));
  }

  /* ── Typewriter ───────────────────────────── */
  function typeIn(el, text, done) {
    el.textContent = '';
    let i = 0;
    function tick() {
      if (!running) return;
      el.textContent += text[i++];
      if (i < text.length) after(20, tick);
      else if (done) after(150, done);
    }
    tick();
  }

  /* ── Dots ─────────────────────────────────── */
  function renderDots(total, cur) {
    elDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = make('div');
      css(d, {
        width:'6px', height:'6px', borderRadius:'50%', flexShrink:'0',
        background: i === cur ? '#f0b429' : 'rgba(255,255,255,.2)',
        transition: 'background .3s',
      });
      elDots.appendChild(d);
    }
  }

  /* ── Run step ─────────────────────────────── */
  function runStep(i) {
    const steps = getSteps();
    if (i >= steps.length || !running) { endTour(); return; }
    const s = steps[i];
    clearTimeout(autoTimer);

    // Progress
    const nonFinal = steps.filter(x => !x.final).length;
    elProgressFill.style.width = (Math.min(i, nonFinal) / nonFinal * 100) + '%';

    if (s.final) { finalStep(); return; }

    const targetEl = s.target?.();
    if (!targetEl) { advance(); return; }

    // Scroll target into view if needed
    if (s.scroll) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      after(650, () => runStepDOM(s, i, nonFinal));
    } else {
      if (i > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      after(i === 0 ? 60 : 320, () => runStepDOM(s, i, nonFinal));
    }
  }

  function runStepDOM(s, i, total) {
    if (!running) return;
    const targetEl = s.target?.();
    if (!targetEl) { advance(); return; }

    // Spotlight
    spotlight(targetEl.getBoundingClientRect(), s.pad);

    // Cursor
    const curEl = s.cursor?.() || targetEl;
    moveCursor(curEl);
    if (s.sweep) after(300, () => running && sweepNav(targetEl));

    // Dots + button label
    renderDots(total, i);
    elNextBtn.textContent = i === total - 1 ? 'Got it →' : 'Next →';

    // Slide bubble in
    elBubble.classList.add('tr-bubble-in');

    // Type text
    elBubbleText.textContent = '';
    after(220, () => {
      typeIn(elBubbleText, s.text, () => {
        if (s.click) { after(300, doCursorClick); }
        if (s.ttl) autoTimer = after(s.ttl, advance);
      });
    });
  }

  /* ── Final step ───────────────────────────── */
  function finalStep() {
    clearSpot();
    if (!IS_MOBILE) elCursor.style.opacity = '0';
    elProgressFill.style.width = '100%';
    elBubble.classList.add('tr-bubble-in');

    elBubble.innerHTML = `
      <div id="trBubbleHead">
        <div id="trBubbleAv">L</div>
        <span id="trBubbleLabel">Lucas</span>
        <button id="trX" title="Close tour">✕</button>
      </div>
      <div id="trBubbleText" style="margin-bottom:18px;">That's the gist. Make an account, it's free. Pick fights, build your tier, run a group with your crew.</div>
      <div id="trFinalBtns">
        <a href="auth.html" id="trCreateBtn">Create Account →</a>
        <button id="trExploreBtn" onclick="window._tourEnd()">Keep Exploring</button>
      </div>`;
    document.getElementById('trX').onclick = endTour;
  }

  /* ── Advance / end ────────────────────────── */
  function advance() {
    clearTimeout(autoTimer);
    step++;
    runStep(step);
  }

  function endTour() {
    if (!running) return;
    running = false;
    clearTimeout(autoTimer);
    ls(1);

    const els = [elTop, elBot, elLeft, elRight, elGlow, elCursor, elBubble, elSkip];
    els.forEach(el => { if (el) { el.style.transition = 'opacity .35s ease'; el.style.opacity = '0'; } });

    // remove progress bar separately
    document.querySelectorAll('[id^="trSkip"], #trBubble, #trCursor').forEach(el => {
      el.style.transition = 'opacity .35s ease'; el.style.opacity = '0';
    });

    after(400, () => els.forEach(el => el?.remove()));
    // also remove progress wrap
    after(400, () => {
      elProgressFill?.parentElement?.remove();
      document.getElementById('trSkip')?.remove();
    });
  }

  window._tourEnd = endTour;

  /* ── Start ────────────────────────────────── */
  function startTour() {
    if (running) return;
    running = true;
    step    = 0;
    ls(1);
    buildDOM();
    after(180, () => runStep(0));
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
  function ls(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch {} }

  /* ── CSS ──────────────────────────────────── */
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      @keyframes trGlowPulse {
        0%,100% { box-shadow: 0 0 0 1px rgba(240,180,41,.1), 0 0 32px rgba(240,180,41,.14); }
        50%      { box-shadow: 0 0 0 1px rgba(240,180,41,.25), 0 0 52px rgba(240,180,41,.26); }
      }
      @keyframes trBubbleIn {
        from { opacity:0; transform: translateY(18px); }
        to   { opacity:1; transform: translateY(0); }
      }

      /* ── Offer ── */
      #trOffer {
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%) translateY(140%);
        width: min(420px, calc(100vw - 40px));
        z-index: 9985;
        transition: transform .52s cubic-bezier(.34,1.2,.64,1);
      }
      #trOffer.tr-in  { transform: translateX(-50%) translateY(0); }
      #trOffer.tr-out { transform: translateX(-50%) translateY(140%); transition-timing-function: cubic-bezier(.4,0,.2,1); transition-duration:.34s; }
      #trOfferCard {
        background: linear-gradient(135deg, rgba(10,12,20,.97), rgba(20,22,34,.95));
        border: 1px solid rgba(240,180,41,.22);
        border-radius: 18px;
        padding: 24px 26px;
        box-shadow: 0 24px 64px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.04);
        backdrop-filter: blur(24px);
      }
      #trOfferHead { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
      #trOfferAv {
        width:38px; height:38px; border-radius:50%;
        background: linear-gradient(135deg,#f0b429,#c98a00);
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
        text-transform:uppercase; padding:9px 18px; border-radius:6px; cursor:pointer;
        transition:color .2s,border-color .2s;
      }
      #trNo:hover { color:rgba(255,255,255,.75); border-color:rgba(255,255,255,.28); }
      #trYes {
        background: linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00);
        color:#fff; font-family:'Montserrat',sans-serif; font-weight:800; font-size:.7rem;
        letter-spacing:.1em; text-transform:uppercase; padding:9px 22px; border-radius:6px;
        border:none; cursor:pointer; box-shadow:0 4px 18px rgba(255,120,0,.32);
        transition:transform .2s,box-shadow .2s;
      }
      #trYes:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(255,120,0,.46); }

      /* ── Cursor ── */
      #trCursor {
        position: fixed; z-index: 9990; pointer-events: none;
        opacity: 0; width: 22px; height: 26px;
        filter: drop-shadow(0 2px 10px rgba(0,0,0,.55));
        transition: left .72s cubic-bezier(.34,1.3,.64,1), top .72s cubic-bezier(.34,1.3,.64,1), opacity .3s ease;
        animation: trCursorBob 2s ease-in-out infinite;
      }
      #trCursor.tr-clicking { transform: scale(.72); transition: transform .12s ease; animation: none; }
      @keyframes trCursorBob {
        0%,100% { margin-top: 0; }
        50%      { margin-top: -5px; }
      }

      /* ── Skip ── */
      #trSkip {
        position: fixed; top: 18px; right: 22px; z-index: 9995;
        background: none; border: none; color: rgba(255,255,255,.28);
        font-family: 'Inter',sans-serif; font-size:.72rem; letter-spacing:.05em;
        cursor: pointer; padding: 6px 10px; border-radius: 4px;
        transition: color .2s;
      }
      #trSkip:hover { color: rgba(255,255,255,.7); }

      /* ── Bubble ── */
      #trBubble {
        position: fixed; bottom: 32px; left: 32px; z-index: 9990;
        max-width: 400px;
        background: linear-gradient(135deg,rgba(10,12,20,.97),rgba(18,20,30,.95));
        border: 1px solid rgba(240,180,41,.18);
        border-radius: 16px; padding: 20px 22px;
        box-shadow: 0 16px 52px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04);
        backdrop-filter: blur(20px);
        transform: translateY(120%);
        transition: transform .48s cubic-bezier(.34,1.2,.64,1);
        pointer-events: all;
      }
      #trBubble.tr-bubble-in { transform: translateY(0); }
      #trBubbleHead {
        display: flex; align-items: center; gap: 10px; margin-bottom: 13px;
      }
      #trBubbleAv {
        width: 26px; height: 26px; border-radius: 50%;
        background: linear-gradient(135deg,#f0b429,#c98a00);
        display: flex; align-items: center; justify-content: center;
        font-family:'Montserrat',sans-serif; font-weight:900; font-size:.7rem; color:#000; flex-shrink:0;
      }
      #trBubbleLabel {
        font-family:'Montserrat',sans-serif; font-weight:700; font-size:.68rem;
        letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.45);
      }
      #trDots { display:flex; gap:5px; margin-left:auto; align-items:center; }
      #trX {
        background:none; border:none; color:rgba(255,255,255,.3); font-size:.9rem;
        cursor:pointer; padding:2px 4px; margin-left:8px; border-radius:4px;
        line-height:1; transition:color .15s; flex-shrink:0;
      }
      #trX:hover { color:rgba(255,255,255,.8); }
      #trBubbleText {
        font-family:'Inter',sans-serif; font-size:.875rem; line-height:1.65;
        color:rgba(255,255,255,.88); min-height:42px;
      }
      #trBubbleFoot { display:flex; justify-content:flex-end; margin-top:16px; }
      #trNext {
        background: linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00);
        color:#fff; font-family:'Montserrat',sans-serif; font-weight:800;
        font-size:.68rem; letter-spacing:.1em; text-transform:uppercase;
        padding:9px 22px; border-radius:6px; border:none; cursor:pointer;
        box-shadow:0 4px 14px rgba(255,120,0,.28);
        transition:transform .18s cubic-bezier(.34,1.4,.64,1), box-shadow .18s;
      }
      #trNext:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 6px 20px rgba(255,120,0,.42); }

      /* ── Final step buttons ── */
      #trFinalBtns { display:flex; gap:10px; flex-wrap:wrap; }
      #trCreateBtn {
        flex:1; text-align:center; min-width:130px;
        background: linear-gradient(135deg,#7a3100,#d46400 55%,#ff8c00);
        color:#fff; font-family:'Montserrat',sans-serif; font-weight:800;
        font-size:.7rem; letter-spacing:.1em; text-transform:uppercase;
        padding:11px 18px; border-radius:6px; text-decoration:none;
        box-shadow:0 4px 16px rgba(255,120,0,.3);
        transition:transform .18s,box-shadow .18s; display:block;
      }
      #trCreateBtn:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(255,120,0,.44); }
      #trExploreBtn {
        flex:1; min-width:130px;
        background:rgba(255,255,255,.06); color:rgba(255,255,255,.6);
        font-family:'Montserrat',sans-serif; font-weight:700; font-size:.7rem;
        letter-spacing:.1em; text-transform:uppercase; padding:11px 18px;
        border-radius:6px; border:1px solid rgba(255,255,255,.1); cursor:pointer;
        transition:background .2s,color .2s;
      }
      #trExploreBtn:hover { background:rgba(255,255,255,.1); color:#fff; }

      /* ── Mobile ── */
      @media (max-width:680px) {
        #trOffer { bottom: 88px; }
        #trBubble { left:14px !important; right:14px !important; max-width:none !important; bottom:90px !important; }
        #trSkip { top:14px !important; right:14px !important; font-size:.65rem; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Init ─────────────────────────────────── */
  async function init() {
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Pre-fetch next event for dynamic text
    fetch('/events.json?_=' + Date.now(), { cache:'no-store' })
      .then(r => r.json())
      .then(all => {
        const now      = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        window._tourNextEvent = all
          .filter(e => e.isoDate >= todayStr && e.status !== 'completed')
          .sort((a, b) => a.isoDate.localeCompare(b.isoDate))[0] || null;
      })
      .catch(() => {});

    // Delay + auth check
    after(OFFER_DELAY, async () => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      try {
        const sb = window._sb;
        if (sb) {
          const { data: { user } } = await sb.auth.getUser();
          if (user) return; // logged-in users skip tour
        }
      } catch {}
      showOffer();
    });
  }

  // Boot
  injectCSS();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.startTour     = startTour;
  window.startTourOffer = showOffer;

})();
