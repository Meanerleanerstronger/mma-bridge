#!/usr/bin/env node
/**
 * ufc-event-card-sync.js
 * Scrapes UFC.com event pages to keep data/events.json current:
 *   - Adds newly announced fights (main card, prelims, early prelims)
 *   - Sets start_time from broadcast timestamp
 *   - Fills imgA/imgB from data/fighters.json name lookup
 *   - Sets titleFight and ranked flags
 * Preserves all manually-set fields (slot, winner, method, round, time).
 * Writes data/events.json + events.json (root copy).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH    = path.join(__dirname, '..', 'data', 'events.json');
const EVENTS_ROOT    = path.join(__dirname, '..', 'events.json');
const FIGHTERS_PATH  = path.join(__dirname, '..', 'data', 'fighters.json');
const DELAY_MS       = 500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/-/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

function lastName(name) {
  const parts = norm(name).split(' ');
  return parts[parts.length - 1];
}

function nameToSlug(name) {
  return norm(name).replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Derive the UFC.com event slug from our event ID + isoDate.
// PPV:        "ufc-329-mcgregor-vs-holloway-2" → "ufc-329"
// Fight Night: slug is date-based → "ufc-fight-night-june-27-2026"
function deriveUfcSlug(eventId, isoDate) {
  const ppv = eventId.match(/^(ufc-\d+)/);
  if (ppv) return ppv[1];
  if (isoDate) {
    const d = new Date(isoDate + 'T12:00:00Z');
    const mon = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const yr  = d.getUTCFullYear();
    return `ufc-fight-night-${mon}-${day}-${yr}`;
  }
  return eventId;
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.warn(`  fetch error: ${e.message}`);
    return null;
  }
}

// Extract text between two string patterns (first occurrence)
function between(html, open, close, from = 0) {
  const s = html.indexOf(open, from);
  if (s < 0) return '';
  const e = html.indexOf(close, s + open.length);
  if (e < 0) return '';
  return html.slice(s + open.length, e).trim();
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
          .replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseSection(html, sectionId) {
  const fights = [];
  const startTag = `id="${sectionId}"`;
  const sIdx = html.indexOf(startTag);
  if (sIdx < 0) return fights;

  // Find the next section boundary (another id= section or end of fight card)
  const nextSection = (() => {
    const others = ['id="main-card"', 'id="prelims-card"', 'id="early-prelims"', 'id="post-event"'];
    let nearest = html.length;
    for (const o of others) {
      if (o === startTag) continue;
      const idx = html.indexOf(o, sIdx + startTag.length);
      if (idx > 0 && idx < nearest) nearest = idx;
    }
    return nearest;
  })();

  const sectionHtml = html.slice(sIdx, nextSection);

  // Split into individual fight blocks — each starts with c-listing-fight__class
  const fightBlocks = sectionHtml.split('c-listing-fight__class c-listing-fight__class--mobile').slice(1);

  for (const block of fightBlocks) {
    // Weight class
    const weightRaw = between(block, 'c-listing-fight__class-text">', '<');
    if (!weightRaw) continue;
    const weightText = stripTags(weightRaw);
    const titleFight = /championship/i.test(weightText);
    // Normalize weight: "Welterweight Bout" → "Welterweight"
    const weight = weightText.replace(/\s+(?:bout|championship\s+bout|title\s+bout)/i, '').trim();

    // Red corner (fighter A)
    const redIdx  = block.indexOf('c-listing-fight__corner--red');
    const blueIdx = block.indexOf('c-listing-fight__corner--blue');
    if (redIdx < 0 || blueIdx < 0) continue;

    // Extract name from corner-name div — works for both plain-text anchors
    // and span-based names (given-name + family-name spans)
    function parseName(chunk, side) {
      const marker = `c-listing-fight__corner-name--${side}">`;
      const idx = chunk.indexOf(marker);
      if (idx < 0) return '';
      const end = chunk.indexOf('</div>', idx + marker.length);
      if (end < 0) return '';
      return stripTags(chunk.slice(idx + marker.length, end)).trim();
    }

    const redChunk  = block;
    const blueChunk = block;

    const nameA = parseName(redChunk, 'red');
    const nameB = parseName(blueChunk, 'blue');
    if (!nameA || !nameB) continue;

    // Check ranked (any corner rank div has content like "#3")
    const hasRank = /#\d/.test(redChunk) || /#\d/.test(blueChunk);

    fights.push({ a: nameA, b: nameB, weight, titleFight, ranked: hasRank });
  }

  return fights;
}

function parseStartTime(html) {
  // Main card broadcaster timestamp
  const tsMatch = html.match(/c-event-fight-card-broadcaster__time[^>]*data-timestamp="(\d+)"/);
  if (!tsMatch) return null;
  return new Date(parseInt(tsMatch[1]) * 1000).toISOString();
}

function buildFighterIndex(fighters) {
  const idx = new Map();
  for (const f of fighters) {
    if (f.name) idx.set(norm(f.name), f);
  }
  return idx;
}

function lookupImg(name, fighterIdx) {
  return fighterIdx.get(norm(name))?.img || '';
}

function fightsMatch(a, b) {
  const na = norm(a.a), nb = norm(a.b);
  const na2 = norm(b.a), nb2 = norm(b.b);
  // Exact match (either order)
  if ((na === na2 && nb === nb2) || (na === nb2 && nb === na2)) return true;
  // Surname match — handles abbreviations (Abusupiyan vs Abus) and partial names
  const sna = lastName(a.a), snb = lastName(a.b);
  const sna2 = lastName(b.a), snb2 = lastName(b.b);
  if (sna && snb && sna2 && snb2) {
    if ((sna === sna2 && snb === snb2) || (sna === snb2 && snb === sna2)) return true;
  }
  return false;
}

function mergeFights(existing, fromUFC, fighterIdx) {
  const result = [...existing];

  for (const ufcFight of fromUFC) {
    const match = result.find(f => fightsMatch(f, ufcFight));
    if (match) {
      // Update fields we're allowed to update
      if (!match.imgA) match.imgA = lookupImg(match.a, fighterIdx);
      if (!match.imgB) match.imgB = lookupImg(match.b, fighterIdx);
      if (ufcFight.titleFight) match.titleFight = true;
      if (ufcFight.ranked)     match.ranked = true;
    } else {
      // New fight — add it
      result.push({
        a:         ufcFight.a,
        b:         ufcFight.b,
        weight:    ufcFight.weight,
        rounds:    ufcFight.titleFight ? '5 Rds' : '3 Rds',
        titleFight: ufcFight.titleFight,
        ranked:    ufcFight.ranked,
        slot:      '',
        imgA:      lookupImg(ufcFight.a, fighterIdx),
        imgB:      lookupImg(ufcFight.b, fighterIdx),
      });
      console.log(`    ➕ New fight added: ${ufcFight.a} vs ${ufcFight.b}`);
    }
  }

  return result;
}

async function syncEvent(ev, fighterIdx) {
  const slug = deriveUfcSlug(ev.id, ev.isoDate);
  const url  = `https://www.ufc.com/event/${slug}`;
  console.log(`\n📋 ${ev.name} → ${url}`);

  const html = await fetchPage(url);
  if (!html) {
    console.log('  ⚠️  Could not fetch page');
    return false;
  }

  if (!html.includes('c-listing-fight__corner--red')) {
    console.log('  ⚠️  No fight card found on page');
    return false;
  }

  const ufcMain      = parseSection(html, 'main-card');
  const ufcPrelims   = parseSection(html, 'prelims-card');
  const ufcEarlyPre  = parseSection(html, 'early-prelims');

  console.log(`  UFC.com: ${ufcMain.length} main / ${ufcPrelims.length} prelims / ${ufcEarlyPre.length} early prelims`);

  const startTime = parseStartTime(html);

  let changed = false;

  // start_time
  if (startTime && !ev.start_time) {
    ev.start_time = startTime;
    console.log(`  ⏰ start_time set: ${startTime}`);
    changed = true;
  }

  // Merge each section
  const prevMainLen   = (ev.mainCard    || []).length;
  const prevPreLen    = (ev.prelims     || []).length;
  const prevEarlyLen  = (ev.earlyPrelims|| []).length;

  if (ufcMain.length)     ev.mainCard     = mergeFights(ev.mainCard    || [], ufcMain,     fighterIdx);

  // Build sets of fighters already placed in higher sections so we don't re-add them lower
  const mainFighters = new Set((ev.mainCard || []).flatMap(f => [norm(f.a), norm(f.b)]));
  const notInMain = f => !mainFighters.has(norm(f.a)) && !mainFighters.has(norm(f.b));

  if (ufcPrelims.length)  ev.prelims      = mergeFights(ev.prelims     || [], ufcPrelims.filter(notInMain),  fighterIdx);
  const presFighters = new Set((ev.prelims || []).flatMap(f => [norm(f.a), norm(f.b)]));
  const notInPres = f => notInMain(f) && !presFighters.has(norm(f.a)) && !presFighters.has(norm(f.b));
  if (ufcEarlyPre.length) ev.earlyPrelims = mergeFights(ev.earlyPrelims|| [], ufcEarlyPre.filter(notInPres), fighterIdx);

  // Also clean existing fights that may have moved up sections
  ev.prelims      = (ev.prelims     || []).filter(notInMain);
  ev.earlyPrelims = (ev.earlyPrelims|| []).filter(f => notInMain(f) && !presFighters.has(norm(f.a)) && !presFighters.has(norm(f.b)));

  // Fill missing imgA/imgB on all existing fights
  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    for (const f of (ev[section] || [])) {
      if (!f.imgA && f.a) { f.imgA = lookupImg(f.a, fighterIdx); if (f.imgA) changed = true; }
      if (!f.imgB && f.b) { f.imgB = lookupImg(f.b, fighterIdx); if (f.imgB) changed = true; }
    }
  }

  if ((ev.mainCard    || []).length !== prevMainLen)  changed = true;
  if ((ev.prelims     || []).length !== prevPreLen)   changed = true;
  if ((ev.earlyPrelims|| []).length !== prevEarlyLen) changed = true;

  if (!changed) console.log('  ✅ No changes');
  return changed;
}

async function run() {
  const events  = JSON.parse(fs.readFileSync(EVENTS_PATH,   'utf8'));
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  const fighterIdx = buildFighterIndex(fighters);

  const upcoming = events.filter(e =>
    e.status === 'upcoming' && e.isoDate &&
    new Date(e.isoDate) >= new Date(Date.now() - 2 * 86400000)
  );

  console.log(`Syncing ${upcoming.length} upcoming events…`);

  let totalChanged = 0;
  for (const ev of upcoming) {
    const changed = await syncEvent(ev, fighterIdx);
    if (changed) totalChanged++;
    await sleep(DELAY_MS);
  }

  if (totalChanged > 0) {
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
    fs.writeFileSync(EVENTS_ROOT, JSON.stringify(events, null, 2));
    console.log(`\n✅ Done. Updated ${totalChanged} event(s) — files written.`);
  } else {
    console.log('\n✅ Done. No changes needed.');
  }
}

run().catch(e => { console.error('ufc-event-card-sync failed:', e.message); process.exit(1); });
