#!/usr/bin/env node
/**
 * fighter-record-sync.js
 * Scrapes ufc.com/athlete pages to keep fighter records current.
 * Updates data/fighters.json with:
 *   - record { wins, losses, draws }
 *   - nickname (from JSON-LD alternateName)
 * Also copies result to fighters.json (root).
 * Run: node scripts/fighter-record-sync.js
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');
const FIGHTERS_ROOT = path.join(__dirname, '..', 'fighters.json');
const DELAY_MS      = 400;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function nameToSlug(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

async function scrapeFighter(fighter) {
  const slug = nameToSlug(fighter.name);
  const url  = `https://www.ufc.com/athlete/${slug}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      if (res.status !== 404) console.warn(`  ⚠️  ${fighter.name}: HTTP ${res.status}`);
      return false;
    }
    const html = await res.text();

    let changed = false;

    // Record: <p class="hero-profile__division-body">18-8-0 (W-L-D)</p>
    const recMatch = html.match(/hero-profile__division-body[^>]*>(\d+)-(\d+)-(\d+)/);
    if (recMatch) {
      const wins = parseInt(recMatch[1]);
      const losses = parseInt(recMatch[2]);
      const draws = parseInt(recMatch[3]);
      const cur = fighter.record || {};
      if (cur.wins !== wins || cur.losses !== losses || cur.draws !== draws) {
        fighter.record = { wins, losses, draws };
        changed = true;
      }
    }

    // Nickname from hero-profile__nickname paragraph
    const nickMatch = html.match(/hero-profile__nickname[^>]*>([^<]*)</);
    if (nickMatch) {
      const raw = nickMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      const nick = raw.replace(/^[""“”]|[""“”]$/g, '').trim(); // strip surrounding quotes
      if (nick && fighter.nickname !== nick) {
        fighter.nickname = nick;
        changed = true;
      }
    }

    if (changed) {
      const rec = fighter.record;
      console.log(`  ✅ ${fighter.name}: ${rec?.wins}-${rec?.losses}-${rec?.draws}${fighter.nickname ? ` "${fighter.nickname}"` : ''}`);
    }
    return changed;
  } catch (e) {
    console.warn(`  ❌ ${fighter.name}: ${e.message}`);
    return false;
  }
}

async function run() {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));

  // Only sync fighters that have a real name (skip stubs)
  const todo = fighters.filter(f => f.name && f.name !== 'TBA' && f.name !== 'Opponent TBA' && !f.name.includes('TBA'));
  console.log(`🥊 Syncing records for ${todo.length} fighters…`);

  let updated = 0;
  for (const fighter of todo) {
    const changed = await scrapeFighter(fighter);
    if (changed) updated++;
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
  fs.writeFileSync(FIGHTERS_ROOT, JSON.stringify(fighters, null, 2));
  console.log(`\n✅ Done. Updated ${updated}/${todo.length} fighters.`);
}

run().catch(e => { console.error('fighter-record-sync failed:', e.message); process.exit(1); });
