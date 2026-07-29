#!/usr/bin/env node
/**
 * social-post-daily.js
 * Generates ALL of these every single day (high-volume mode — previously
 * rotated one type per day, now builds everything available each run):
 *   - news           up to 3 posts, from index.html's "Trending Today" cards
 *   - event_countdown 1 post, the next upcoming event's hero from events.html
 *   - event_recap    1 post, the most recently completed event's hero from
 *                    event-review.html
 *
 * All three navigate puppeteer to the LIVE site and screenshot the real
 * rendered element — no guessed selectors, no fabricated data. Event
 * countdown/recap read *which* event to use straight from data/events.json
 * (already checked out in the same repo this script runs from) rather than
 * scraping dates off the page, since that data is both more reliable and
 * already-verified real event data.
 *
 * Each type builds independently and failures don't cascade — if, say,
 * there's no completed event yet so event_recap has nothing to build, or
 * one type hits an error, the other types still get generated rather than
 * the whole run coming back empty.
 *
 * Writes, per post:
 *   social/<date>-<type>-<n>.png — a 1080x1350 poster, ready to publish
 *   social/latest.json           — { date, posts: [{type, caption, image}] }
 *                                   for admin.html's Marketing Buddy tab to
 *                                   read back and show as review options
 * Does NOT commit, push, or post anything — that's the workflow's job.
 */

import fs      from 'fs';
import path    from 'path';
import puppeteer from 'puppeteer';
import sharp   from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR      = path.join(__dirname, '..', 'social');
const EVENTS_PATH  = path.join(__dirname, '..', 'data', 'events.json');
const SITE_URL  = process.env.SITE_URL || 'https://mmabridge.com';

const POSTER_W = 1080;
const POSTER_H = 1350; // 4:5 — Instagram feed's tallest allowed portrait ratio

function todayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

const ALL_TYPES = ['news', 'event_countdown', 'event_recap'];

function loadEvents() {
  return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
}

function getMainFight(ev) {
  const mc = ev.mainCard || [];
  return mc.find(f => f.slot === 'main') || mc[0] || null;
}

function lastName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name;
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

// index.html's "Trending Today" section only ever renders 3 cards in the DOM
// (#news-card-0/1/2) — extras beyond that are held in a JS-side queue
// (window._newsQueue, see script.js) and only swapped in if one of the 3
// visible images breaks, they're never additional visible cards. So 3 is
// the real, honest number of distinct trending stories available to build
// posts from today, not a rounded-down guess.
const NEWS_CARD_COUNT = 3;

async function buildNewsPosts(page) {
  await page.goto(`${SITE_URL}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });

  // The trending cards render async after a fetch — wait for the first one.
  await page.waitForSelector('#news-card-0 .card-image img', { timeout: 20000 });

  await hideFloatingWidgets(page);

  const posts = [];
  for (let i = 0; i < NEWS_CARD_COUNT; i++) {
    const cardSel = `#news-card-${i}`;
    const exists = await page.$(cardSel);
    if (!exists) break; // fewer than 3 stories today — use however many there are

    // Give the actual <img> a moment to finish loading so the screenshot
    // isn't a blank/broken frame. If it never finishes (slow/dead image url,
    // which does happen — see the events.json photo-bug fixes this repo has
    // needed before), proceed anyway rather than hang the whole job.
    await page.waitForFunction((sel) => {
      const img = document.querySelector(`${sel} .card-image img`);
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 15000 }, cardSel).catch(() => {});

    const { title, source } = await page.evaluate((sel) => {
      const t = document.querySelector(`${sel} .nc-title-${sel.split('-').pop()}`);
      const s = document.querySelector(`${sel} .nc-source-${sel.split('-').pop()}`);
      return {
        title:  t ? t.textContent.trim() : '',
        source: (s ? s.textContent.trim() : '').replace(/^·\s*/, ''),
      };
    }, cardSel);
    if (!title) continue; // this slot didn't render text for some reason — skip it, don't fail the whole batch

    // Screenshot just the photo (.card-image), not the whole card. The full
    // card is ~2:1 tall:wide (fixed 195px photo + a text block below it),
    // nowhere near the 4:5 target — cover-cropping the whole card to fit
    // chopped the headline off mid-sentence. The headline/source already go
    // out as the caption text, so there's no need to keep them legible in
    // the image itself; screenshotting just the photo gives a clean
    // full-bleed crop with no cut-off text.
    const el = await page.$(`${cardSel} .card-image`);
    const rawPath = path.join(OUT_DIR, `_raw-${i}.png`);
    await el.screenshot({ path: rawPath });

    const caption = source ? `${title} (via ${source})` : title;
    posts.push({ rawPath, caption });
  }

  if (!posts.length) {
    throw new Error('Could not read any headlines off the trending cards — the section may be empty or its markup changed');
  }
  return posts;
}

function daysUntil(isoDate) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00Z');
  return Math.round((target - today) / 86400000);
}

async function buildEventCountdownPost(page) {
  const events = loadEvents();
  const today = todayKey(new Date());
  const upcoming = events
    .filter(e => e.status !== 'completed' && e.isoDate && e.isoDate >= today)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  const ev = upcoming[0];
  if (!ev) return null; // no upcoming event scheduled — nothing to build today

  await page.setViewport({ width: 800, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${SITE_URL}/events.html?id=${encodeURIComponent(ev.id)}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('#ovHero', { timeout: 20000 });
  // The hero fades its poster in via onload — same reasoning as news day:
  // wait for it, but proceed even if it never finishes rather than hang.
  await page.waitForFunction(() => {
    const img = document.querySelector('#ovHero .ov-poster');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 15000 }).catch(() => {});
  await hideFloatingWidgets(page);
  // .ov-topbar holds the Pick Fights / Calendar / Close buttons — real
  // in-page navigation controls, not something that belongs in a public
  // promotional screenshot.
  await page.addStyleTag({ content: `.ov-topbar { display: none !important; }` });

  const el = await page.$('#ovHero');
  const rawPath = path.join(OUT_DIR, '_raw-countdown.png');
  await el.screenshot({ path: rawPath });

  const main = getMainFight(ev);
  const days = ev.isoDate ? daysUntil(ev.isoDate) : null;
  const whenPhrase = days === null ? '' : days <= 0 ? 'is TODAY' : days === 1 ? 'is tomorrow' : `is in ${days} days`;
  const matchup = main ? `${lastName(main.a)} vs. ${lastName(main.b)}` : (ev.name || '');
  const caption = `${matchup} ${whenPhrase}. Make your picks on mmabridge.com`;

  return [{ rawPath, caption }];
}

async function buildEventRecapPost(page) {
  const events = loadEvents();
  const today = todayKey(new Date());
  const completed = events
    .filter(e => e.status === 'completed' && e.isoDate && e.isoDate <= today)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  const ev = completed[0];
  if (!ev) return null; // no completed event yet — nothing to recap

  await page.setViewport({ width: 800, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${SITE_URL}/event-review.html?id=${encodeURIComponent(ev.id)}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForSelector('.er-hero, .er-no-poster', { timeout: 20000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.er-hero-img');
    return !img || (img.complete && img.naturalWidth > 0); // no poster at all is fine too — falls back to .er-no-poster
  }, { timeout: 15000 }).catch(() => {});
  await hideFloatingWidgets(page);

  const heroSel = (await page.$('.er-hero')) ? '.er-hero' : '.er-no-poster';
  const el = await page.$(heroSel);
  const rawPath = path.join(OUT_DIR, '_raw-recap.png');
  await el.screenshot({ path: rawPath });

  const main = getMainFight(ev);
  let resultPhrase = '';
  if (main && main.winner) {
    const loser = main.winner === main.a ? main.b : main.a;
    resultPhrase = `. ${lastName(main.winner)} def. ${lastName(loser)}`;
  }
  const caption = `Relive ${ev.name}${resultPhrase}. Full card recap and community ratings on mmabridge.com`;

  return [{ rawPath, caption }];
}

// News cards are already close to the 4:5 target ratio (just the photo,
// see buildNewsPosts), so a plain smart-crop works fine there. The event
// hero screenshots are wide/landscape — cover-cropping those into a 4:5
// frame either zoomed hard into one fighter's face or chopped the other
// one out entirely. Instead: a blurred, scaled-up copy fills the frame as
// a backdrop, and the full, uncropped hero sits on top at whatever size
// fits — nothing gets cut off, and it still looks full-bleed rather than
// like a small image floating on plain black bars.
async function finalizePosterBlurredBackdrop(rawPath, outPath) {
  const background = await sharp(rawPath)
    .resize(POSTER_W, POSTER_H, { fit: 'cover' })
    .blur(50)
    .modulate({ brightness: 0.55 })
    .toBuffer();
  const foreground = await sharp(rawPath)
    .resize(POSTER_W, POSTER_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp(background)
    .composite([{ input: foreground }])
    .png()
    .toFile(outPath);
  fs.unlinkSync(rawPath);
}

async function finalizePoster(rawPath, outPath, mode = 'cover') {
  if (mode === 'blurred-backdrop') return finalizePosterBlurredBackdrop(rawPath, outPath);
  await sharp(rawPath)
    .resize(POSTER_W, POSTER_H, { fit: 'cover', position: sharp.strategy.attention })
    .png()
    .toFile(outPath);
  fs.unlinkSync(rawPath);
}

async function buildRawPosts(page, type) {
  if (type === 'news') {
    // Wide viewport + 3x scale factor: the trending card is ~220px
    // CSS-wide in the real 3-column desktop layout, so we need real
    // pixels to upscale from cleanly rather than a blurry stretch.
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 3 });
    return buildNewsPosts(page);
  }
  if (type === 'event_countdown') return buildEventCountdownPost(page);
  return buildEventRecapPost(page);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const date = new Date();
  const key  = todayKey(date);
  // FORCE_TYPE restricts to just one type for local testing, e.g.
  // `FORCE_TYPE=event_recap node scripts/social-post-daily.js` — omit it
  // to build everything, which is what the daily workflow does.
  const typesToRun = process.env.FORCE_TYPE ? [process.env.FORCE_TYPE] : ALL_TYPES;
  console.log(`Building: ${typesToRun.join(', ')}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const allPosts = [];
  try {
    for (const type of typesToRun) {
      let rawPosts;
      try {
        rawPosts = await buildRawPosts(page, type);
      } catch (e) {
        // One type failing (a page hiccup, a selector that stopped
        // matching, whatever) shouldn't cost the other types their posts
        // too — log it and move on.
        console.error(`⚠️  '${type}' failed, skipping just this type: ${e.message}`);
        continue;
      }
      if (!rawPosts) {
        console.log(`⏭️  No content available for '${type}' today (e.g. no upcoming/completed event to use).`);
        continue;
      }
      const finalizeMode = type === 'news' ? 'cover' : 'blurred-backdrop';
      for (let i = 0; i < rawPosts.length; i++) {
        const imageName = `${key}-${type}-${i + 1}.png`;
        await finalizePoster(rawPosts[i].rawPath, path.join(OUT_DIR, imageName), finalizeMode);
        allPosts.push({ type, caption: rawPosts[i].caption, image: imageName });
      }
    }
  } finally {
    await browser.close();
  }

  if (!allPosts.length) {
    console.log('⏭️  Nothing generated today at all — every type either failed or had no content available.');
    return;
  }

  const sidecar = { date: key, posts: allPosts };
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(sidecar, null, 2));

  console.log(`✅ Built ${allPosts.length} post(s) across ${typesToRun.length} type(s):`);
  allPosts.forEach(p => console.log(`   [${p.type}] ${p.image} — ${p.caption}`));
}

main().catch(e => {
  console.error('social-post-daily failed:', e.message);
  process.exit(1);
});
