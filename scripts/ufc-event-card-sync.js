#!/usr/bin/env node
/**
 * ufc-event-card-sync.js
 * Scrapes UFC.com event pages to keep data/events.json current:
 *   - Adds newly announced fights (main card, prelims, early prelims)
 *   - Removes fights whose pairing is no longer on the UFC.com card (fighter
 *     pulled out / replaced) and re-homes a vacated slot ("main"/"comain")
 *     onto the replacement fight, renaming the event if the main event changed
 *   - Sets start_time from broadcast timestamp
 *   - Fills imgA/imgB from data/fighters.json name lookup
 *   - Sets titleFight and ranked flags
 * Preserves all manually-set fields (slot, winner, method, round, time).
 * Never touches a fight that already has a `winner` (judged results are final).
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

// UFC.com renders an unannounced-opponent slot as literal "TBA" text (often
// "Opponent TBA"). That's a placeholder, not a fighter — it must never be
// scraped in as a real fight, merged into the card, or logged as a pull-out
// when it later disappears (that produced the "Opponent TBA vs TBA — removed
// from the card" junk banner users were seeing on live events).
function isTBA(name) {
  return !name || /\bTBA\b/i.test(name);
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
    if (isTBA(nameA) || isTBA(nameB)) continue; // unannounced-opponent placeholder, not a real fight

    // Check ranked (any corner rank div has content like "#3")
    const hasRank = /#\d/.test(redChunk) || /#\d/.test(blueChunk);

    fights.push({ a: nameA, b: nameB, weight, titleFight, ranked: hasRank });
  }

  return fights;
}

function parseStartTime(html) {
  // UFC.com's event page carries one broadcaster-time block per card segment
  // (Main Card, Prelims, and — on PPVs — Early Prelims), each using this same
  // class, listed in the DOM in latest-to-earliest order (Main Card first).
  // Taking only the first match (the old behavior) silently returned the
  // Main Card start every time — which is why the site's countdown and pick
  // lock were keying off the main event's start instead of the actual first
  // fight of the night, hours earlier. Take the EARLIEST of every timestamp
  // found instead, whatever segment that turns out to be.
  const matches = [...html.matchAll(/c-event-fight-card-broadcaster__time[^>]*data-timestamp="(\d+)"/g)];
  if (!matches.length) return null;
  const earliest = Math.min(...matches.map(m => parseInt(m[1], 10)));
  return new Date(earliest * 1000).toISOString();
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

// Does `name` appear in either corner of any fight in `fights`? Used to tell
// "this fighter is still on the card, just against someone new" (pull-out
// replacement) apart from "this fighter is gone entirely" (fight cancelled).
function hasFighter(name, fights) {
  const n = norm(name), sn = lastName(name);
  return fights.some(f => {
    if (norm(f.a) === n || norm(f.b) === n) return true;
    return !!sn && (lastName(f.a) === sn || lastName(f.b) === sn);
  });
}

// "Khalil Rountree Jr." → "Rountree Jr." (keeps generational suffixes attached)
function titleLastName(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return name || '';
  const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
  const last = words[words.length - 1];
  if (words.length >= 2 && suffixes.has(last.toLowerCase().replace(/\.$/, ''))) {
    return `${words[words.length - 2]} ${last}`;
  }
  return last;
}

function mergeFights(existing, fromUFC, fighterIdx, newlyAdded) {
  const result = [...existing];

  for (const ufcFight of fromUFC) {
    const match = result.find(f => fightsMatch(f, ufcFight));
    if (match) {
      // Update fields we're allowed to update.
      // fighters.json (fighterIdx) is the freshly-maintained source of truth for
      // headshots — always defer to it over whatever's cached on the fight, since
      // UFC's CDN periodically retires old image paths (they 403) and a
      // fill-only-if-blank rule would let that stale, dead link sit forever.
      const freshImgA = lookupImg(match.a, fighterIdx);
      const freshImgB = lookupImg(match.b, fighterIdx);
      if (freshImgA && freshImgA !== match.imgA) match.imgA = freshImgA;
      if (freshImgB && freshImgB !== match.imgB) match.imgB = freshImgB;
      if (ufcFight.titleFight) match.titleFight = true;
      if (ufcFight.ranked)     match.ranked = true;
      // Title fights and main events are always scheduled for 5 rounds.
      if ((match.titleFight || match.slot === 'main') && match.rounds !== '5 Rds') {
        match.rounds = '5 Rds';
      }
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
      if (newlyAdded) { if (ufcFight.a) newlyAdded.push(ufcFight.a); if (ufcFight.b) newlyAdded.push(ufcFight.b); }
    }
  }

  return result;
}

// ── Notify users who favorited a fighter now confirmed on a card ──
// Silent no-op if INTERNAL_SECRET isn't configured (e.g. local dev runs).
async function notifyFavFighters(fighters, eventName, eventId) {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret || !fighters.length) return;
  try {
    const res = await fetch('https://mmabridge-backend.onrender.com/api/push/announce-fighters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ fighters, eventName, eventId }),
    });
    if (res.ok) console.log(`  🔔 Notified fav-fighter subscribers for ${eventName}`);
    else console.warn(`  ⚠️  announce-fighters returned ${res.status}`);
  } catch (e) {
    console.warn(`  ⚠️  announce-fighters call failed: ${e.message}`);
  }
}

// Resync imgA/imgB on every fight in the event against fighters.json — always
// on, whether or not UFC.com's own event page exists yet. A brand-new event
// discovered via ESPN (ufc-sync.js) is created with blank images and
// otherwise only gets backfilled once UFC.com publishes its fight-card page,
// which can lag by days/weeks — this runs independent of that gate so photos
// show up as soon as fighters.json has them, not once UFC.com catches up.
function syncImages(ev, fighterIdx) {
  let changed = false;
  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    for (const f of (ev[section] || [])) {
      if (f.a) { const img = lookupImg(f.a, fighterIdx); if (img && img !== f.imgA) { f.imgA = img; changed = true; } }
      if (f.b) { const img = lookupImg(f.b, fighterIdx); if (img && img !== f.imgB) { f.imgB = img; changed = true; } }
    }
  }
  return changed;
}

// Enforce that 'main' sits at mainCard[0] and 'comain' at mainCard[1], with
// no stray duplicate of either label elsewhere. The render layer (events.html
// / picks.js) trusts f.slot directly, not array position — so the vacated-slot
// handoff above (target.slot = slot) was only half the fix: it correctly
// relabels the replacement fight but never moves it, so a fight that inherited
// "main" from a pulled-out fighter's opponent could sit anywhere in the array
// while the actual header/ordering UI (which assumes index 0/1) still looked
// at whatever was physically first. This is what actually produced the
// Yair Rodriguez → Jose Miguel Delgado bug (2026-08-22): the real reason
// wasn't a name-matching miss, it was this exact position/label mismatch.
// Idempotent, safe to run every sync regardless of whether anything changed.
function normalizeMainCardSlots(ev) {
  const mc = ev.mainCard || [];
  if (mc.length < 2) return false;
  let changed = false;

  const mainIdx = mc.findIndex(f => f.slot === 'main');
  if (mainIdx > 0) { mc.unshift(mc.splice(mainIdx, 1)[0]); changed = true; }
  mc.forEach((f, i) => { if (i !== 0 && f.slot === 'main') { f.slot = ''; changed = true; } });

  const comainIdx = mc.findIndex(f => f.slot === 'comain');
  if (comainIdx > 1) { mc.splice(1, 0, mc.splice(comainIdx, 1)[0]); changed = true; }
  mc.forEach((f, i) => { if (i !== 1 && f.slot === 'comain') { f.slot = ''; changed = true; } });

  ev.mainCard = mc;
  return changed;
}

// A fight carrying manualOverride was entered from a source more current
// than UFC.com's own page (e.g. breaking pull-out news UFC.com hasn't
// published yet) — this exists because that exact scenario played out
// live on 2026-08-23: UFC.com's page still listed Yair Rodriguez after he
// was confirmed out, so the pull-out reconciliation below (correctly, by
// its own logic) reverted Jose Miguel Delgado's replacement fight straight
// back to Rodriguez the next time it ran. Skip reconciliation for the
// whole event while any fight on it is flagged, rather than resolving
// per-fight — a card change is rarely isolated to one bout's neighbors,
// and half-applying UFC.com's version while the other half stays manual
// is worse than just waiting. Clear manualOverride once UFC.com catches up.
function hasManualOverride(ev) {
  return ['mainCard', 'prelims', 'earlyPrelims'].some(s => (ev[s] || []).some(f => f.manualOverride));
}

async function syncEvent(ev, fighterIdx) {
  if (hasManualOverride(ev)) {
    console.log(`\n📋 ${ev.name} — skipped (manualOverride set on a fight, not reconciling against UFC.com yet)`);
    return false;
  }

  const slug = deriveUfcSlug(ev.id, ev.isoDate);
  const url  = `https://www.ufc.com/event/${slug}`;
  console.log(`\n📋 ${ev.name} → ${url}`);

  const html = await fetchPage(url);
  if (!html) {
    console.log('  ⚠️  Could not fetch page');
    return syncImages(ev, fighterIdx);
  }

  if (!html.includes('c-listing-fight__corner--red')) {
    console.log('  ⚠️  No fight card found on page');
    return syncImages(ev, fighterIdx);
  }

  const ufcMain      = parseSection(html, 'main-card');
  const ufcPrelims   = parseSection(html, 'prelims-card');
  const ufcEarlyPre  = parseSection(html, 'early-prelims');

  console.log(`  UFC.com: ${ufcMain.length} main / ${ufcPrelims.length} prelims / ${ufcEarlyPre.length} early prelims`);

  const startTime = parseStartTime(html);

  let changed = false;

  // start_time — keep re-syncing from UFC.com's broadcaster timestamp on every
  // run (not just the first time we see it) so a later schedule change on
  // UFC.com's end corrects our stored value instead of freezing it stale.
  // Only while the event hasn't happened yet — once it's completed the
  // broadcast time is history, not something to keep overwriting.
  if (startTime && ev.status !== 'completed' && startTime !== ev.start_time) {
    ev.start_time = startTime;
    console.log(`  ⏰ start_time synced: ${startTime}`);
    changed = true;
  }

  // Merge each section
  const prevMainLen   = (ev.mainCard    || []).length;
  const prevPreLen    = (ev.prelims     || []).length;
  const prevEarlyLen  = (ev.earlyPrelims|| []).length;

  // ── Pull-out detection ──────────────────────────────────────────────
  // mergeFights() only ever adds/updates fights, so a withdrawn fighter's
  // old pairing would otherwise sit stale forever while the replacement
  // gets bolted on as a duplicate unslotted fight. Remove any existing fight
  // whose pairing no longer appears anywhere on the fresh UFC.com card, and
  // remember the slot (main/comain) so it can be handed to the replacement.
  const freshBySection = { mainCard: ufcMain, prelims: ufcPrelims, earlyPrelims: ufcEarlyPre };
  const allFresh = [...ufcMain, ...ufcPrelims, ...ufcEarlyPre];
  const vacatedSlots = [];

  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    const fresh = freshBySection[section];
    if (!fresh.length) continue; // empty scrape = likely a fetch/parse hiccup, not "card is empty" — skip
    const kept = [];
    for (const f of (ev[section] || [])) {
      if (f.winner) { kept.push(f); continue; } // judged fights are final, never touched
      if (fresh.some(uf => fightsMatch(f, uf))) { kept.push(f); continue; } // still the current pairing

      const aStill = hasFighter(f.a, allFresh);
      const bStill = hasFighter(f.b, allFresh);
      if (aStill || bStill) {
        const survivor = aStill ? f.a : f.b;
        const droppedOut = aStill ? f.b : f.a;
        console.log(`    🔁 Pull-out: ${droppedOut} is out, ${survivor} has a new opponent (was: ${f.a} vs ${f.b}${f.slot ? `, slot="${f.slot}"` : ''})`);
        if (f.slot) vacatedSlots.push({ slot: f.slot, survivor });
      } else if (isTBA(f.a) || isTBA(f.b)) {
        // Leftover "Opponent TBA vs TBA" placeholder from before this guard existed —
        // just drop it silently, it was never a real fight and isn't real news.
        console.log(`    🧹 Discarding stale TBA placeholder: ${f.a} vs ${f.b}`);
      } else {
        console.log(`    ⚠️  Fight no longer on card, no replacement found: ${f.a} vs ${f.b}${f.slot ? ` (was slot="${f.slot}" — needs manual review)` : ''}`);
        ev.droppedFights = ev.droppedFights || [];
        const alreadyNoted = ev.droppedFights.some(d => fightsMatch(d, f));
        if (!alreadyNoted) {
          ev.droppedFights.push({ a: f.a, b: f.b, reason: 'removed from the card', droppedAt: new Date().toISOString() });
        }
      }
      changed = true; // dropped either way — don't carry stale fights forward
    }
    ev[section] = kept;
  }

  const newlyAdded = [];
  if (ufcMain.length)     ev.mainCard     = mergeFights(ev.mainCard    || [], ufcMain,     fighterIdx, newlyAdded);

  // Build sets of fighters already placed in higher sections so we don't re-add them lower
  const mainFighters = new Set((ev.mainCard || []).flatMap(f => [norm(f.a), norm(f.b)]));
  const notInMain = f => !mainFighters.has(norm(f.a)) && !mainFighters.has(norm(f.b));

  if (ufcPrelims.length)  ev.prelims      = mergeFights(ev.prelims     || [], ufcPrelims.filter(notInMain),  fighterIdx, newlyAdded);
  const presFighters = new Set((ev.prelims || []).flatMap(f => [norm(f.a), norm(f.b)]));
  const notInPres = f => notInMain(f) && !presFighters.has(norm(f.a)) && !presFighters.has(norm(f.b));
  if (ufcEarlyPre.length) ev.earlyPrelims = mergeFights(ev.earlyPrelims|| [], ufcEarlyPre.filter(notInPres), fighterIdx, newlyAdded);

  if (newlyAdded.length) await notifyFavFighters(newlyAdded, ev.name, ev.id);

  // Also clean existing fights that may have moved up sections
  ev.prelims      = (ev.prelims     || []).filter(notInMain);
  ev.earlyPrelims = (ev.earlyPrelims|| []).filter(f => notInMain(f) && !presFighters.has(norm(f.a)) && !presFighters.has(norm(f.b)));

  // ── Hand vacated slots to the replacement fight ─────────────────────
  // The withdrawn fighter's old fight is gone (removed above); the survivor's
  // new pairing was just added above as an unslotted fight by mergeFights().
  // Find it and give it the vacated slot label. If "main" moved, rename the
  // event to match — but only here, never as a general reconciliation check,
  // so deliberate naming (e.g. rematch "2" suffixes) is never fought.
  for (const { slot, survivor } of vacatedSlots) {
    const target = ['mainCard', 'prelims', 'earlyPrelims']
      .flatMap(s => ev[s] || [])
      .find(f => !f.slot && hasFighter(survivor, [f]));
    if (!target) {
      console.log(`    ⚠️  No replacement fight found for vacated slot="${slot}" (survivor: ${survivor}) — needs manual review.`);
      continue;
    }
    target.slot = slot;
    console.log(`    ➡️  Slot "${slot}" reassigned to ${target.a} vs ${target.b}`);
    changed = true;
    if (slot === 'main') {
      // Preserve the event's existing brand prefix (e.g. "UFC 331:", "Noche UFC:",
      // "UFC Fight Night:") — only fall back to "UFC Fight Night:" when the name
      // has no colon-delimited prefix at all. A hardcoded "UFC Fight Night:" here
      // would silently rebrand a Noche/other special-series event on a pull-out.
      const prefixMatch = ev.name.match(/^([^:]+):/);
      const prefix = prefixMatch ? `${prefixMatch[1]}:` : 'UFC Fight Night:';
      const newName = `${prefix} ${titleLastName(target.a)} vs. ${titleLastName(target.b)}`;
      if (newName !== ev.name) {
        console.log(`    ✏️  Event renamed: "${ev.name}" → "${newName}"`);
        ev.name = newName;
        changed = true;
      }
      // A main-event slot is always scheduled for 5 rounds, title fight or not.
      if (target.rounds !== '5 Rds') {
        target.rounds = '5 Rds';
        changed = true;
      }
    }
  }

  if (normalizeMainCardSlots(ev)) changed = true;

  if (syncImages(ev, fighterIdx)) changed = true;

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
