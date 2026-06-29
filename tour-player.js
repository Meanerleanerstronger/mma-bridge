/*!
 * MMA Bridge — Lucas Tour Video Player
 * Cinematic overlay player with synced caption bubbles.
 */
(function () {
  'use strict';

  const VIDEO_SRC = 'videos/lucas-tour-home.mp4';
  const DURATION  = 28.33;

  const CAPTIONS = [
    {
      from: 0, to: 4.5,
      chapter: 'Hero',
      text: "Your home base. The hero updates itself — right now it's showing Fight Night Fiziev vs Torres results. When the next event gets close it flips straight to picks mode.",
    },
    {
      from: 4.5, to: 12,
      chapter: 'Recent Results',
      text: "Every recent UFC result in that strip. Scroll through and tap any card to jump straight to the full event breakdown.",
    },
    {
      from: 12, to: 20,
      chapter: 'Trending Today',
      text: "Three biggest stories in MMA right now — real articles, live as news drops. Every card is clickable and takes you straight to the source.",
    },
    {
      from: 20, to: 28.33,
      chapter: 'Today in MMA',
      text: "Six more in the sidebar. All live, all clickable. This is what's actually moving in the sport right now.",
    },
  ];

  /* ─── Helpers ─── */
  function make(tag, id) {
    const el = document.createElement(tag);
    if (id) el.id = id;
    return el;
  }
  function css(el, props) { Object.assign(el.style, props); }

  /* ─── Build overlay ─── */
  function buildOverlay() {
    /* Backdrop */
    const backdrop = make('div', 'trp-backdrop');
    css(backdrop, {
      position: 'fixed', inset: '0', zIndex: '9500',
      background: 'rgba(0,0,0,.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: '0', transition: 'opacity .35s ease',
    });

    /* Close button */
    const closeBtn = make('button', 'trp-close');
    closeBtn.innerHTML = '&#x2715;';
    css(closeBtn, {
      position: 'absolute', top: '20px', right: '24px',
      background: 'rgba(255,255,255,.07)',
      border: '1px solid rgba(255,255,255,.12)',
      color: 'rgba(255,255,255,.5)',
      fontFamily: "'Montserrat',sans-serif", fontWeight: '700',
      fontSize: '1rem', width: '38px', height: '38px',
      borderRadius: '50%', cursor: 'pointer', zIndex: '10',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background .18s, color .18s',
    });
    closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(255,255,255,.14)'; closeBtn.style.color = '#fff'; };
    closeBtn.onmouseout  = () => { closeBtn.style.background = 'rgba(255,255,255,.07)'; closeBtn.style.color = 'rgba(255,255,255,.5)'; };

    /* Chapter label top-center */
    const chapterEl = make('div', 'trp-chapter');
    css(chapterEl, {
      position: 'absolute', top: '22px', left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: "'Montserrat',sans-serif", fontWeight: '800',
      fontSize: '.58rem', letterSpacing: '.2em', textTransform: 'uppercase',
      color: 'rgba(240,180,41,.7)', transition: 'opacity .3s',
      pointerEvents: 'none',
    });

    /* Video wrapper */
    const videoWrap = make('div', 'trp-video-wrap');
    css(videoWrap, {
      position: 'relative',
      width: 'min(88vw, 140vh)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.06)',
      background: '#000',
      flexShrink: '0',
    });

    /* Video */
    const vid = make('video', 'trp-video');
    vid.src = VIDEO_SRC;
    vid.playsInline = true;
    vid.controls = false;
    css(vid, { width: '100%', display: 'block', maxHeight: '62vh', objectFit: 'contain' });

    /* Thin gold progress bar at bottom of video */
    const progWrap = make('div');
    css(progWrap, {
      position: 'absolute', bottom: '0', left: '0', right: '0',
      height: '3px', background: 'rgba(255,255,255,.08)', cursor: 'pointer',
    });
    const progFill = make('div', 'trp-prog');
    css(progFill, {
      height: '100%', width: '0%',
      background: 'linear-gradient(90deg,#c98a00,#f0b429,#ffd960)',
      transition: 'width .25s linear',
      pointerEvents: 'none',
    });

    /* Chapter dots on progress bar */
    CAPTIONS.forEach(c => {
      if (c.from === 0) return;
      const dot = make('div');
      css(dot, {
        position: 'absolute', top: '-3px',
        left: ((c.from / DURATION) * 100) + '%',
        width: '3px', height: '9px',
        background: 'rgba(240,180,41,.5)',
        borderRadius: '2px',
        transform: 'translateX(-50%)',
      });
      progWrap.appendChild(dot);
    });

    progWrap.appendChild(progFill);
    progWrap.addEventListener('click', e => {
      const r = progWrap.getBoundingClientRect();
      vid.currentTime = ((e.clientX - r.left) / r.width) * DURATION;
    });

    videoWrap.append(vid, progWrap);

    /* Lucas bubble */
    const bubble = make('div', 'trp-bubble');
    css(bubble, {
      marginTop: '18px',
      width: 'min(88vw, 140vh)',
      background: 'linear-gradient(135deg,rgba(8,10,18,.97),rgba(16,18,28,.96))',
      border: '1px solid rgba(240,180,41,.16)',
      borderRadius: '12px', padding: '14px 18px',
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      minHeight: '60px',
      transition: 'opacity .3s ease',
    });

    const av = make('div');
    css(av, {
      width: '28px', height: '28px', borderRadius: '50%', flexShrink: '0',
      background: 'linear-gradient(135deg,#f0b429,#c98a00)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Montserrat',sans-serif", fontWeight: '900',
      fontSize: '.72rem', color: '#000',
    });
    av.textContent = 'L';

    const bubbleInner = make('div');
    css(bubbleInner, { flex: '1' });

    const bubbleName = make('div');
    css(bubbleName, {
      fontFamily: "'Montserrat',sans-serif", fontWeight: '700',
      fontSize: '.56rem', letterSpacing: '.14em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,.28)', marginBottom: '5px',
    });
    bubbleName.textContent = 'Lucas';

    const bubbleText = make('div', 'trp-caption');
    css(bubbleText, {
      fontFamily: "'Inter',sans-serif", fontSize: '.82rem',
      lineHeight: '1.6', color: 'rgba(255,255,255,.85)',
      minHeight: '24px',
    });

    bubbleInner.append(bubbleName, bubbleText);
    bubble.append(av, bubbleInner);

    /* Assemble */
    backdrop.append(closeBtn, chapterEl, videoWrap, bubble);
    document.body.appendChild(backdrop);

    return { backdrop, vid, progFill, chapterEl, bubbleText, closeBtn };
  }

  /* ─── Caption logic ─── */
  let _lastCapIdx = -1;
  function updateCaption(t, bubbleText, chapterEl) {
    const idx = CAPTIONS.findIndex(c => t >= c.from && t < c.to);
    if (idx === _lastCapIdx) return;
    _lastCapIdx = idx;
    const cap = CAPTIONS[idx];
    if (!cap) return;

    /* Fade out → swap text → fade in */
    bubbleText.style.opacity = '0';
    chapterEl.style.opacity  = '0';
    setTimeout(() => {
      bubbleText.textContent = cap.text;
      chapterEl.textContent  = cap.chapter;
      bubbleText.style.opacity = '1';
      chapterEl.style.opacity  = '1';
    }, 280);
  }

  /* ─── Show / hide ─── */
  function show() {
    if (document.getElementById('trp-backdrop')) return;
    _lastCapIdx = -1;

    const { backdrop, vid, progFill, chapterEl, bubbleText, closeBtn } = buildOverlay();

    function close() {
      backdrop.style.opacity = '0';
      vid.pause();
      setTimeout(() => backdrop.remove(), 350);
    }
    closeBtn.onclick = close;
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    /* Sync progress + captions */
    vid.addEventListener('timeupdate', () => {
      const t = vid.currentTime;
      progFill.style.width = ((t / DURATION) * 100) + '%';
      updateCaption(t, bubbleText, chapterEl);
    });

    /* Fade in backdrop then play */
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      setTimeout(() => {
        vid.play().catch(() => {});
        /* Seed first caption */
        bubbleText.style.transition = 'opacity .28s';
        chapterEl.style.transition  = 'opacity .28s';
        bubbleText.textContent = CAPTIONS[0].text;
        chapterEl.textContent  = CAPTIONS[0].chapter;
        _lastCapIdx = 0;
      }, 350);
    });
  }

  window.showLucasTour = show;
})();
