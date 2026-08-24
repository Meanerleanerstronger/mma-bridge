/* MMA Bridge — dominant-color extraction from event poster art.
 * Samples a tiny (24x24) downscaled copy of the poster via canvas, skips
 * near-black/near-white/low-saturation pixels (posters are mostly dark
 * background + skin tones — without this the "dominant color" is just
 * muddy grey), and averages what's left into one accent RGB. Used to tint
 * ambient glows per-event instead of one fixed orange for every card,
 * the way Spotify/Apple Music derive a now-playing color from cover art.
 *
 * Neither poster CDN (ufc.com, dmxg5wxfqgb4u.cloudfront.net) sends CORS
 * headers permissive enough for a plain crossOrigin="anonymous" canvas
 * read — verified live: the image load itself fails outright, not just
 * the canvas step. Routed through the backend's existing image proxy
 * (/api/image-proxy, already used for poster downloads) instead, which
 * sets Access-Control-Allow-Origin: * on its response. That proxy only
 * allow-lists the cloudfront host though, so a ufc.com-hosted poster
 * still resolves null — caught and cached, same silent permanent
 * fallback as a real CORS failure would produce.
 */
(function () {
  'use strict';

  const cache = new Map(); // poster URL -> "r,g,b" string | null
  const PROXY = 'https://mmabridge-backend.onrender.com/api/image-proxy?url=';

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
      img.src = PROXY + encodeURIComponent(url);
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
