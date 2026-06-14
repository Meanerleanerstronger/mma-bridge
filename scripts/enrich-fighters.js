#!/usr/bin/env node
/**
 * Fighter data enrichment script
 * Pulls real records + last 5 fights from API-Sports MMA API
 *
 * Usage:
 *   node scripts/enrich-fighters.js --key YOUR_API_KEY
 *   node scripts/enrich-fighters.js --key YOUR_API_KEY --upcoming-only
 *   node scripts/enrich-fighters.js --key YOUR_API_KEY --event ufc-305
 *
 * Get a free key (100 req/day) at: https://dashboard.api-sports.io/register
 * Sign up → click MMA → copy your key
 *
 * 100 req/day is enough for ~16 fighters (search + fights per fighter = 2 req each)
 * For a full event card (20-30 fighters), run twice if needed or upgrade to $10/mo.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Args ──────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const keyIdx      = args.indexOf('--key');
const API_KEY     = keyIdx >= 0 ? args[keyIdx + 1] : null;
const upcomingOnly = args.includes('--upcoming-only');
const targetEvent  = args[args.indexOf('--event') + 1] || null;

if (!API_KEY) {
  console.error('\nUsage: node scripts/enrich-fighters.js --key YOUR_API_KEY\n');
  console.error('Get a free key at: https://dashboard.api-sports.io/register');
  console.error('  → Sign up → click MMA → copy API key\n');
  process.exit(1);
}

// ── API helpers ───────────────────────────────────────────────────────
const BASE = 'https://v1.mma.api-sports.io';
const HEADERS = { 'x-apisports-key': API_KEY };

async function apiGet(path) {
  const url = `${BASE}${path}`;
  const res  = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${body.slice(0,200)}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API error: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Slug helper ───────────────────────────────────────────────────────
const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── Load data ─────────────────────────────────────────────────────────
const eventsPath  = join(ROOT, 'data', 'events.json');
const fightersPath = join(ROOT, 'data', 'fighters.json');

const events   = JSON.parse(readFileSync(eventsPath,  'utf8'));
let   fighters = JSON.parse(readFileSync(fightersPath, 'utf8'));

// ── Collect fighters to enrich ────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

const targetEvents = events.filter(ev => {
  if (targetEvent) return ev.id === targetEvent || slug(ev.name) === slug(targetEvent);
  if (upcomingOnly) return ev.status !== 'completed';
  return ev.status !== 'completed';
});

if (!targetEvents.length) {
  console.error('No matching events found. Check --event name or add upcoming events to data/events.json.');
  process.exit(1);
}

const names = new Set();
for (const ev of targetEvents) {
  const all = [...(ev.mainCard || []), ...(ev.prelims || []), ...(ev.earlyPrelims || [])];
  for (const f of all) {
    if (f.a) names.add(f.a.trim());
    if (f.b) names.add(f.b.trim());
  }
}

console.log(`\nEvents to enrich: ${targetEvents.map(e => e.name).join(', ')}`);
console.log(`Fighters found:   ${names.size}\n`);

// ── Build lookup map of existing fighters ─────────────────────────────
const existingBySlug = {};
for (const f of fighters) {
  if (f.name) existingBySlug[slug(f.name)] = f;
  if (f.id)   existingBySlug[f.id]         = f;
}

// ── Check remaining quota ─────────────────────────────────────────────
try {
  const status = await apiGet('/status');
  const used  = status.response?.requests?.current ?? '?';
  const limit = status.response?.requests?.limit_day ?? 100;
  const left  = typeof used === 'number' ? limit - used : '?';
  console.log(`API quota: ${used}/${limit} used today (${left} remaining)\n`);
  if (typeof left === 'number' && left < names.size * 2) {
    console.warn(`⚠ Warning: you need ~${names.size * 2} requests but only have ${left} left today.`);
    console.warn('  Either run again tomorrow, or upgrade at api-sports.io\n');
  }
} catch(e) {
  console.log('(Could not check quota)\n');
}

// ── Enrich each fighter ───────────────────────────────────────────────
let enriched = 0, skipped = 0, notFound = 0;

for (const name of names) {
  process.stdout.write(`  ${name.padEnd(30)} `);

  try {
    // 1) Search for fighter
    const searchData = await apiGet(`/fighters?search=${encodeURIComponent(name)}`);
    await sleep(220); // stay under rate limit

    const candidates = searchData.response || [];
    if (!candidates.length) {
      console.log('✗ not found');
      notFound++;
      continue;
    }

    // Pick best match (exact name match preferred)
    const fd = candidates.find(c => c.name?.toLowerCase() === name.toLowerCase())
            || candidates[0];

    // 2) Build record
    const rec = fd.record || {};
    const record = {
      wins:   rec.wins   ?? 0,
      losses: rec.loses  ?? rec.losses ?? 0,   // API uses "loses" (typo in their docs)
      draws:  rec.draws  ?? 0,
    };

    // 3) Get last 5 fights
    const fightData = await apiGet(`/fights?fighter=${fd.id}`);
    await sleep(220);

    const rawFights = (fightData.response || [])
      .filter(f => f.status?.long === 'Finished' || f.result?.method)
      .slice(0, 5);

    const last5 = rawFights.map(fight => {
      const f1      = fight.fighters?.first;
      const f2      = fight.fighters?.second;
      const isFighter1 = f1?.id === fd.id;
      const opp     = isFighter1 ? f2 : f1;
      const won     = isFighter1 ? !!f1?.winner : !!f2?.winner;
      const bothNull = f1?.winner == null && f2?.winner == null;
      const result  = bothNull ? 'NC' : won ? 'W' : 'L';

      return {
        opponent: opp?.name || '',
        result,
        method:   fight.result?.method || '',
        event:    fight.event?.name    || '',
        round:    fight.result?.round  || 0,
        time:     fight.result?.time   || '',
      };
    });

    // 4) Merge into fighters.json
    const key = slug(name);
    let entry = existingBySlug[key];
    if (!entry) {
      entry = { id: key, name };
      fighters.push(entry);
      existingBySlug[key] = entry;
    }

    entry.record = record;
    entry.last5  = last5;
    // Preserve existing fields (img, bio, nickname etc)

    console.log(`✓  ${record.wins}-${record.losses}-${record.draws}  [${last5.map(f=>f.result).join(' ')}]`);
    enriched++;

  } catch(e) {
    console.log(`✗ error: ${e.message.split('\n')[0]}`);
    skipped++;
  }
}

// ── Write updated fighters.json ───────────────────────────────────────
writeFileSync(fightersPath, JSON.stringify(fighters, null, 2), 'utf8');

console.log(`\n${'─'.repeat(50)}`);
console.log(`Enriched:  ${enriched}`);
console.log(`Not found: ${notFound}`);
console.log(`Errors:    ${skipped}`);
console.log(`\nUpdated: data/fighters.json`);
console.log('Run `git add data/fighters.json && git commit -m "chore: refresh fighter data"` to save.\n');
