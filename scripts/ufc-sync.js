#!/usr/bin/env node
/**
 * ufc-sync.js — Auto-sync UFC events, results, and posters via ESPN API
 *
 * What it does:
 *  1. Fetches all UFC events in a 6-month rolling window from ESPN
 *  2. Marks completed events + writes winner/method/round for every fight,
 *     and pushes each graded result straight into Supabase (fight_results)
 *     via the admin API — this is what the site's live-update pipeline
 *     (Supabase Realtime on leaderboard.js/picks.js) actually reacts to,
 *     so results go live automatically with no manual admin.html entry
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

import fs     from 'fs';
import path   from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Notify users who favorited a fighter now appearing on a card ──
// Silent no-op if INTERNAL_SECRET isn't configured (e.g. local dev runs).
async function notifyFavFighters(ev) {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return;
  const fighters = [];
  for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
    for (const f of (ev[section] || [])) {
      if (f.a) fighters.push(f.a);
      if (f.b) fighters.push(f.b);
    }
  }
  if (!fighters.length) return;
  try {
    const res = await fetch('https://mmabridge-backend.onrender.com/api/push/announce-fighters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
      body: JSON.stringify({ fighters, eventName: ev.name, eventId: ev.id }),
    });
    if (res.ok) console.log(`  🔔 Notified fav-fighter subscribers for ${ev.name}`);
    else console.warn(`  ⚠️  announce-fighters returned ${res.status}`);
  } catch (e) {
    console.warn(`  ⚠️  announce-fighters call failed: ${e.message}`);
  }
}

// ── Push a graded result straight into Supabase (fight_results) ───────────
// Reuses the exact same admin-panel endpoint (and its existing HMAC-token
// auth) that a human would otherwise have to hit by hand in admin.html —
// no new backend route, no new secret. This is what makes results actually
// live-update on the site (leaderboard.js/picks.js subscribe to this table
// via Supabase Realtime) instead of only updating the static JSON, which
// nothing watches for changes at runtime. Silent no-op if ADMIN_PASSWORD
// isn't configured (e.g. local dev runs) — the static JSON write still
// happens either way, so nothing is lost, results just won't go live until
// the next scheduled static-file deploy in that case.
function adminToken() {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('mma-bridge-admin-session').digest('hex');
}
async function pushResultToSupabase(eventId, fightKey, winner, method, round) {
  const token = adminToken();
  if (!token) return;
  try {
    const res = await fetch('https://mmabridge-backend.onrender.com/api/admin/set-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, event_id: eventId, fight_key: fightKey, winner, method, round: round || null }),
    });
    if (!res.ok) console.warn(`  ⚠️  set-result returned ${res.status} for ${eventId}:${fightKey}`);
  } catch (e) {
    console.warn(`  ⚠️  set-result call failed: ${e.message}`);
  }
}

// ── Wake the backend's tight live-result poller ────────────────────────────
// Fire-and-forget — a failed wake call just means live updates stay on this
// script's own cron cadence instead of the tighter ~60s backend poll, not a
// hard failure. Silent no-op if INTERNAL_SECRET isn't configured.
async function wakeLivePoll() {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return;
  try {
    const res = await fetch('https://mmabridge-backend.onrender.com/api/admin/wake-live-poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
    });
    if (res.ok) console.log('  ⏱️  Woke live-result poller');
    else console.warn(`  ⚠️  wake-live-poll returned ${res.status}`);
  } catch (e) {
    console.warn(`  ⚠️  wake-live-poll call failed: ${e.message}`);
  }
}

const ROOT      = path.join(__dirname, '..');
const EV_ROOT   = path.join(ROOT, 'events.json');
const EV_DATA   = path.join(ROOT, 'data', 'events.json');
const FTR_DATA  = path.join(ROOT, 'data', 'fighters.json');

// ── Keep fighter resumes (last5) in sync with graded results ──────────────
// Without this, a fighter's "recent fights" list only updates whenever the
// separate weekly Wikipedia/UFC.com scrape happens to catch up — which can
// lag real results by months (verified: 573 of 664 checkable fights were
// missing from resumes as of 2026-07-16). This makes the site's own graded
// result the source of truth for last5 the moment it's entered here.
// (normName is defined further down in this file — reused here too.)

const METHOD_EXPAND = { TKO: 'TKO', KO: 'KO', SUB: 'Sub', UD: 'Decision (unanimous)', MD: 'Decision (majority)', SD: 'Decision (split)', DEC: 'Decision (unanimous)' };

function appendLast5(fighters, byNormName, selfName, oppName, result, method, round, time, eventName) {
  const fighter = byNormName[normName(selfName)];
  if (!fighter) return false;
  if (!fighter.last5) fighter.last5 = [];
  const already = fighter.last5.some(l5 => normName(l5.opponent) === normName(oppName) && l5.event === eventName);
  if (already) return false;
  fighter.last5.unshift({
    opponent: oppName, result,
    method: METHOD_EXPAND[method] || method || '',
    event: eventName, round: round || null, time: time || null,
  });
  return true;
}

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

// Fetch 6-month rolling window in 2-month chunks to avoid huge payloads.
// Each chunk MUST span 2 months (i to i+2), not 1 (i to i+1) — the latter
// was the bug: with i stepping by 2 (-1,1,3,5) but each window only 1
// month wide, every other month was never fetched at all (e.g. today the
// windows were Jul17-Aug17, Sep17-Oct17, Nov17-Dec17 — Oct17-Nov17 fell
// through entirely, silently dropping any event announced in that gap,
// which is exactly how UFC 333 (Oct 24) went unnoticed for weeks despite
// ESPN already having its full fight card).
async function fetchAllESPN() {
  const now   = new Date();
  const chunks = [];
  for (let i = -1; i <= 5; i += 2) {
    const from = new Date(now);
    from.setMonth(from.getMonth() + i);
    const to = new Date(now);
    to.setMonth(to.getMonth() + i + 2);
    const f = from.toISOString().slice(0, 10).replace(/-/g, '');
    const t = to.toISOString().slice(0, 10).replace(/-/g, '');
    chunks.push(espnWindow(f, t));
  }
  const results = await Promise.all(chunks);
  // Deduplicate by ESPN id
  const seen = new Set();
  const byId  = [];
  for (const evs of results) {
    for (const ev of evs) {
      if (!seen.has(ev.id)) { seen.add(ev.id); byId.push(ev); }
    }
  }

  // ESPN has been observed to serve multiple distinct event objects (different
  // ids) for the same real-world card while its lineup is still being
  // announced in batches — each with a different partial roster. Since our
  // own matching is by date, every one of those maps to the same local
  // event, and processing them as separate passes caused a real bug: one
  // pass would add fights the OTHER pass's roster didn't know about, and
  // that pass would immediately flag them "missing". Merge same-date
  // entries into one combined roster (competitions dedup'd by the pair of
  // competitor ids) so the rest of the script only ever sees one, complete
  // event per real-world date.
  const byDate = new Map();
  for (const ev of byId) {
    const date = (ev.date || '').slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) { byDate.set(date, ev); continue; }
    const merged = byDate.get(date);
    const seenComps = new Set(
      (merged.competitions || []).map(c => (c.competitors || []).map(x => x.id).sort().join('-'))
    );
    for (const comp of (ev.competitions || [])) {
      const key = (comp.competitors || []).map(x => x.id).sort().join('-');
      if (!seenComps.has(key)) { merged.competitions = merged.competitions || []; merged.competitions.push(comp); seenComps.add(key); }
    }
    // Prefer whichever object reports the event as completed
    if (ev.status?.type?.completed) merged.status = ev.status;
  }
  return [...byDate.values()];
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

// `slugs` — one or more candidate filename slugs to try, most likely first.
// UFC's EVENT-ART filenames are matchup-based ("...-silva-vs-delgado-..."),
// not tied to our internal event id — so passing only the id silently stops
// matching the moment a main event changes (pull-out/replacement) after the
// id was set, or for ids we mint ourselves that were never matchup-shaped
// (e.g. location-based ids like "ufc-fight-night-paris"). Callers should also
// pass a slug built from the current main-event matchup so poster discovery
// keeps working through a card change, not just at event creation.
async function findPoster(slugs, isoDate) {
  if (!isoDate) return null;
  const candidates = (Array.isArray(slugs) ? slugs : [slugs]).filter(Boolean);
  if (!candidates.length) return null;

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

  for (const eventId of candidates) {
    for (const folder of folders) {
      const url = `https://www.ufc.com/images/styles/background_image_xl_2x/s3/${folder}/${prefix}-${eventId}-EVENT-ART.jpg`;
      if (await probeHead(url)) return url;
    }
  }
  return null;
}

// Build the "fighter-vs-fighter" slug UFC actually names poster files after,
// from a fight's current a/b — e.g. {a:'Jean Silva', b:'Jose Delgado'} → "silva-vs-delgado".
function matchupSlug(fight) {
  if (!fight || !fight.a || !fight.b) return null;
  const last = n => slugify((n || '').trim().split(/\s+/).pop());
  const la = last(fight.a), lb = last(fight.b);
  return la && lb ? `${la}-vs-${lb}` : null;
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

function roundsFromESPN(comp, slot) {
  // ESPN reports the real scheduled round count per fight (format.regulation.periods)
  // — some co-mains (and occasionally other slots) are scheduled 5 rounds despite
  // not being a title fight or the literal main event, so guessing purely by slot
  // position is wrong. Trust ESPN's number when present; only fall back to the
  // slot-based guess if it's missing.
  const periods = comp?.format?.regulation?.periods;
  if (periods === 3 || periods === 5) return `${periods} Rds`;
  return slot === 'main' ? '5 Rds' : '3 Rds';
}

// ESPN's own scoreboard lists an unannounced-opponent slot with a literal
// "TBA" / "Opponent TBA" competitor name — not a real fighter. Letting that
// through produced ghost fights (some landing in the main/co-main slot) and
// nonsense "pull-out" notifications once the placeholder later disappeared.
function isTBA(name) { return !name || /\bTBA\b/i.test(name); }

function buildFightFromESPN(comp, slot) {
  // ESPN lists fighter[0] as order:2 (visiting), fighter[1] as order:1 (home) — normalize
  const sorted = [...(comp.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const a = sorted[0]?.athlete?.displayName || sorted[0]?.displayName || '';
  const b = sorted[1]?.athlete?.displayName || sorted[1]?.displayName || '';
  const wc = comp.type?.abbreviation || '';
  return { a, b, weight: wc, rounds: roundsFromESPN(comp, slot), titleFight: false, ranked: false, slot, imgA: '', imgB: '' };
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
  // Drop unannounced-opponent ("TBA") placeholder slots before any of this —
  // filtering after slot-assignment would let one sitting first in ESPN's
  // list steal the "main" slot label out from under the real main event.
  const comps = [...(espnEv.competitions || [])].reverse().filter(c => {
    const sorted = [...(c.competitors || [])].sort((x, y) => (x.order || 0) - (y.order || 0));
    const a = sorted[0]?.athlete?.displayName || sorted[0]?.displayName || '';
    const b = sorted[1]?.athlete?.displayName || sorted[1]?.displayName || '';
    return !isTBA(a) && !isTBA(b);
  }); // now main event first
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

  const poster = await findPoster([id, matchupSlug(mainCard[0])], isoDate);

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

  const fighters     = JSON.parse(fs.readFileSync(FTR_DATA, 'utf8'));
  const byNormName   = {};
  fighters.forEach(f => { byNormName[normName(f.name)] = f; });
  let last5Added = 0;

  console.log('Fetching events from ESPN...');
  const espnEvents = await fetchAllESPN();
  console.log(`ESPN returned ${espnEvents.length} events\n`);

  const todayStr = new Date().toISOString().slice(0, 10);
  let wokeLivePoll = false;

  for (const espnEv of espnEvents) {
    // Dana White's Contender Series is deliberately not tracked — decided
    // it's not worth covering (no picks/reviews/leaderboard value the way
    // PPV/Fight Night cards have), and its ESPN feed entries were also the
    // source of a repeated runaway-duplication bug (500+ phantom fight
    // entries on a single event, several times). Skip before any of the
    // new-event/results/poster logic below even looks at it.
    if (/contender series/i.test(espnEv.name || '')) continue;

    const isCompleted = espnEv.status?.type?.completed === true;
    const espnDate    = (espnEv.date || '').slice(0, 10);
    const ourEv       = findOurEvent(espnEv, ourEvents);

    // Card's live today — wake the backend's tight ~60s ESPN poller so
    // results land in Supabase within a minute instead of waiting on this
    // script's own ~15min cron interval. Idempotent on the backend side,
    // but only worth calling once per run either way.
    if (!wokeLivePoll && ourEv && ourEv.status !== 'completed' && espnDate === todayStr) {
      wokeLivePoll = true;
      await wakeLivePoll();
    }

    // ── A0: ROUNDS — correct any fight's round count against ESPN's real
    // format.regulation.periods, for every fight on every upcoming event,
    // every run — not just new ones. Catches cases like a non-title 5-round
    // co-main that got created before this field was read, or a card change
    // that flips a fight's round count after the fact.
    //
    // ESPN has been observed to serve conflicting periods values for the
    // SAME fight across the multiple partial-roster event objects that get
    // merged into one (see the merge comment in fetchAllESPN) — an early,
    // incomplete snapshot defaulting to 3 rounds alongside a later, correct
    // 5-round entry. Collect every match per fight and take the max rather
    // than whichever one happens to be encountered last, so this can't
    // flip-flop or settle on the wrong value depending on array order. ────
    if (ourEv && ourEv.status !== 'completed') {
      const bestRounds = new Map(); // "section-index" -> highest periods seen this run
      for (const comp of (espnEv.competitions || [])) {
        const competitors = (comp.competitors || []).map(c => c.athlete?.displayName || c.displayName || '');
        if (competitors.length < 2) continue;
        const hit = findOurFight(ourEv, competitors[0], competitors[1]);
        if (!hit) continue;
        const key = `${hit.section}-${hit.index}`;
        const periods = comp?.format?.regulation?.periods;
        const rounds = (periods === 3 || periods === 5) ? periods : null;
        if (rounds === null) continue; // no real ESPN signal — leave existing/slot-guess value alone
        const prev = bestRounds.get(key);
        if (prev === undefined || rounds > prev) bestRounds.set(key, rounds);
      }
      for (const [key, rounds] of bestRounds) {
        const [section, idxStr] = key.split(/-(?=\d+$)/);
        const idx = parseInt(idxStr, 10);
        const fight = ourEv[section]?.[idx];
        if (!fight) continue;
        const correctRounds = `${rounds} Rds`;
        if (correctRounds !== fight.rounds) {
          console.log(`  🔢 Round count corrected: ${fight.a} vs ${fight.b} — ${fight.rounds || '?'} → ${correctRounds}`);
          fight.rounds = correctRounds;
          changes.push(`Rounds corrected: ${fight.a} vs ${fight.b} (${ourEv.name})`);
        }
      }
    }

    // ── A: RESULTS — enter any individually-completed fight's result as soon
    // as ESPN reports it, rather than waiting for ESPN's own aggregate
    // event.status.type.completed flag, which has been observed to lag
    // behind (and occasionally flap independently of) individual fight
    // completions. Only flip our own event status to "completed" once
    // every one of our fights actually has a result — that's a fact we can
    // derive ourselves, not something we need to trust a single upstream
    // flag for. ────────────────────────────────────────────────────────────
    if (ourEv && ourEv.status !== 'completed') {
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

          if (appendLast5(fighters, byNormName, winnerName, loserName, 'W', method, round, fight.time, ourEv.name)) last5Added++;
          if (appendLast5(fighters, byNormName, loserName, winnerName, 'L', method, round, fight.time, ourEv.name)) last5Added++;

          const sectionKey = hit.section === 'mainCard' ? 'main' : hit.section === 'prelims' ? 'prelims' : 'early';
          await pushResultToSupabase(ourEv.id, `${sectionKey}-${hit.index}`, winnerName, method, round);
        }
      }

      if (updated > 0) console.log(`📋 Synced results: ${espnEv.name} (${updated} fights)`), changes.push(`Results: ${espnEv.name} (${updated} fights)`);

      const graded = [...(ourEv.mainCard||[]), ...(ourEv.prelims||[]), ...(ourEv.earlyPrelims||[])].filter(f => !f.cancelled);
      const allGraded = graded.length > 0 && graded.every(f => f.winner);
      if (isCompleted || allGraded) {
        ourEv.status = 'completed';
        changes.push(`Marked completed: ${espnEv.name}`);
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
      await notifyFavFighters(newEv);
    }

    // ── C: POSTER — missing poster, or still on the temporary bout-announcement
    // graphic (TEMP-HERO) — those get set by hand as a placeholder before UFC
    // publishes the real theatrical poster, and without this re-check they'd
    // stay on the placeholder forever, since findPoster() only ever runs once
    // a poster field is non-empty. Re-probe TEMP-HERO events every run so they
    // self-upgrade the moment the real EVENT-ART poster goes live. ───────────
    if (!isCompleted && ourEv && (!ourEv.poster || ourEv.poster.includes('TEMP-HERO'))) {
      console.log(`🎨 Searching poster: ${ourEv.name}`);
      const currentMain = (ourEv.mainCard || []).find(f => f.slot === 'main') || (ourEv.mainCard || [])[0];
      const poster = await findPoster([ourEv.id, matchupSlug(currentMain)], ourEv.isoDate);
      if (poster && poster !== ourEv.poster) {
        const upgraded = !!ourEv.poster;
        ourEv.poster = poster;
        console.log(`  ✓ ${upgraded ? 'Upgraded placeholder to final' : 'Found'}: ${poster}`);
        changes.push(`${upgraded ? 'Poster upgraded' : 'Poster'}: ${ourEv.name}`);
      }
    }

    // ── D: DROPPED FIGHTS — detect first so replacements can be added in step E ─
    // ESPN's own scoreboard response for a given event has been observed to
    // flap between runs near event time (a fighter present on one poll,
    // missing on the next, back a run later) — trusting a single snapshot
    // caused a real bug: the same fight got flagged cancelled, then
    // "replaced" by re-adding itself, then flagged cancelled again, forever,
    // once per sync run. Require it to be missing on two consecutive runs
    // before actually flagging it, and self-heal (reset the strike) the
    // moment ESPN shows it again.
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
          const missingFromEspn = espnNames.size > 0 && !espnNames.has(aKey) && !espnNames.has(bKey);
          if (missingFromEspn) {
            if (fight._espnMissStreak) {
              fight.cancelled = true;
              delete fight._espnMissStreak;
              console.log(`  ⚠ Fight dropped: ${fight.a} vs ${fight.b} (missing from ESPN 2 runs in a row)`);
              dropped++;
            } else {
              fight._espnMissStreak = true;
              console.log(`  ? Fight not in ESPN this run (1st miss, watching): ${fight.a} vs ${fight.b}`);
            }
          } else if (fight._espnMissStreak) {
            delete fight._espnMissStreak; // back — ESPN was just flapping
          }
        }
      }

      if (dropped > 0) changes.push(`Dropped fights flagged: ${ourEv.name} (${dropped})`);
    }

    // ── E: CARD UPDATE — new fights / replacements for an upcoming event ───────
    if (!isCompleted && ourEv) {
      // ESPN lists fights earliest→latest, reverse to get main card first.
      // Drop TBA placeholders before slot assignment (see buildNewEvent).
      const compsRev = [...(espnEv.competitions || [])].reverse().filter(c => {
        const sorted = [...(c.competitors || [])].sort((x, y) => (x.order || 0) - (y.order || 0));
        const a = sorted[0]?.athlete?.displayName || '';
        const b = sorted[1]?.athlete?.displayName || '';
        return !isTBA(a) && !isTBA(b);
      });
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

  if (last5Added > 0) {
    fs.writeFileSync(FTR_DATA, JSON.stringify(fighters, null, 2), 'utf8');
    console.log(`💾 Saved data/fighters.json (+${last5Added} last5 entries)`);
  }

  // Pass to GitHub Actions step output
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${changes.join(' | ')}\n`);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
