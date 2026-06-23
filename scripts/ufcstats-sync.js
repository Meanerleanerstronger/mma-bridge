#!/usr/bin/env node
/**
 * ufcstats-sync.js — Scrape fight stats from ufcstats.com for recently completed events
 *
 * Reads data/events.json, finds completed events within last 14 days,
 * scrapes per-fight stats, writes to data/fight-stats/{event-id}.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const EVENTS_PATH = path.join(ROOT, 'data', 'events.json');
const STATS_DIR  = path.join(ROOT, 'data', 'fight-stats');

if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MMABridge-Sync/1.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

// Extract all href+text pairs from anchor tags in HTML
function parseLinks(html, pattern) {
  const links = [];
  const re = /href="([^"]+)"[^>]*>([^<]+)</gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!pattern || pattern.test(m[1])) {
      links.push({ url: m[1].trim(), text: m[2].replace(/\s+/g, ' ').trim() });
    }
  }
  return links;
}

// Normalize fighter name for loose matching
function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Extract text content from TD cells in a table row
function parseTdCells(rowHtml) {
  const cells = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowHtml)) !== null) {
    // Strip inner tags, collapse whitespace
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    cells.push(text);
  }
  return cells;
}

// Parse a single event detail page and extract per-fight stats
async function scrapeEventStats(eventUrl) {
  const html = await getText(eventUrl);

  // Each fight is a <tr class="b-fight-details__table-row ..."> with two fighter rows
  const fights = [];

  // Split on fight rows — ufcstats uses alternating rows per fight
  // The fight table has headers then pairs of rows per fight
  const tableMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) return fights;

  const rows = tableMatch[1].split(/<tr\b/i).slice(1);

  let i = 0;
  while (i < rows.length) {
    const rowA = rows[i] || '';
    const rowB = rows[i + 1] || '';
    i += 2;

    const cellsA = parseTdCells(rowA);
    const cellsB = parseTdCells(rowB);

    // ufcstats columns (0-indexed):
    // 0: W/L, 1: Fighter, 2: KD, 3: Sig. Str., 4: Sig. Str. %, 5: Total Str., 6: TD, 7: TD %, 8: Sub. Att, 9: Rev., 10: Ctrl
    if (cellsA.length < 8 || cellsB.length < 8) continue;

    const nameA = cellsA[1];
    const nameB = cellsB[1];
    if (!nameA || !nameB || nameA === nameB) continue;

    const statsA = {
      kd:       cellsA[2] || '0',
      sigStr:   cellsA[3] || '0 of 0',
      totalStr: cellsA[5] || '0 of 0',
      td:       cellsA[6] || '0 of 0',
      subAtt:   parseInt(cellsA[8]) || 0,
      ctrlTime: cellsA[10] || '0:00',
    };
    const statsB = {
      kd:       cellsB[2] || '0',
      sigStr:   cellsB[3] || '0 of 0',
      totalStr: cellsB[5] || '0 of 0',
      td:       cellsB[6] || '0 of 0',
      subAtt:   parseInt(cellsB[8]) || 0,
      ctrlTime: cellsB[10] || '0:00',
    };

    // Normalize "X of Y" → "X/Y"
    function normalizeStr(s) {
      return s.replace(' of ', '/').replace(/\s/g, '');
    }
    statsA.sigStr   = normalizeStr(statsA.sigStr);
    statsA.totalStr = normalizeStr(statsA.totalStr);
    statsA.td       = normalizeStr(statsA.td);
    statsB.sigStr   = normalizeStr(statsB.sigStr);
    statsB.totalStr = normalizeStr(statsB.totalStr);
    statsB.td       = normalizeStr(statsB.td);

    // Winner is the one with W in column 0
    const winnerName = cellsA[0] === 'W' ? nameA : cellsB[0] === 'W' ? nameB : null;

    fights.push({
      fighter1: nameA,
      fighter2: nameB,
      winner:   winnerName,
      stats: {
        fighter1: statsA,
        fighter2: statsB,
      },
    });
  }

  return fights;
}

// Find ufcstats event URL by matching event name
async function findEventUrl(eventName) {
  const html = await getText('http://www.ufcstats.com/statistics/events/completed?page=all');
  const links = parseLinks(html, /event-details/);

  const normTarget = normName(eventName);

  // Try exact slug match first, then fuzzy
  for (const link of links) {
    if (normName(link.text) === normTarget) return link.url;
  }
  // Fuzzy: check if target words appear in link text
  const targetWords = normTarget.replace(/ufc/g, '').split(/(?=[A-Z])/).filter(w => w.length > 3);
  for (const link of links) {
    const normLink = normName(link.text);
    if (targetWords.every(w => normLink.includes(w))) return link.url;
  }
  // Last resort: longest common substring
  let best = null, bestScore = 0;
  for (const link of links) {
    const normLink = normName(link.text);
    let score = 0;
    for (let len = Math.min(normTarget.length, normLink.length); len >= 4; len--) {
      for (let start = 0; start <= normTarget.length - len; start++) {
        if (normLink.includes(normTarget.slice(start, start + len))) {
          score = Math.max(score, len);
          break;
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = link.url; }
  }
  return bestScore >= 8 ? best : null;
}

async function run() {
  const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const today  = new Date().toISOString().slice(0, 10);

  const targets = events.filter(e =>
    e.status === 'completed' &&
    e.isoDate >= cutoff &&
    e.isoDate <= today
  );

  if (!targets.length) {
    console.log('No recent completed events to process.');
    return;
  }

  for (const ev of targets) {
    const outPath = path.join(STATS_DIR, `${ev.id}.json`);
    if (fs.existsSync(outPath)) {
      console.log(`⏭  Skipping ${ev.id} (already have stats)`);
      continue;
    }

    console.log(`🔍 Looking for: ${ev.name}`);
    try {
      const eventUrl = await findEventUrl(ev.name);
      if (!eventUrl) {
        console.warn(`  ⚠️  Could not find ufcstats URL for "${ev.name}"`);
        continue;
      }
      console.log(`  → ${eventUrl}`);
      const fights = await scrapeEventStats(eventUrl);
      if (!fights.length) {
        console.warn(`  ⚠️  No fights parsed for "${ev.name}"`);
        continue;
      }
      const out = { eventId: ev.id, eventName: ev.name, fights };
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
      console.log(`  ✅ Wrote ${fights.length} fights → data/fight-stats/${ev.id}.json`);
    } catch (e) {
      console.error(`  ❌ Error for "${ev.name}": ${e.message}`);
    }
  }
}

run().catch(e => { console.error('ufcstats sync failed:', e.message); process.exit(1); });
