#!/usr/bin/env node
/**
 * fighter-stats-sync.js — Scrape career stats from ufcstats.com for each fighter in data/fighters.json
 *
 * Adds a `stats` key to each fighter with career averages.
 * Run manually or via workflow_dispatch — not scheduled automatically.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MMABridge-Sync/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Pull a stat value from the ufcstats fighter page HTML
function extractStat(html, label) {
  const re = new RegExp(`${label}[\\s\\S]{0,80}?<li[^>]*>([\\d.]+%?)<`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

// Parse career stats from fighter detail page
function parseCareerStats(html) {
  // ufcstats fighter page has a list of stats in .b-list__info-box items
  // Pattern: <li class="b-list__box-list-item ..."><i ...>LABEL</i>VALUE</li>
  const stats = {};
  const items = [...html.matchAll(/<i[^>]*b-list__box-list-item-title[^>]*>([^<]+)<\/i>\s*([^<\n]+)/gi)];
  for (const item of items) {
    const key = item[1].trim().replace(/\s+/g, ' ');
    const val = item[2].trim().replace(/--/g, '');
    if (!val) continue;
    if (/SLpM/i.test(key))        stats.slpm     = val;
    else if (/Str\. Acc/i.test(key)) stats.strAcc = val;
    else if (/SApM/i.test(key))    stats.sapm     = val;
    else if (/Str\. Def/i.test(key)) stats.strDef = val;
    else if (/TD Avg/i.test(key))  stats.tdAvg    = val;
    else if (/TD Acc/i.test(key))  stats.tdAcc    = val;
    else if (/TD Def/i.test(key))  stats.tdDef    = val;
    else if (/Sub\. Avg/i.test(key)) stats.subAvg = val;
  }
  return Object.keys(stats).length >= 3 ? stats : null;
}

async function searchFighter(firstName, lastName) {
  const url = `http://www.ufcstats.com/statistics/fighters?action=search&SearchFirstName=${encodeURIComponent(firstName)}&SearchLastName=${encodeURIComponent(lastName)}`;
  const html = await getText(url);
  // Find first fighter link
  const m = html.match(/href="(http:\/\/www\.ufcstats\.com\/fighter-details\/[a-f0-9]+)"/i);
  return m ? m[1] : null;
}

async function run() {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  let updated = 0;

  for (const fighter of fighters) {
    // Skip if already has stats
    if (fighter.stats?.slpm) continue;

    const nameParts = (fighter.name || '').trim().split(/\s+/);
    if (nameParts.length < 2) continue;
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ');

    try {
      let detailUrl = fighter.ufcstatsId
        ? `http://www.ufcstats.com/fighter-details/${fighter.ufcstatsId}`
        : await searchFighter(firstName, lastName);

      if (!detailUrl) {
        console.warn(`  ⚠️  No ufcstats URL for ${fighter.name}`);
        continue;
      }

      const html  = await getText(detailUrl);
      const stats = parseCareerStats(html);
      if (!stats) {
        console.warn(`  ⚠️  Could not parse stats for ${fighter.name}`);
        continue;
      }

      fighter.stats = stats;
      updated++;
      console.log(`  ✅ ${fighter.name}: SLpM ${stats.slpm}, Str Acc ${stats.strAcc}`);

      // Be polite — don't hammer ufcstats
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`  ❌ ${fighter.name}: ${e.message}`);
    }
  }

  fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
  console.log(`\n✅ Done. Updated ${updated} fighters in data/fighters.json`);
}

run().catch(e => { console.error('Fighter stats sync failed:', e.message); process.exit(1); });
