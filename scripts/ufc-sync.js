#!/usr/bin/env node
/**
 * ufc-sync.js — Auto-sync UFC events, results, and posters via ESPN API
 *
 * What it does:
 *  1. Fetches all UFC events in a 6-month rolling window from ESPN
 *  2. Marks completed events + writes winner/method/round for every fight
 *  3. Adds new events announced by UFC (skeleton entry with full card)
 *  4. Finds missing poster art by probing UFC CDN URL patterns
 *  5. Syncs newly announced fights onto existing upcoming events (correct section)
 *  6. Detects fights dropped from the ESPN card (sets cancelled:true)
 *  7. Saves both root events.json and data/events.json
 *
 * Method detection from ESPN details array:
 *  "Unofficial Winner Kotko"      → KO/TKO
 *  "Unofficial Winner Submission" → SUB
 *  "Unofficial Winner Decision"   → DEC
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT    = path.join(__dirname, '..');
const EV_ROOT = path.join(ROOT, 'events.json');
const EV_DATA = path.join(ROOT, 'data', 'events.json');

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MMABridge-Sync/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function probeHead(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MMABridge-Sync/1.0' },
    });
    return res.ok;
  } catch { return false; }
}

// ── ESPN helpers ──────────────────────────────────────────────────────────────

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';

async function espnWindow(fromDate, toDate) {
  // fromDate / toDate: 'YYYYMMDD'
  try {
    const data = await getJSON(`${ESPN}?dates=${fromDate}-${toDate}`);
    return data.events || [];
  } catch (e) {
    console.warn(`  ESPN fetch failed (${fromDate}-${toDate}):`, e.message);
    return [];
  }
}

// Fetch 6-month rolling window in 2-month chunks to avoid huge payloads
async function fetchAllESPN() {
  const now   = new Date();
  const chunks = [];
  for (let i = -1; i <= 5; i += 2) {
    const from = new Date(now);
    from.setMonth(from.getMonth() + i);
    const to = new Date(now);
    to.setMonth(to.getMonth() + i + 1);
    const f = from.toISOString().slice(0, 10).replace(/-/g, '');
    const t = to.toISOString().slice(0, 10).replace(/-/g, '');
    chunks.push(espnWindow(f, t));
  }
  const results = await Promise.all(chunks);
  // Deduplicate by ESPN id
  const seen = new Set();
  const all  = [];
  for (const evs of results) {
    for (const ev of evs) {
      if (!seen.has(ev.id)) { seen.add(ev.id); all.push(ev); }
    }
  }
  return all;
}

// ── Method parsing from ESPN details ─────────────────────────────────────────

function parseMethod(competition) {
  const details = competition.details || [];
  for (const d of details) {
    const text = (d.type?.text || '').toLowerCase();
    if (text.includes('unofficial winner')) {
      if (text.includes('kotko'))      return 'KO/TKO';
      if (text.includes('submission')) return 'SUB';
      if (text.includes('decision'))   return 'DEC';
      if (text.includes('nc') || text.includes('no contest')) return 'NC';
      if (text.includes('dq') || text.includes('disqualif'))  return 'DQ';
    }
  }
  return '';
}

// ── Fighter name matching ─────────────────────────────────────────────────────

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function namesMatch(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const minLen = Math.min(na.length, nb.length, 7);
  if (minLen >= 5 && na.slice(0, minLen) === nb.slice(0, minLen)) return true;
  if (na.includes(nb.slice(0, 6)) || nb.includes(na.slice(0, 6))) return true;
  return false;
}

// Find which fight in our event matches ESPN competitors
function findOurFight(ourEv, winnerName, loserName) {
  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    const fights = ourEv[section] || [];
    for (let i = 0; i < fights.length; i++) {
      const f = fights[i];
      if (namesMatch(f.a, winnerName) || namesMatch(f.b, winnerName) ||
          namesMatch(f.a, loserName)  || namesMatch(f.b, loserName)) {
        return { section, index: i, fight: f };
      }
    }
  }
  return null;
}

// ── Event matching ────────────────────────────────────────────────────────────

function findOurEvent(espnEv, ourEvents) {
  const espnDate = (espnEv.date || '').slice(0, 10);

  // 1. Date match (most reliable — UFC only runs one event per day)
  if (espnDate) {
    const byDate = ourEvents.find(e => e.isoDate === espnDate);
    if (byDate) return byDate;
  }

  // 2. Main event fighter name match
  const comps = espnEv.competitions || [];
  const mainComp = comps[comps.length - 1]; // ESPN lists main event last
  if (mainComp) {
    const names = (mainComp.competitors || []).map(c => c.athlete?.displayName || '');
    if (names.length >= 2) {
      const found = ourEvents.find(e => {
        const main = (e.mainCard || [])[0];
        if (!main) return false;
        return (namesMatch(main.a, names[0]) || namesMatch(main.a, names[1])) &&
               (namesMatch(main.b, names[0]) || namesMatch(main.b, names[1]));
      });
      if (found) return found;
    }
  }

  return null;
}

// ── Poster URL guessing ───────────────────────────────────────────────────────

async function findPoster(eventId, isoDate) {
  if (!isoDate) return null;
  const d  = new Date(isoDate + 'T12:00:00Z');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(2);
  const prefix = `${mm}${dd}${yy}`;

  // Try current month and up to 2 months before (UFC uploads posters ahead of time)
  const folders = [];
  for (let offset = 0; offset <= 2; offset++) {
    const m = new Date(d);
    m.setUTCMonth(m.getUTCMonth() - offset);
    const folder = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!folders.includes(folder)) folders.push(folder);
  }

  for (const folder of folders) {
    const url = `https://www.ufc.com/images/styles/background_image_xl_2x/s3/${folder}/${prefix}-${eventId}-EVENT-ART.jpg`;
    if (await probeHead(url)) return url;
  }
  return null;
}

// ── Build a new event skeleton from ESPN data ─────────────────────────────────

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function buildFightFromESPN(comp, slot) {
  // ESPN lists fighter[0] as order:2 (visiting), fighter[1] as order:1 (home) — normalize
  const sorted = [...(comp.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const a = sorted[0]?.athlete?.displayName || sorted[0]?.displayName || '';
  const b = sorted[1]?.athlete?.displayName || sorted[1]?.displayName || '';
  const wc = comp.type?.abbreviation || '';
  return { a, b, weight: wc, rounds: slot === 'main' ? '5 Rds' : '3 Rds', titleFight: false, ranked: false, slot, imgA: '', imgB: '' };
}

async function buildNewEvent(espnEv) {
  const name    = espnEv.name || '';
  const id      = slugify(name);
  const isoDate = (espnEv.date || '').slice(0, 10);
  const venue   = espnEv.venue?.fullName || '';
  const city    = espnEv.venue?.address?.city || '';
  const state   = espnEv.venue?.address?.state || '';
  const country = espnEv.venue?.address?.country || '';
  const location = city ? (state ? `${city}, ${state}` : `${city}, ${country}`) : '';
  const isPPV   = /ufc\s+\d+/i.test(name);

  // ESPN lists fights earliest→latest (early prelims → prelims → main card)
  // Reverse so main event is first, then split into sections by fight count.
  // Typical UFC event: ~5-6 main card, ~5-6 prelims, ~4-5 early prelims
  const comps = [...(espnEv.competitions || [])].reverse(); // now main event first
  const total = comps.length;

  // Calculate section sizes based on total fight count
  let mainCount, prelimCount;
  if (total <= 8) {
    mainCount = Math.min(5, total); prelimCount = total - mainCount;
  } else if (total <= 12) {
    mainCount = isPPV ? 6 : 5; prelimCount = Math.ceil((total - mainCount) * 0.55);
  } else {
    mainCount = isPPV ? 6 : 5; prelimCount = 6;
  }
  const earlyCount = total - mainCount - prelimCount;

  const mainCard     = comps.slice(0, mainCount).map((c, i) =>
    buildFightFromESPN(c, i === 0 ? 'main' : i === 1 ? 'comain' : '')
  );
  const prelims      = comps.slice(mainCount, mainCount + prelimCount).map(c => buildFightFromESPN(c, ''));
  const earlyPrelims = comps.slice(mainCount + prelimCount).map(c => buildFightFromESPN(c, ''));

  const poster = await findPoster(id, isoDate);

  return {
    id, name,
    type: isPPV ? 'PPV' : 'FIGHT NIGHT',
    date: formatDate(isoDate),
    isoDate,
    location,
    venue,
    poster: poster || '',
    status: 'upcoming',
    start_time: null,
    mainCard,
    prelims,
    earlyPrelims,
  };
}

// ── Check if a fight already exists in our event ──────────────────────────────

function fightAlreadyExists(ourEv, nameA, nameB) {
  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    for (const f of (ourEv[section] || [])) {
      if (f.cancelled) continue; // skip dropped fights so replacements can be added
      if (namesMatch(f.a, nameA) || namesMatch(f.b, nameA) ||
          namesMatch(f.a, nameB) || namesMatch(f.b, nameB)) {
        return true;
      }
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🥊 MMA Bridge — UFC Sync\n');

  const ourEvents = JSON.parse(fs.readFileSync(EV_DATA, 'utf8'));
  const changes   = [];

  console.log('Fetching events from ESPN...');
  const espnEvents = await fetchAllESPN();
  console.log(`ESPN returned ${espnEvents.length} events\n`);

  for (const espnEv of espnEvents) {
    const isCompleted = espnEv.status?.type?.completed === true;
    const espnDate    = (espnEv.date || '').slice(0, 10);
    const ourEv       = findOurEvent(espnEv, ourEvents);

    // ── A: RESULTS — completed event we haven't marked done yet ───────────────
    if (isCompleted && ourEv && ourEv.status !== 'completed') {
      console.log(`📋 Syncing results: ${espnEv.name}`);
      let updated = 0;

      for (const comp of (espnEv.competitions || [])) {
        if (!comp.status?.type?.completed) continue;

        const winner = (comp.competitors || []).find(c => c.winner);
        const loser  = (comp.competitors || []).find(c => !c.winner);
        if (!winner) continue;

        const winnerName = winner.athlete?.displayName || '';
        const loserName  = loser?.athlete?.displayName  || '';
        const method     = parseMethod(comp);
        const round      = method === 'DEC' ? null : (comp.status?.period || null);

        const hit = findOurFight(ourEv, winnerName, loserName);
        if (!hit) {
          console.log(`  ⚠ No fight match for ${winnerName} vs ${loserName}`);
          continue;
        }

        const fight = ourEv[hit.section][hit.index];
        if (!fight.winner) {
          fight.winner = winnerName;
          if (method) fight.method = method;
          if (round)  fight.round  = round;
          console.log(`  ✓ ${winnerName} def. ${loserName} — ${method || '?'} R${round || '?'}`);
          updated++;
        }
      }

      if (updated > 0) {
        ourEv.status = 'completed';
        changes.push(`Results: ${espnEv.name} (${updated} fights)`);
      }
    }

    // ── B: NEW EVENT — not in our JSON yet ────────────────────────────────────
    if (!ourEv && !isCompleted && espnDate) {
      console.log(`🆕 New event: ${espnEv.name} (${espnDate})`);
      const newEv = await buildNewEvent(espnEv);

      const insertAt = ourEvents.findIndex(e => (e.isoDate || '') > espnDate);
      if (insertAt >= 0) ourEvents.splice(insertAt, 0, newEv);
      else ourEvents.push(newEv);

      changes.push(`New event: ${espnEv.name}`);
    }

    // ── C: POSTER — upcoming event missing its poster ─────────────────────────
    if (!isCompleted && ourEv && !ourEv.poster) {
      console.log(`🎨 Searching poster: ${ourEv.name}`);
      const poster = await findPoster(ourEv.id, ourEv.isoDate);
      if (poster) {
        ourEv.poster = poster;
        console.log(`  ✓ Found: ${poster}`);
        changes.push(`Poster: ${ourEv.name}`);
      }
    }

    // ── D: DROPPED FIGHTS — detect first so replacements can be added in step E ─
    if (!isCompleted && ourEv) {
      const espnNames = new Set();
      for (const comp of (espnEv.competitions || [])) {
        for (const c of (comp.competitors || [])) {
          const n = c.athlete?.displayName || c.displayName || '';
          if (n) espnNames.add(n.toLowerCase().replace(/[^a-z]/g,''));
        }
      }

      let dropped = 0;
      for (const sec of ['mainCard', 'prelims', 'earlyPrelims']) {
        for (const fight of (ourEv[sec] || [])) {
          if (fight.cancelled) continue;
          const aKey = fight.a.toLowerCase().replace(/[^a-z]/g,'');
          const bKey = fight.b.toLowerCase().replace(/[^a-z]/g,'');
          // Only flag if ESPN has the event with fights but neither fighter appears
          if (espnNames.size > 0 && !espnNames.has(aKey) && !espnNames.has(bKey)) {
            fight.cancelled = true;
            console.log(`  ⚠ Fight dropped: ${fight.a} vs ${fight.b} (not in ESPN)`);
            dropped++;
          }
        }
      }

      if (dropped > 0) changes.push(`Dropped fights flagged: ${ourEv.name} (${dropped})`);
    }

    // ── E: CARD UPDATE — new fights / replacements for an upcoming event ───────
    if (!isCompleted && ourEv) {
      // ESPN lists fights earliest→latest, reverse to get main card first
      const compsRev = [...(espnEv.competitions || [])].reverse();
      const total    = compsRev.length;
      const isPPVev  = /ufc\s+\d+/i.test(espnEv.name || '');

      // Determine section boundaries (same logic as buildNewEvent)
      let mc, pc;
      if (total <= 8)       { mc = Math.min(5, total); pc = total - mc; }
      else if (total <= 12) { mc = isPPVev ? 6 : 5;   pc = Math.ceil((total - mc) * 0.55); }
      else                  { mc = isPPVev ? 6 : 5;   pc = 6; }

      let added = 0;
      compsRev.forEach((comp, idx) => {
        const sorted = [...(comp.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        const a = sorted[0]?.athlete?.displayName || '';
        const b = sorted[1]?.athlete?.displayName || '';
        if (!a || !b) return;
        if (fightAlreadyExists(ourEv, a, b)) return; // skips cancelled, so replacements get added

        // Assign to section based on ESPN position
        const section = idx < mc ? 'mainCard' : idx < mc + pc ? 'prelims' : 'earlyPrelims';
        const slot    = idx === 0 ? 'main' : idx === 1 ? 'comain' : '';
        const fight   = buildFightFromESPN(comp, slot);
        ourEv[section] = ourEv[section] || [];
        ourEv[section].push(fight);
        console.log(`  + New fight (${section}): ${a} vs ${b}`);
        added++;
      });

      if (added > 0) changes.push(`Card update: ${ourEv.name} (+${added} fights)`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  if (changes.length === 0) {
    console.log('\n✅ All up to date — no changes');
    return;
  }

  console.log(`\n✅ Changes (${changes.length}):`);
  changes.forEach(c => console.log(`  • ${c}`));

  const json = JSON.stringify(ourEvents, null, 2);
  fs.writeFileSync(EV_ROOT, json, 'utf8');
  fs.writeFileSync(EV_DATA, json, 'utf8');
  console.log('\n💾 Saved events.json (root + data/)');

  // Pass to GitHub Actions step output
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${changes.join(' | ')}\n`);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
