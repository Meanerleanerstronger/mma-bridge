#!/usr/bin/env node
/**
 * generate-h2h-poster.js
 * On-demand counterpart to social-post-daily.js — builds ONE H2H matchup
 * poster (banner or classic style, dark or light) for whichever two
 * fighters the admin picked in admin.html's "Dream H2H Poster" generator,
 * triggered via .github/workflows/generate-h2h-poster.yml's workflow_dispatch
 * (see backend's marketing_poster.py for the trigger call).
 *
 * Unlike the daily pipeline, this does NOT overwrite social/latest.json —
 * that file gets fully replaced every day by social-post-daily.js, and an
 * on-demand poster needs to survive that. It's appended to a separate
 * social/manual-queue.json instead, which admin.html merges into the same
 * review-card list. Each entry carries the `id` the admin's browser was
 * given at trigger time, so admin.html can poll for that specific id
 * showing up rather than guessing when the run finished.
 *
 * Env vars (all required except LOCATION/EVENT_NAME):
 *   FIGHTER_A, FIGHTER_B, WEIGHT, EVENT_NAME, LOCATION,
 *   STYLE ('poster'|'classic'), THEME ('dark'|'light'),
 *   CAPTION, REQUEST_ID
 */

import fs        from 'fs';
import path      from 'path';
import puppeteer from 'puppeteer';
import sharp     from 'sharp';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR    = path.join(__dirname, '..', 'social');
const QUEUE_PATH = path.join(OUT_DIR, 'manual-queue.json');
const SITE_URL   = process.env.SITE_URL || 'https://mmabridge.com';

const POSTER_W = 1080;
const POSTER_H = 565;  // banner style — 1.91:1, Instagram's widest supported ratio, matches this source's naturally-landscape shape (see SOCIAL_PIPELINE.md gotcha)
const CLASSIC_W = 1080;
const CLASSIC_H = 1350; // classic style is already rendered at 4:5, so this is a straight resize, no letterboxing needed

async function hideFloatingWidgets(page) {
  await page.addStyleTag({
    content: `#lw-widget, #lw-tab, #lw-btn, #lw-window { display: none !important; }`,
  });
}

function todayKey(date) {
  return date.toISOString().slice(0, 10);
}

// Same corner-sampled solid-pad technique used to fix the earlier
// aspect-ratio bug on the manually-added H2H post — reads a background
// pixel out of the actual screenshot so the pad color always matches
// instead of guessing a fixed value that could look wrong in light mode.
async function finalizePosterSolidPad(rawPath, outPath, w, h) {
  const { data } = await sharp(rawPath)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  await sharp(rawPath)
    .resize(w, h, { fit: 'contain', background: bg })
    .png()
    .toFile(outPath);
}

async function finalizeClassic(rawPath, outPath) {
  // .mu-classic-card already renders at aspect-ratio:4/5 — a plain cover
  // resize just locks it to exact pixel dimensions, nothing to letterbox.
  await sharp(rawPath)
    .resize(CLASSIC_W, CLASSIC_H, { fit: 'cover' })
    .png()
    .toFile(outPath);
}

async function main() {
  const fighterA  = process.env.FIGHTER_A;
  const fighterB  = process.env.FIGHTER_B;
  const weight    = process.env.WEIGHT || '';
  const eventName = process.env.EVENT_NAME || '';
  const location  = process.env.LOCATION || '';
  const style     = process.env.STYLE === 'classic' ? 'classic' : 'poster';
  const theme     = process.env.THEME === 'light' ? 'light' : 'dark';
  const caption   = process.env.CAPTION || '';
  const requestId = process.env.REQUEST_ID;

  if (!fighterA || !fighterB) throw new Error('FIGHTER_A and FIGHTER_B are required');
  if (!requestId) throw new Error('REQUEST_ID is required — admin.html generates one per request so it knows which queue entry to watch for');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const params = new URLSearchParams({ a: fighterA, b: fighterB, theme });
  params.set(style, '1');
  if (weight)    params.set('weight', weight);
  if (eventName) params.set('eventName', eventName);
  if (location)  params.set('location', location);
  const url = `${SITE_URL}/matchup.html?${params.toString()}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    if (style === 'classic') {
      await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForSelector('.mu-classic-card', { timeout: 20000 });
      await hideFloatingWidgets(page);
      await new Promise(r => setTimeout(r, 400)); // let fighter photos finish painting
      const el = await page.$('.mu-classic-card');
      const rawPath = path.join(OUT_DIR, `_raw-h2h-${requestId}.png`);
      await el.screenshot({ path: rawPath });
      var imageName = `${todayKey(new Date())}-h2h-manual-${requestId}.png`;
      await finalizeClassic(rawPath, path.join(OUT_DIR, imageName));
    } else {
      await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForSelector('.mu-hero', { timeout: 20000 });
      await hideFloatingWidgets(page);
      await new Promise(r => setTimeout(r, 400));
      // Banner poster mode's event name/location line sits BELOW .mu-hero
      // (moved there on purpose so it never overlaps the fighters — see
      // matchup.html's poster-eventline history) so an element screenshot
      // of just .mu-hero misses it entirely. Clip a bounding box that spans
      // from the hero's top to the eventline's bottom instead, when it's
      // showing text.
      const rawPath = path.join(OUT_DIR, `_raw-h2h-${requestId}.png`);
      const clip = await page.evaluate(() => {
        const hero = document.querySelector('.mu-hero').getBoundingClientRect();
        const lineEl = document.querySelector('.mu-poster-eventline.has-text');
        const bottom = lineEl ? lineEl.getBoundingClientRect().bottom : hero.bottom;
        return { x: hero.left, y: hero.top, width: hero.width, height: bottom - hero.top };
      });
      await page.screenshot({ path: rawPath, clip });
      imageName = `${todayKey(new Date())}-h2h-manual-${requestId}.png`;
      await finalizePosterSolidPad(rawPath, path.join(OUT_DIR, imageName), POSTER_W, POSTER_H);
    }
  } finally {
    await browser.close();
  }

  const finalCaption = caption || `${fighterA} vs ${fighterB}${weight ? ' · ' + weight : ''}`;
  const queue = fs.existsSync(QUEUE_PATH)
    ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'))
    : { posts: [] };
  queue.posts.push({
    id: requestId,
    type: 'h2h',
    caption: finalCaption,
    image: imageName,
    createdAt: todayKey(new Date()),
  });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  console.log(`✅ Built ${imageName} (id ${requestId}) and appended to manual-queue.json`);
}

main().catch(e => {
  console.error('generate-h2h-poster failed:', e.message);
  process.exit(1);
});
