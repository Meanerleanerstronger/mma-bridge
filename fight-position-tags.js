/* MMA Bridge — shared "Main Card Opener / Feature Bout / Featured Prelim /
 * Prelim Opener" position-tag logic.
 *
 * Was two separate copies of the identical index math — one in events.html,
 * one in picks.js — that happened to agree but had no way to be kept in
 * sync short of a human remembering to edit both files identically every
 * time. That's the same drift risk that produced the "Main Card ·" label
 * bug earlier this session (a stale assumption baked into one file but not
 * the other). One function now, included by both pages.
 */
(function () {
  'use strict';

  /**
   * @param {'mainCard'|'prelims'|'other'} kind
   * @param {Array} fights   the section's fight array (already positioned
   *                         main-event-first, per the site's stored order)
   * @param {number} i       index of this fight within `fights`
   * @param {boolean} cardIsFinal  true once the event is completed — a
   *                         finished card's positions are permanent fact,
   *                         so labels apply regardless of section size
   * @returns {string} uppercase tag text, or '' if this fight gets none
   */
  function computeFightPosTag(kind, fights, i, cardIsFinal) {
    const n = fights.length;
    const isLast = i === n - 1;

    if (kind === 'mainCard' && (cardIsFinal || n >= 5)) {
      if (isLast && n > 2) return 'MAIN CARD OPENER';
      if (i === 2 && n > 3) return 'FEATURE BOUT';
    } else if (kind === 'prelims' && (cardIsFinal || n >= 4)) {
      if (i === 0) return 'FEATURED PRELIM';
      if (isLast && n > 1) return 'PRELIM OPENER';
    }
    return '';
  }

  window.computeFightPosTag = computeFightPosTag;
})();
