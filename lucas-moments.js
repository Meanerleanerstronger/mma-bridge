// ==============================================
// MMA BRIDGE — LUCAS "MOMENTS"
// Rare, special popups from Lucas — never a recurring nudge.
// Each moment fires at most once (or once per season), ever.
// ==============================================

(function () {
  const SEASON_START = new Date('2026-08-20T00:00:00Z');
  const SEASON_END   = new Date('2027-06-09T00:00:00Z');
  const SEASON_KEY   = '2026-27';

  function seen(key)     { try { return !!localStorage.getItem(`lucas_moment_${key}`); } catch { return true; } }
  function markSeen(key) { try { localStorage.setItem(`lucas_moment_${key}`, '1'); } catch {} }

  function showBubble(text) {
    document.querySelectorAll('.lm-bubble').forEach(b => b.remove());

    const bubble = document.createElement('div');
    bubble.className = 'lm-bubble';
    bubble.innerHTML = `
      <button class="lm-bubble-close" type="button" aria-label="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="lm-bubble-head">
        <div class="lm-bubble-av">L</div>
        <div class="lm-bubble-name">Lucas</div>
      </div>
      <div class="lm-bubble-text">${text}</div>
      <div class="lm-bubble-tail"></div>
    `;
    document.body.appendChild(bubble);

    requestAnimationFrame(() => requestAnimationFrame(() => bubble.classList.add('lm-in')));

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      bubble.classList.remove('lm-in');
      bubble.classList.add('lm-out');
      setTimeout(() => bubble.remove(), 260);
      document.removeEventListener('click', onOutside, true);
    };
    function onOutside(e) {
      if (!bubble.contains(e.target)) close();
    }
    bubble.querySelector('.lm-bubble-close').addEventListener('click', close);
    setTimeout(() => document.addEventListener('click', onOutside, true), 80);
  }

  // ── Moment 1: Season opener — once, for everyone, first week of the season ──
  function maybeSeasonOpener() {
    const key = `season_start_${SEASON_KEY}`;
    if (seen(key)) return;
    const now = new Date();
    const weekAfter = new Date(SEASON_START.getTime() + 7 * 86400000);
    if (now < SEASON_START || now > weekAfter) return;
    markSeen(key);
    showBubble("New season, clean slate — everyone's starting even right now. Start strong, fight one.");
  }

  // ── Moment 2: First Double Down ever — once, per user ──
  function maybeFirstDoubleDown() {
    const key = 'first_double_down';
    if (seen(key)) return;
    markSeen(key);
    showBubble("Ooh — a Double Down. Bold. That's either the smartest read of the card, or the story you'll be hearing about all week. Good luck.");
  }

  // ── Moment 3: Crucial stretch — once per season, only for 1st/2nd place ──
  function maybeStretchRun(rankPos) {
    if (rankPos !== 0 && rankPos !== 1) return;
    const key = `stretch_run_${SEASON_KEY}`;
    if (seen(key)) return;
    const now = new Date();
    const stretchStart = new Date(SEASON_END.getTime() - 30 * 86400000);
    if (now < stretchStart || now > SEASON_END) return;
    markSeen(key);
    const text = rankPos === 0
      ? "Season's winding down and you're leading. Don't get comfortable — protect it."
      : "Right behind 1st with the finish line close. This is exactly when leads flip.";
    showBubble(text);
  }

  window.LucasMoments = { maybeSeasonOpener, maybeFirstDoubleDown, maybeStretchRun };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeSeasonOpener);
  } else {
    maybeSeasonOpener();
  }
})();
