#!/usr/bin/env node
/**
 * ufcstats-sync.js — Scrape fight stats from ufcstats.com via Puppeteer
 * (ufcstats.com uses Cloudflare JS challenge — requires a real browser)
 *
 * Reads data/events.json, finds completed events within last 14 days,
 * scrapes per-fight stats, writes to data/fight-stats/{event-id}.json
 */

import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.join(__dirname, '..');
const EVENTS_PATH = path.join(ROOT, 'data', 'events.json');
const STATS_DIR   = path.join(ROOT, 'data', 'fight-stats');

if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// ufcstats.com sits behind a Cloudflare JS challenge. page.goto()'s
// networkidle2 can resolve *during* that challenge page, right before its
// own client-side redirect fires — so evaluate() then runs against a page
// that's already navigating away, throwing "Execution context was
// destroyed, most likely because of a navigation." This was previously
// unhandled on the initial event-list load (unlike the per-event loop,
// which already has a try/catch), so it crashed the entire script with
// exit code 1 -> the daily "all jobs failed" email, even though the fix is
// just to wait a beat for the redirect to settle and retry once or twice.
async function gotoAndEval(page, url, evalFn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 1500));
      return await page.evaluate(evalFn);
    } catch (e) {
      const isNavRace = /[Ee]xecution context was destroyed|[Nn]avigation/.test(e.message || '');
      if (attempt === retries || !isNavRace) throw e;
      console.warn(`  ⚠️  Navigation race on ${url} (attempt ${attempt + 1}/${retries + 1}), retrying…`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

async function run() {
  const events  = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  const cutoff  = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const today   = new Date().toISOString().slice(0, 10);
  const targets = events.filter(e =>
    e.status === 'completed' && e.isoDate >= cutoff && e.isoDate <= today
  );

  if (!targets.length) { console.log('No recent completed events to process.'); return; }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Load event list once
    console.log('Loading ufcstats event list…');
    const eventLinks = await gotoAndEval(page, 'http://www.ufcstats.com/statistics/events/completed?page=all', () => {
      return Array.from(document.querySelectorAll('a[href*="event-details"]')).map(a => ({
        url: a.href,
        text: a.textContent.replace(/\s+/g, ' ').trim(),
      }));
    });
    console.log(`Found ${eventLinks.length} events on ufcstats`);

    for (const ev of targets) {
      const outPath = path.join(STATS_DIR, `${ev.id}.json`);
      if (fs.existsSync(outPath)) { console.log(`⏭  Skipping ${ev.id}`); continue; }

      console.log(`🔍 Matching: ${ev.name}`);
      const normTarget = normName(ev.name);

      // Match by normalized name similarity
      let best = null, bestScore = 0;
      for (const link of eventLinks) {
        const normLink = normName(link.text);
        let score = 0;
        for (let len = Math.min(normTarget.length, normLink.length); len >= 5; len--) {
          for (let start = 0; start <= normTarget.length - len; start++) {
            if (normLink.includes(normTarget.slice(start, start + len))) {
              score = Math.max(score, len);
              break;
            }
          }
        }
        if (score > bestScore) { bestScore = score; best = link.url; }
      }

      if (!best || bestScore < 8) {
        // Fallback: match by main event fighter names
        const mainFight = (ev.mainCard || [])[0];
        if (mainFight) {
          const a = normName(mainFight.a?.split(' ').pop() || '');
          const b = normName(mainFight.b?.split(' ').pop() || '');
          for (const link of eventLinks) {
            const t = normName(link.text);
            if ((a && t.includes(a)) || (b && t.includes(b))) { best = link.url; break; }
          }
        }
      }

      if (!best) { console.warn(`  ⚠️  Could not find ufcstats URL for "${ev.name}"`); continue; }
      console.log(`  → ${best}`);

      try {
        const fights = await gotoAndEval(page, best, () => {
          const rows = Array.from(document.querySelectorAll('tbody tr'));
          const fights = [];
          let i = 0;
          while (i < rows.length) {
            const cellsA = Array.from(rows[i]?.querySelectorAll('td') || []).map(td => td.textContent.replace(/\s+/g, ' ').trim());
            const cellsB = Array.from(rows[i+1]?.querySelectorAll('td') || []).map(td => td.textContent.replace(/\s+/g, ' ').trim());
            i += 2;
            if (cellsA.length < 8 || !cellsA[1]) continue;
            function norm(s) { return (s || '').replace(' of ', '/').replace(/\s/g, ''); }
            fights.push({
              fighter1: cellsA[1], fighter2: cellsB[1] || '',
              winner: cellsA[0] === 'W' ? cellsA[1] : cellsB[0] === 'W' ? cellsB[1] : null,
              stats: {
                fighter1: { kd: cellsA[2]||'0', sigStr: norm(cellsA[3]), totalStr: norm(cellsA[5]), td: norm(cellsA[6]), subAtt: parseInt(cellsA[8])||0, ctrlTime: cellsA[10]||'0:00' },
                fighter2: { kd: cellsB[2]||'0', sigStr: norm(cellsB[3]), totalStr: norm(cellsB[5]), td: norm(cellsB[6]), subAtt: parseInt(cellsB[8])||0, ctrlTime: cellsB[10]||'0:00' },
              },
            });
          }
          return fights;
        });

        if (!fights.length) { console.warn(`  ⚠️  No fights parsed`); continue; }
        fs.writeFileSync(outPath, JSON.stringify({ eventId: ev.id, eventName: ev.name, fights }, null, 2));
        console.log(`  ✅ ${fights.length} fights → data/fight-stats/${ev.id}.json`);
      } catch (e) { console.error(`  ❌ ${e.message}`); }
    }
  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error('ufcstats sync failed:', e.message); process.exit(1); });
