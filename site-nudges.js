// ==============================================
// MMA BRIDGE — SITE NUDGES
// Small popup prompts while browsing: "this card just wrapped, review it"
// and "this card is coming up fast and you haven't picked it yet." At
// most one per browser session (won't stack/spam across page loads), and
// each is permanently dismissible per-event via "Don't show this again."
// Logged-in users only — both nudges depend on per-user pick/review state.
// ==============================================
(function () {
  'use strict';

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function daysUntil(isoDate) {
    if (!isoDate) return null;
    return Math.ceil((new Date(isoDate) - new Date()) / 86400000);
  }

  function dismissedKey(eventId, type) { return `mma_nudge_dismissed_${type}_${eventId}`; }
  function isDismissed(eventId, type) {
    try { return localStorage.getItem(dismissedKey(eventId, type)) === '1'; } catch { return false; }
  }
  function dismissForever(eventId, type) {
    try { localStorage.setItem(dismissedKey(eventId, type), '1'); } catch {}
  }
  // Only sessionStorage, not localStorage — a plain close should let the
  // nudge come back on your NEXT visit (it's still true you haven't
  // picked/reviewed), just not spam you again this same session.
  function shownThisSession() {
    try { return sessionStorage.getItem('mma_nudge_shown') === '1'; } catch { return false; }
  }
  function markShownThisSession() {
    try { sessionStorage.setItem('mma_nudge_shown', '1'); } catch {}
  }

  function showBubble({ text, ctaText, ctaHref, eventId, type }) {
    document.querySelectorAll('.sn-bubble').forEach(b => b.remove());

    const bubble = document.createElement('div');
    bubble.className = 'sn-bubble';
    bubble.innerHTML = `
      <button class="sn-close" type="button" aria-label="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="sn-text">${text}</div>
      <div class="sn-actions">
        <a class="sn-cta" href="${esc(ctaHref)}">${esc(ctaText)}</a>
        <button class="sn-later" type="button">Don't show this again</button>
      </div>
      <div class="sn-tail"></div>
    `;
    document.body.appendChild(bubble);

    requestAnimationFrame(() => requestAnimationFrame(() => bubble.classList.add('sn-in')));

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      bubble.classList.remove('sn-in');
      bubble.classList.add('sn-out');
      setTimeout(() => bubble.remove(), 260);
      document.removeEventListener('click', onOutside, true);
    };
    function onOutside(e) { if (!bubble.contains(e.target)) close(); }

    bubble.querySelector('.sn-close').addEventListener('click', close);
    bubble.querySelector('.sn-later').addEventListener('click', () => {
      dismissForever(eventId, type);
      close();
    });
    // Don't let the CTA's own click get swallowed by the outside-click
    // listener before the browser has a chance to navigate.
    setTimeout(() => document.addEventListener('click', onOutside, true), 80);
  }

  async function checkAndShow() {
    const uid = window.MMABridgeAuth?.getUser()?.id;
    if (!uid) return;
    if (shownThisSession()) return;
    const sb = window._sb;
    if (!sb) return;

    let events;
    try {
      const res = await fetch('data/events.json?_=' + Date.now(), { cache: 'no-store' });
      events = await res.json();
    } catch { return; }
    if (!Array.isArray(events)) return;

    // ── 1. Picks nudge — upcoming event within 2 days, nothing picked yet.
    // Checked first: picks actually lock at start_time, so this is the
    // more time-sensitive of the two. ──────────────────────────────────
    const upcoming = events
      .filter(e => e.status !== 'completed' && e.isoDate)
      .map(e => ({ e, d: daysUntil(e.isoDate) }))
      .filter(x => x.d !== null && x.d >= 0 && x.d <= 2)
      .filter(x => !isDismissed(x.e.id, 'picks'))
      .sort((a, b) => a.d - b.d);

    for (const { e, d } of upcoming) {
      let already = false;
      try {
        const { data } = await sb.from('picks').select('fight_key').eq('user_id', uid).eq('event_id', e.id).limit(1);
        already = !!(data && data.length);
      } catch { continue; }
      if (already) continue;

      markShownThisSession();
      const dayWord = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
      showBubble({
        text: `<strong>${esc(e.name)}</strong> is ${dayWord} and you haven't made your picks yet.`,
        ctaText: 'Make Your Picks',
        ctaHref: `picks.html?event=${encodeURIComponent(e.id)}`,
        eventId: e.id,
        type: 'picks',
      });
      return;
    }

    // ── 2. Review nudge — recently completed event, no review from you. ──
    const recentlyDone = events
      .filter(e => e.status === 'completed' && e.isoDate)
      .map(e => ({ e, d: daysUntil(e.isoDate) }))
      .filter(x => x.d !== null && x.d >= -5 && x.d <= 0)
      .filter(x => !isDismissed(x.e.id, 'review'))
      .sort((a, b) => b.d - a.d); // most recently completed first

    for (const { e } of recentlyDone) {
      let already = false;
      try {
        const { data } = await sb.from('ratings').select('id').eq('user_id', uid).eq('event_id', e.id).limit(1);
        already = !!(data && data.length);
      } catch { continue; }
      if (already) continue;

      markShownThisSession();
      showBubble({
        text: `<strong>${esc(e.name)}</strong> just wrapped. What'd you think?`,
        ctaText: 'Review This Card',
        ctaHref: `event-review.html?id=${encodeURIComponent(e.id)}`,
        eventId: e.id,
        type: 'review',
      });
      return;
    }

    // ── 3. Walkout song nudge — lowest priority, only fires if nothing
    // more time-sensitive did. Checked live against the profile row
    // (not a "just signed up" flag) so it naturally targets anyone who
    // hasn't picked one yet, old account or new. ──────────────────────
    if (isDismissed('walkout-song', 'walkout')) return;
    try {
      const { data } = await sb.from('profiles').select('walkout_song').eq('id', uid).single();
      if (data?.walkout_song) return;
    } catch { return; }

    markShownThisSession();
    showBubble({
      text: `🎵 You haven't picked a <strong>walkout song</strong> yet — show up to the octagon in style.`,
      ctaText: 'Pick Your Walkout Song',
      ctaHref: 'profile.html?walkout=1',
      eventId: 'walkout-song',
      type: 'walkout',
    });
  }

  function init() {
    // Give auth (and window._sb) a moment to actually resolve before the
    // first check, rather than racing it on every page load.
    setTimeout(checkAndShow, 1500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
