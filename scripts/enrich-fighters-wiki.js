#!/usr/bin/env node
/**
 * Fighter data enrichment via Wikipedia
 * Pulls W-L-D record + last 5 fights from Wikipedia's MMA record tables
 *
 * Usage:
 *   node scripts/enrich-fighters-wiki.js
 *   node scripts/enrich-fighters-wiki.js --event ufc-305
 *   node scripts/enrich-fighters-wiki.js --name "Islam Makhachev"
 *   node scripts/enrich-fighters-wiki.js --dry-run
 *
 * No API key needed. Uses Wikipedia's free public API.
 * Rate limit: ~1 req/sec (we sleep 600ms between requests)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Args ──────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const dryRun       = args.includes('--dry-run');
const nameIdx      = args.indexOf('--name');
const evtIdx       = args.indexOf('--event');
const targetName   = nameIdx >= 0 ? args[nameIdx + 1] : null;
const targetEvt    = evtIdx  >= 0 ? args[evtIdx  + 1] : null;
const forceAll     = args.includes('--all');
const fromFighters = args.includes('--from-fighters'); // process all fighters.json entries

// ── Helpers ───────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = s => s.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
                     .replace(/\{\{[^}]+\}\}/g, '')
                     .replace(/align=\w+\|/g, '')
                     .replace(/^[|!]\s*/, '')
                     .trim();

// ── Wikipedia API ─────────────────────────────────────────────────────
const WIKI = 'https://en.wikipedia.org/w/api.php';

const HEADERS = {
  'User-Agent': 'MMABridgeFighterEnricher/1.0 (harshit.bandi@googlemail.com; mmabridge.com) node-fetch',
  'Accept': 'application/json',
};

async function wikiGet(url) {
  const res  = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error(`Not JSON: ${text.slice(0, 60)}`); }
}

async function wikiSearch(name) {
  // Try direct title first, then search
  const candidates = [
    name,
    name + ' (fighter)',
    name + ' (MMA fighter)',
    name + ' (martial artist)',
  ];

  for (const title of candidates) {
    const url = `${WIKI}?action=query&prop=revisions&titles=${encodeURIComponent(title.replace(/ /g,'_'))}&rvprop=content&rvslots=main&format=json&formatversion=2`;
    const json = await wikiGet(url);
    const page = json.query.pages[0];
    if (!page.missing && page.revisions?.[0]?.slots?.main?.content) {
      const content = page.revisions[0].slots.main.content;
      if (content.includes('MMA record start')) return { title, content };
    }
    await sleep(500);
  }

  // Fall back to search
  const searchUrl = `${WIKI}?action=query&list=search&srsearch=${encodeURIComponent(name + ' UFC MMA fighter')}&srlimit=5&format=json`;
  const sJson = await wikiGet(searchUrl);
  await sleep(500);

  const nameParts = name.toLowerCase().split(/\s+/);
  for (const result of (sJson.query?.search || [])) {
    const title = result.title;
    // Must share at least one significant word with the searched name
    const titleLower = title.toLowerCase();
    const matches = nameParts.filter(p => p.length > 3 && titleLower.includes(p));
    if (!matches.length) continue;

    const url = `${WIKI}?action=query&prop=revisions&titles=${encodeURIComponent(title.replace(/ /g,'_'))}&rvprop=content&rvslots=main&format=json&formatversion=2`;
    const json = await wikiGet(url);
    const page = json.query.pages[0];
    await sleep(500);
    if (!page.missing && page.revisions?.[0]?.slots?.main?.content) {
      const content = page.revisions[0].slots.main.content;
      if (content.includes('MMA record start')) return { title, content };
    }
  }

  return null;
}

function parseMmaRecord(content) {
  const start = content.indexOf('MMA record start');
  if (start < 0) return null;
  // Table ends with |} — find the first one after the start
  let end = content.indexOf('\n|}', start);
  if (end < 0) end = content.length;

  const section = content.slice(start, end);
  const rows    = section.split('|-');
  const fights  = [];

  for (const row of rows.slice(1)) {
    const lines = row.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && (l.startsWith('|') || l.startsWith('!')));

    if (lines.length < 5) continue;

    // Result (line 0)
    const resRaw = lines[0];
    let result;
    if      (/Win/i.test(resRaw))        result = 'W';
    else if (/Loss/i.test(resRaw))       result = 'L';
    else if (/Draw/i.test(resRaw))       result = 'D';
    else if (/NC|No contest/i.test(resRaw)) result = 'NC';
    else continue;

    // Record (line 1) — e.g. "align=center|28–1" or "24–6 (1)"
    const recStr  = clean(lines[1]);
    const recMatch = recStr.match(/(\d+)[–\-](\d+)(?:[–\-\s(](\d+))?/);
    if (!recMatch) continue;

    // Opponent (line 2)
    const opponent = clean(lines[2]);
    if (!opponent || opponent.length < 2) continue;

    // Method (line 3)
    const method = clean(lines[3]);

    // Event (line 4)
    const event = clean(lines[4]);

    // Round (line 6, after date at 5)
    const round = lines[6] ? parseInt(clean(lines[6])) || 0 : 0;

    // Time (line 7)
    const time  = lines[7] ? clean(lines[7]) : '';

    fights.push({ opponent, result, method, event, round, time });
  }

  // Current record is taken from the FIRST fight row's record field (most recent)
  let wins = 0, losses = 0, draws = 0;
  for (const row of rows.slice(1)) {
    const lines = row.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 2) continue;
    const recStr  = clean(lines[1]);
    const recMatch = recStr.match(/(\d+)[–\-](\d+)(?:[–\-\s(](\d+))?/);
    if (recMatch) {
      wins   = parseInt(recMatch[1]) || 0;
      losses = parseInt(recMatch[2]) || 0;
      draws  = parseInt(recMatch[3]) || 0;
      break;
    }
  }

  return {
    record: { wins, losses, draws },
    last5:  fights.slice(0, 10), // field kept as last5 for compatibility; stores up to 10
  };
}

// ── Load data ─────────────────────────────────────────────────────────
const eventsPath   = join(ROOT, 'data', 'events.json');
const fightersPath = join(ROOT, 'data', 'fighters.json');

const events   = JSON.parse(readFileSync(eventsPath,  'utf8'));
let   fighters = JSON.parse(readFileSync(fightersPath, 'utf8'));

// ── Which event names are ours (verified against our own graded results) ──
// This script used to unconditionally overwrite last5 for every fighter on
// any upcoming card, every single day — silently clobbering the accurate,
// hand-reconciled resumes ufc-sync.js now maintains from our own graded
// results, replacing them with Wikipedia's own (differently-formatted,
// unverified-against-us) event names. Skip re-enriching anyone whose last5
// already has real entries sourced from our own archive.
const ourEventNames = new Set(events.map(e => e.name));
function hasVerifiedHistory(entry) {
  return !!(entry?.last5?.length) && entry.last5.some(l5 => ourEventNames.has(l5.event));
}

// ── Build fighter lookup ───────────────────────────────────────────────
const existingBySlug = {};
for (const f of fighters) {
  if (f.name) existingBySlug[slug(f.name)] = f;
  if (f.id)   existingBySlug[f.id]         = f;
}

// ── Collect names to process ──────────────────────────────────────────
let names;

if (targetName) {
  names = [targetName.trim()];
} else if (fromFighters) {
  // Process all real fighters in fighters.json that don't have fight history yet
  // (or have stale data with fewer than 3 fights stored) — skip anyone whose
  // existing last5 is already verified against our own events.json archive.
  const todo = fighters.filter(f =>
    f.name && f.name !== 'TBA' && !f.name.includes('TBA') &&
    (!f.last5 || f.last5.length < 3) && !hasVerifiedHistory(f)
  );
  names = todo.map(f => f.name);
  console.log(`Processing ${names.length} fighters from fighters.json without fight history`);
} else {
  const targetEvents = events.filter(ev => {
    if (targetEvt) return ev.id === targetEvt || slug(ev.name) === slug(targetEvt);
    return forceAll ? true : ev.status !== 'completed';
  });

  if (!targetEvents.length) {
    console.error('No matching events. Use --event, --name, --all, or --from-fighters.');
    process.exit(1);
  }

  console.log(`Events: ${targetEvents.map(e => e.name).join(', ')}`);

  const nameSet = new Set();
  for (const ev of targetEvents) {
    const all = [...(ev.mainCard || []), ...(ev.prelims || []), ...(ev.earlyPrelims || [])];
    for (const f of all) {
      if (f.a) nameSet.add(f.a.trim());
      if (f.b) nameSet.add(f.b.trim());
    }
  }
  names = [...nameSet];
}

console.log(`\nFighters to enrich: ${names.length}\n`);

// ── Enrich loop ───────────────────────────────────────────────────────
let enriched = 0, notFound = 0, errors = 0;

for (const name of names) {
  process.stdout.write(`  ${name.padEnd(32)} `);

  try {
    const found = await wikiSearch(name);
    if (!found) {
      console.log('✗ not found on Wikipedia');
      notFound++;
      continue;
    }

    const parsed = parseMmaRecord(found.content);
    if (!parsed) {
      console.log('✗ no MMA record table found');
      notFound++;
      continue;
    }

    const { record, last5 } = parsed;

    // Merge into fighters array
    const key = slug(name);
    let entry = existingBySlug[key];
    if (!entry) {
      entry = { id: key, name };
      fighters.push(entry);
      existingBySlug[key] = entry;
    }

    entry.record = record;

    const recStr = `${record.wins}-${record.losses}${record.draws ? `-${record.draws}` : ''}`;
    const form   = last5.map(f => f.result).join(' ');

    if (hasVerifiedHistory(entry)) {
      console.log(`✓  ${recStr.padEnd(10)} [record only — last5 already verified from our own results]`);
    } else {
      entry.last5 = last5;
      console.log(`✓  ${recStr.padEnd(10)} [${form}]`);
    }
    enriched++;

    await sleep(600);

  } catch(e) {
    console.log(`✗ error: ${e.message.split('\n')[0]}`);
    errors++;
  }
}

// ── Write ─────────────────────────────────────────────────────────────
if (!dryRun) {
  writeFileSync(fightersPath, JSON.stringify(fighters, null, 2), 'utf8');
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Enriched:  ${enriched}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors:    ${errors}`);
  console.log(`\nUpdated: data/fighters.json`);
  console.log('Run: git add data/fighters.json && git commit -m "chore: refresh fighter data"\n');
} else {
  console.log(`\n[DRY RUN] Would have written ${enriched} updates. Pass without --dry-run to save.\n`);
}
