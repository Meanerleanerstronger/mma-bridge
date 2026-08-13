#!/usr/bin/env node
/**
 * fighter-photo-sync.js
 * Fills missing `img` fields in data/fighters.json by scraping ufc.com/athlete/{slug}.
 * UFC.com athlete pages are plain HTML — no Cloudflare challenge, no Puppeteer needed.
 *
 * Also backfills fighters found in data/events.json that aren't in fighters.json yet.
 * Run: node scripts/fighter-photo-sync.js
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH  = path.join(__dirname, '..', 'data', 'fighters.json');
const FIGHTERS_ROOT  = path.join(__dirname, '..', 'fighters.json');
const EVENTS_PATH    = path.join(__dirname, '..', 'data', 'events.json');
const DELAY_MS       = 600;

function nameToSlug(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')                       // strip punctuation
    .trim()
    .replace(/\s+/g, '-');
}

async function fetchPhoto(name) {
  const slug = nameToSlug(name);
  const url  = `https://www.ufc.com/athlete/${slug}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`  ⚠️  ${name}: HTTP ${res.status} at ${url}`);
      return null;
    }
    const html = await res.text();

    // Primary: full-body athlete bio img (most specific)
    const bioMatch = html.match(/src="(https:\/\/(?:ufc\.com|dmxg5wxfqgb4u\.cloudfront\.net)\/(?:images\/)?styles\/athlete_bio_full_body[^"]+)"/i);
    if (bioMatch) return bioMatch[1];

    // Fallback: og:image (may be cropped/square version)
    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+(?:ufc\.com|cloudfront\.net)[^"]+(?:png|jpg|jpeg|webp)[^"]*)"/i)
                 || html.match(/<meta[^>]+content="([^"]+(?:ufc\.com|cloudfront\.net)[^"]+(?:png|jpg|jpeg|webp)[^"]*)"[^>]+property="og:image"/i);
    if (ogMatch) return ogMatch[1];

    console.warn(`  ⚠️  ${name}: no cloudfront image found at ${url}`);
    return null;
  } catch (e) {
    console.warn(`  ❌ ${name}: ${e.message}`);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const args      = process.argv.slice(2);
const forceAll  = args.includes('--force');   // re-fetch ALL fighters, even ones with URLs
const nameIdx   = args.indexOf('--name');
const targetName = nameIdx >= 0 ? args[nameIdx + 1] : null;

async function isUrlBroken(url) {
  if (!url) return true;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    return res.status === 403 || res.status === 404 || res.status >= 500;
  } catch { return true; }
}

async function run() {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  const events   = JSON.parse(fs.readFileSync(EVENTS_PATH,   'utf8'));

  // --name mode: just fix one fighter
  if (targetName) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fighter = fighters.find(f => norm(f.name) === norm(targetName));
    if (!fighter) { console.error(`Fighter not found: ${targetName}`); process.exit(1); }
    const img = await fetchPhoto(fighter.name);
    if (img) { fighter.img = img; console.log(`✅ ${fighter.name} -> ${img}`); }
    else      { console.warn(`⚠️  Could not find photo for ${fighter.name}`); }
    fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
    fs.writeFileSync(FIGHTERS_ROOT, JSON.stringify(fighters, null, 2));
    return;
  }

  // Collect all fighter names from events (past 6 months + upcoming)
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const eventFighters = new Set();
  for (const ev of events) {
    if (ev.isoDate && new Date(ev.isoDate) < cutoff) continue;
    for (const card of ['mainCard', 'prelims', 'earlyPrelims']) {
      for (const fight of (ev[card] || [])) {
        if (fight.a) eventFighters.add(fight.a);
        if (fight.b) eventFighters.add(fight.b);
      }
    }
  }

  // Add stub entries for fighters in events but not in fighters.json
  const existingNames = new Set(fighters.map(f => f.name));
  let stubs = 0;
  for (const name of eventFighters) {
    if (!existingNames.has(name)) {
      fighters.push({ id: nameToSlug(name), name });
      existingNames.add(name);
      stubs++;
    }
  }
  if (stubs) console.log(`➕ Added ${stubs} stub entries from events`);

  // Find fighters that need a photo (missing, local fallback, --force, or broken URL)
  let todo;
  if (forceAll) {
    todo = fighters.filter(f => f.name);
  } else {
    const candidates = fighters.filter(f => f.name && f.img && !f.img.startsWith('images/'));
    console.log(`🔍 Checking ${candidates.length} existing URLs for 403/404...`);
    const broken = [];
    for (const f of candidates) {
      if (await isUrlBroken(f.img)) broken.push(f);
      await sleep(200);
    }
    console.log(`  ${broken.length} broken URLs found`);
    const missing = fighters.filter(f => f.name && (!f.img || f.img.startsWith('images/')));
    todo = [...missing, ...broken];
  }

  console.log(`📸 ${todo.length} fighters need photos (${fighters.length} total)`);
  if (!todo.length) { console.log('✅ All up to date.'); return; }

  let updated = 0;
  for (const fighter of todo) {
    const img = await fetchPhoto(fighter.name);
    if (img) {
      fighter.img = img;
      updated++;
      console.log(`  ✅ ${fighter.name}`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
  fs.writeFileSync(FIGHTERS_ROOT, JSON.stringify(fighters, null, 2));
  console.log(`\n✅ Done. Updated ${updated}/${todo.length} fighters.`);
}

run().catch(e => { console.error('fighter-photo-sync failed:', e.message); process.exit(1); });
