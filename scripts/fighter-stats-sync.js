#!/usr/bin/env node
/**
 * fighter-stats-sync.js — Scrape career stats from ufcstats.com via Puppeteer
 * (ufcstats.com uses Cloudflare JS challenge — requires a real browser)
 *
 * Adds a `stats` key to each fighter in data/fighters.json with career averages.
 *
 * Fighter lookup works by crawling ufcstats.com's A-Z letter directory
 * (?char=X&page=all) once per run and fuzzy-matching names locally — NOT by
 * ufcstats.com's own ?action=search query params, which turned out to be
 * completely non-functional (searching "Islam Makhachev" returned an
 * unrelated alphabetical fighter list, ignoring the query entirely). Since
 * no fighter in our data has a pre-known ufcstatsId, every lookup went
 * through that broken search — meaning this script, before this fix, would
 * have silently assigned fighters' stats from whichever fighter happened to
 * be first in the ignored search result, not their own. Verified against
 * ufcstats.com directly before writing this.
 *
 * Processes up to --limit fighters per run (default 100) so a single run
 * stays bounded on GitHub Actions; scheduled to run repeatedly until the
 * backlog of never-yet-populated fighters is worked through, then just
 * maintains newcomers. Run manually any time with:
 *   node scripts/fighter-stats-sync.js [--limit N]
 */

import fs        from 'fs';
import path      from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');

const args      = process.argv.slice(2);
const limitIdx  = args.indexOf('--limit');
const LIMIT     = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

function normName(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
}

// ufcstats.com sits behind a Cloudflare JS challenge. page.goto()'s
// networkidle2 can resolve *during* that challenge page, right before its
// own client-side redirect fires — so a subsequent evaluate/content() call
// runs against a page that's already navigating away, throwing "Execution
// context was destroyed, most likely because of a navigation." Same root
// cause already diagnosed and fixed in ufcstats-sync.js.
async function gotoWithRetry(page, url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1000));
      return;
    } catch (e) {
      const isNavRace = /[Ee]xecution context was destroyed|[Nn]avigation/.test(e.message || '');
      if (attempt === retries || !isNavRace) throw e;
      console.warn(`    ⚠️  Navigation race on ${url} (attempt ${attempt + 1}/${retries + 1}), retrying…`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ufcstats.com's directory groups by LAST NAME first letter.
async function buildDirectory(page) {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const byName = new Map(); // normalized full name -> detail URL
  for (const ch of letters) {
    try {
      await gotoWithRetry(page, `http://www.ufcstats.com/statistics/fighters?char=${ch}&page=all`);
      const rows = await page.evaluate(() => {
        const trs = [...document.querySelectorAll('tr.b-statistics__table-row')];
        return trs.map(tr => {
          const cells = [...tr.querySelectorAll('td')];
          if (cells.length < 2) return null;
          const first = cells[0]?.textContent.trim() || '';
          const last  = cells[1]?.textContent.trim() || '';
          const link  = tr.querySelector('a[href*="fighter-details"]');
          return link ? { name: `${first} ${last}`.trim(), href: link.href } : null;
        }).filter(Boolean);
      });
      for (const r of rows) {
        const key = normName(r.name);
        if (key) byName.set(key, r.href);
      }
      process.stdout.write('.');
    } catch (e) {
      console.warn(`\n  ⚠️  Directory letter "${ch}" failed: ${e.message}`);
    }
  }
  console.log(`\nDirectory built: ${byName.size} fighters`);
  return byName;
}

function parseCareerStats(html) {
  const stats = {};
  const items = [...html.matchAll(/<i[^>]*b-list__box-item-title[^>]*>([^<]+)<\/i>\s*([^<\n]+)/gi)];
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
  const allTodo = fighters.filter(f => f.name && !f.stats?.slpm);
  const todo = allTodo.slice(0, LIMIT);
  console.log(`${allTodo.length} fighters total need stats — processing ${todo.length} this run (--limit ${LIMIT})`);
  if (!todo.length) { console.log('All up to date.'); return; }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let updated = 0, notFound = 0;
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Building A-Z fighter directory (one-time crawl this run)...');
    const directory = await buildDirectory(page);

    for (const fighter of todo) {
      try {
        const detailUrl = directory.get(normName(fighter.name));
        if (!detailUrl) { console.warn(`  ⚠️  Not in directory: ${fighter.name}`); notFound++; continue; }

        await gotoWithRetry(page, detailUrl);
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
  console.log(`\n✅ Done. Updated ${updated}/${todo.length} this run (${notFound} not in ufcstats.com directory, ${allTodo.length - updated} still remaining overall).`);
}

run().catch(e => { console.error('Fighter stats sync failed:', e.message); process.exit(1); });
