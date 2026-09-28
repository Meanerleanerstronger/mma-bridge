/**
 * social-shared.js — dependency-free helpers shared by the generator
 * (social-post-daily.js / social-data-posts.js) and the poster
 * (social-autopost.js, which runs without `npm install`).
 */

// Content rule: no em/en dashes and no emojis in any caption. Scraped news
// headlines use them constantly, so this runs at generation AND right
// before posting.
export function cleanCaption(text) {
  return String(text || '')
    .replace(/\s*[—―]\s*/g, ' - ')          // em dash / horizontal bar
    .replace(/(\d)\s*–\s*(\d)/g, '$1-$2')          // en dash in ranges: 5–3 -> 5-3
    .replace(/\s*–\s*/g, ' - ')                    // any other en dash
    .replace(/\p{Extended_Pictographic}️?/gu, '')  // emojis
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// Countdowns only post at these days out (fight day is covered by picks_lock).
export const COUNTDOWN_DAYS = [7, 3, 1];

export function dedupeKey(post) {
  return post.ref ? `${post.type}:${post.ref}` : `image:${post.image}`;
}

/** Would the autoposter consider this post at all (ignoring already-posted)? */
export function isEligible(post, now = Date.now()) {
  if (post.expiresAt && now >= new Date(post.expiresAt).getTime()) return false;
  if (post.type === 'event_countdown' && post.days !== undefined) return COUNTDOWN_DAYS.includes(post.days);
  return true;
}
