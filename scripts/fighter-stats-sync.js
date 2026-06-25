#!/usr/bin/env node
/**
 * fighter-stats-sync.js — Scrape career stats from ufcstats.com via Puppeteer
 * (ufcstats.com uses Cloudflare JS challenge — requires a real browser)
 *
 * Adds a `stats` key to each fighter in data/fighters.json with career averages.
 * Run manually via workflow_dispatch — not scheduled automatically.
 */

import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');

function parseCareerStats(html) {
  const stats = {};
  const items = [...html.matchAll(/<i[^>]*b-list__box-list-item-title[^>]*>([^<]+)<\/i>\s*([^<\n]+)/gi)];
  for (const item of items) {
    const key = item[1].trim();
    const val = item[2].trim().replace(/--/g, '').trim();
    if (!val) continue;
    if (/SLpM/i.test(key))          stats.slpm   = val;
    else if (/Str\. Acc/i.test(key)) stats.strAcc = val;
    else if (/SApM/i.test(key))      stats.sapm   = val;
    else if (/Str\. Def/i.test(key)) stats.strDef = val;
    else if (/TD Avg/i.test(key))    stats.tdAvg  = val;
    else if (/TD Acc/i.test(key))    stats.tdAcc  = val;
    else if (/TD Def/i.test(key))    stats.tdDef  = val;
    else if (/Sub\. Avg/i.test(key)) stats.subAvg = val;
  }
  return Object.keys(stats).length >= 3 ? stats : null;
}

async function run() {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  const todo = fighters.filter(f => f.name && !f.stats?.slpm);
  console.log(`${todo.length} fighters to update`);
  if (!todo.length) { console.log('All up to date.'); return; }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let updated = 0;
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (const fighter of todo) {
      const nameParts = fighter.name.trim().split(/\s+/);
      if (nameParts.length < 2) continue;
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ');

      try {
        let detailUrl = fighter.ufcstatsId
          ? `http://www.ufcstats.com/fighter-details/${fighter.ufcstatsId}`
          : null;

        if (!detailUrl) {
          const searchUrl = `http://www.ufcstats.com/statistics/fighters?action=search&SearchFirstName=${encodeURIComponent(firstName)}&SearchLastName=${encodeURIComponent(lastName)}`;
          await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          detailUrl = await page.evaluate(() => {
            const link = document.querySelector('a[href*="fighter-details"]');
            return link ? link.href : null;
          });
        }

        if (!detailUrl) { console.warn(`  ⚠️  Not found: ${fighter.name}`); continue; }

        await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        const html  = await page.content();
        const stats = parseCareerStats(html);

        if (!stats) { console.warn(`  ⚠️  No stats parsed: ${fighter.name}`); continue; }

        fighter.stats = stats;
        updated++;
        console.log(`  ✅ ${fighter.name}: SLpM=${stats.slpm} StrAcc=${stats.strAcc} TD=${stats.tdAvg}`);

        await new Promise(r => setTimeout(r, 600));
      } catch (e) { console.warn(`  ❌ ${fighter.name}: ${e.message}`); }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
  console.log(`\n✅ Done. Updated ${updated} fighters.`);
}

run().catch(e => { console.error('Fighter stats sync failed:', e.message); process.exit(1); });
