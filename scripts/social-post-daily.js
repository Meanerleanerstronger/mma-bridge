#!/usr/bin/env node
/**
 * social-post-daily.js
 * Generates one social poster image + caption per day, rotating between
 * three content types (news / fighter / event). Only 'news' is implemented —
 * fighter and event both need their real page structure confirmed before
 * writing any scraping logic (same rule this project always follows: never
 * guess selectors), so they currently log and exit cleanly instead of
 * posting garbage or failing the workflow.
 *
 * 'news' navigates puppeteer to the LIVE site and screenshots the actual
 * first "Trending Today" card on index.html (#news-card-0) — same headline
 * and source text read straight off that rendered card, not a separate API
 * call, so the caption always matches what's in the image.
 *
 * Writes:
 *   social/<date>-<type>.png   — the 1080x1350 poster, ready to publish
 *   social/latest.json         — { type, caption, image, date } for the
 *                                 publish step to read back
 * Does NOT commit, push, or post anything — that's social-publish.js and
 * the workflow's job.
 */

import fs      from 'fs';
import path    from 'path';
import puppeteer from 'puppeteer';
import sharp   from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, '..', 'social');
const SITE_URL  = process.env.SITE_URL || 'https://mmabridge.com';

const POSTER_W = 1080;
const POSTER_H = 1350; // 4:5 — Instagram feed's tallest allowed portrait ratio

function todayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Rotates by day-of-year so the 3-day cycle doesn't reset at each month
// boundary the way a day-of-month % 3 would.
function pickContentType(date) {
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  const types = ['news', 'fighter', 'event'];
  return types[dayOfYear % 3];
}

// Several UI widgets are position:fixed (pinned to the viewport, not the
// document) — the "Live on MMA Bridge" activity widget (#lw-widget/#lw-tab
// from widget.js) and the Lucas chat launcher (#lw-btn/#lw-window from
// chat.js). Puppeteer's element screenshot auto-scrolls the page to bring
// the target into view first, and a fixed widget stays put through that
// scroll — so depending on where the target ends up, a fixed widget can
// land right on top of it and bleed into the capture. Hiding them is more
// robust than trying to control scroll position, since it doesn't depend
// on the page's current layout/height staying the same over time.
async function hideFloatingWidgets(page) {
  await page.addStyleTag({
    content: `#lw-widget, #lw-tab, #lw-btn, #lw-window { display: none !important; }`,
  });
}

async function buildNewsPost(page) {
  await page.goto(`${SITE_URL}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });

  // The trending cards render async after a fetch — wait for the first one.
  await page.waitForSelector('#news-card-0 .card-image img', { timeout: 20000 });

  // Give the actual <img> a moment to finish loading so the screenshot
  // isn't a blank/broken frame. If it never finishes (slow/dead image url,
  // which does happen — see the events.json photo-bug fixes this repo has
  // needed before), proceed anyway rather than hang the whole job.
  await page.waitForFunction(() => {
    const img = document.querySelector('#news-card-0 .card-image img');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 15000 }).catch(() => {});

  const { title, source } = await page.evaluate(() => {
    const t = document.querySelector('#news-card-0 .nc-title-0');
    const s = document.querySelector('#news-card-0 .nc-source-0');
    return {
      title:  t ? t.textContent.trim() : '',
      source: (s ? s.textContent.trim() : '').replace(/^·\s*/, ''),
    };
  });
  if (!title) {
    throw new Error('Could not read a headline off #news-card-0 — the trending section may be empty or its markup changed');
  }

  await hideFloatingWidgets(page);

  // Screenshot just the photo (.card-image), not the whole card. The full
  // card is ~2:1 tall:wide (fixed 195px photo + a text block below it),
  // nowhere near the 4:5 target — cover-cropping the whole card to fit
  // chopped the headline off mid-sentence. The headline/source already go
  // out as the caption text, so there's no need to keep them legible in the
  // image itself; screenshotting just the photo gives a clean full-bleed
  // crop with no cut-off text.
  const el = await page.$('#news-card-0 .card-image');
  const rawPath = path.join(OUT_DIR, '_raw.png');
  await el.screenshot({ path: rawPath });

  const caption = source ? `${title} — via ${source}` : title;
  return { rawPath, caption };
}

async function buildFighterPost() {
  // TODO: not implemented. Needs the real fighter-profile page structure
  // (which URL, which element holds the "stat card" worth screenshotting)
  // confirmed against the actual site before writing scraping logic here —
  // do not guess a selector.
  return null;
}

async function buildEventPost() {
  // TODO: not implemented. Same as buildFighterPost — needs the real event
  // countdown page/section confirmed first.
  return null;
}

async function finalizePoster(rawPath, outPath) {
  await sharp(rawPath)
    .resize(POSTER_W, POSTER_H, { fit: 'cover', position: sharp.strategy.attention })
    .png()
    .toFile(outPath);
  fs.unlinkSync(rawPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const date = new Date();
  const type = pickContentType(date);
  console.log(`Today's content type: ${type}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  // Wide viewport + 3x scale factor: the trending card is ~220px CSS-wide in
  // the real 3-column desktop layout, so we need real pixels to upscale from
  // cleanly rather than a blurry stretch of a small screenshot.
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 3 });

  let result;
  try {
    if (type === 'news') {
      result = await buildNewsPost(page);
    } else if (type === 'fighter') {
      result = await buildFighterPost();
    } else {
      result = await buildEventPost();
    }
  } finally {
    await browser.close();
  }

  if (!result) {
    console.log(`⏭️  '${type}' content type isn't implemented yet — skipping today, no post generated.`);
    return;
  }

  const key = todayKey(date);
  const imageName = `${key}-${type}.png`;
  const imagePath = path.join(OUT_DIR, imageName);
  await finalizePoster(result.rawPath, imagePath);

  const sidecar = { type, caption: result.caption, image: imageName, date: key };
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(sidecar, null, 2));

  console.log(`✅ Built ${type} post → social/${imageName}`);
  console.log(`   Caption: ${result.caption}`);
}

main().catch(e => {
  console.error('social-post-daily failed:', e.message);
  process.exit(1);
});
