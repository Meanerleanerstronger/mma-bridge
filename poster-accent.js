/* MMA Bridge — dominant-color extraction from event poster art.
 * Samples a tiny (24x24) downscaled copy of the poster via canvas, skips
 * near-black/near-white/low-saturation pixels (posters are mostly dark
 * background + skin tones — without this the "dominant color" is just
 * muddy grey), and averages what's left into one accent RGB. Used to tint
 * ambient glows per-event instead of one fixed orange for every card,
 * the way Spotify/Apple Music derive a now-playing color from cover art.
 *
 * Depends on the poster CDN sending CORS headers permissive enough for
 * canvas reads (crossOrigin="anonymous" + Access-Control-Allow-Origin).
 * If it doesn't, getImageData() throws (tainted canvas) — caught and
 * cached as null so every caller just falls back to its default color,
 * silently, forever (no retry storm, no visible error).
 */
(function () {
  'use strict';

  const cache = new Map(); // poster URL -> "r,g,b" string | null

  function sampleColor(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 24;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data; // throws if tainted
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue; // skip transparent
            const rr = data[i], gg = data[i + 1], bb = data[i + 2];
            const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
            if (max < 40 || min > 215) continue;   // near-black / near-white
            if (max - min < 18) continue;           // low saturation (grey)
            r += rr; g += gg; b += bb; n++;
          }
          resolve(n ? `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}` : null);
        } catch (e) {
          resolve(null); // tainted canvas (no CORS) or decode failure
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /** @returns {Promise<string|null>} "r,g,b" or null if unavailable */
  async function getPosterAccentColor(url) {
    if (!url) return null;
    if (cache.has(url)) return cache.get(url);
    const color = await sampleColor(url);
    cache.set(url, color);
    return color;
  }

  window.getPosterAccentColor = getPosterAccentColor;
})();
