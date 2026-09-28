/**
 * social-data-posts.js — data-driven post types for the daily social
 * pipeline. Each builder decides for itself whether today is its day
 * (returns null otherwise), renders a branded card via social-cards.js, and
 * returns [{ rawPath, caption, ref, expiresAt? }] like the screenshot-based
 * builders in social-post-daily.js.
 *
 *   tale_of_tape   2 days before an event — side-by-side ufcstats numbers
 *   picks_lock     last daily run before picks lock (expires at lock)
 *   pick_split     same window — community pick % on the main event
 *   upset          within 4 days after an event — lowest-picked winner
 *   dream_matchup  Wednesdays — two top-5 fighters in a division who
 *                  haven't fought recently and aren't booked
 *   on_this_day    when an archived event happened on today's date
 *
 * Community-pick types stay silent until a fight has MIN_PUBLIC_PICKS
 * picks, so a post never advertises "60%" of 5 people.
 *
 * FORCE_TYPE (local preview) relaxes the day/threshold gates so any type
 * can be rendered on demand.
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renderCard, taleOfTapeHtml, dreamMatchupHtml, picksLockHtml,
  pickSplitHtml, upsetHtml, onThisDayHtml,
} from './social-cards.js';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR       = path.join(__dirname, '..', 'social');
const DATA_DIR      = path.join(__dirname, '..', 'data');
const SITE_URL      = process.env.SITE_URL || 'https://mmabridge.com';
const API_BASE      = process.env.API_BASE || 'https://mmabridge-backend.onrender.com';
const FORCE         = !!process.env.FORCE_TYPE;

const MIN_PUBLIC_PICKS = FORCE ? 1 : 30; // main-event picks before a split/verdict goes public
const MIN_FIGHT_PICKS  = FORCE ? 1 : 20; // picks on a single fight before it can be the "upset"
const DREAM_MATCHUP_WEEKDAY = 3;         // Wednesday (UTC)

export const DATA_TYPES = ['picks_lock', 'pick_split', 'upset', 'tale_of_tape', 'dream_matchup', 'on_this_day'];

// ── shared helpers ───────────────────────────────────────────────────────────

const readJson = f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
let _events, _fighters;
const events   = () => (_events ||= readJson('events.json'));
const fighters = () => (_fighters ||= readJson('fighters.json'));

export function norm(name) {
  return String(name || '')
    .replace(/\(.*?\)/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

let _byName;
function fighterByName(name) {
  if (!_byName) {
    _byName = new Map();
    for (const f of fighters()) if (f.name) _byName.set(norm(f.name), f);
  }
  return _byName.get(norm(name)) || null;
}

// The name a fighter is billed by: family name, keeping "Jr." style
// suffixes ("Rosas Jr."), and family-name-first for Chinese fighters
// ("Wang Cong" -> "Wang", matching UFC billing like "Silva vs. Wang").
// nationality is missing for many fighters, so also check common surnames.
const NAME_SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
const CN_SURNAMES = new Set(['wang', 'li', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'zhou', 'xu', 'sun', 'zhu', 'hu', 'guo', 'lin', 'luo', 'gao', 'song', 'yan', 'wu', 'su', 'ma', 'deng', 'feng', 'jiang', 'wei', 'tang', 'xiong', 'meng']);
export function lastName(name) {
  const parts = (name || '').trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 2 && NAME_SUFFIXES.test(last)) return `${parts[parts.length - 2]} ${last}`;
  if (parts.length === 2) {
    const nat = fighterByName(name)?.nationality || '';
    if (/chin/i.test(nat) || CN_SURNAMES.has(parts[0].toLowerCase())) return parts[0];
  }
  return last || name;
}

function withSourceLine(body, sourceLine) {
  return `${body}\n\n${sourceLine}\n\nLink in bio: mmabridge.com`;
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function daysUntil(isoDate) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(isoDate + 'T00:00:00Z') - today) / 86400000);
}

function mainFightWithKey(ev) {
  const mc = ev.mainCard || [];
  let i = mc.findIndex(f => f.slot === 'main');
  if (i < 0) i = 0;
  return mc[i] ? { fight: mc[i], key: `main-${i}` } : null;
}

function allFightsWithKeys(ev) {
  const out = [];
  [['main', ev.mainCard], ['prelims', ev.prelims], ['early', ev.earlyPrelims]].forEach(([sec, list]) =>
    (list || []).forEach((fight, i) => out.push({ fight, key: `${sec}-${i}` })));
  return out;
}

function imgFor(name, fight) {
  if (fight) {
    if (norm(fight.a) === norm(name) && fight.imgA) return fight.imgA;
    if (norm(fight.b) === norm(name) && fight.imgB) return fight.imgB;
  }
  return fighterByName(name)?.img || '';
}

function upcomingEvents() {
  const today = todayKey();
  return events()
    .filter(e => e.status !== 'completed' && e.isoDate && e.isoDate >= today)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

function recentCompletedEvents() {
  const today = todayKey();
  return events()
    .filter(e => e.status === 'completed' && e.isoDate && e.isoDate <= today)
    .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
}

function lockLabel(startTime) {
  const d = new Date(startTime);
  const day  = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time} ET`;
}

// Picks lock at start_time; the daily run is at 18:00 UTC, so "the last
// run before lock" is the one 3-27h ahead of it. 3h minimum leaves room for
// the first autopost slot.
function inLockWindow(ev) {
  if (!ev?.start_time) return false;
  const h = (new Date(ev.start_time) - Date.now()) / 3600000;
  return FORCE ? h > 0 : h >= 3 && h < 27;
}

// All picks, via the backend's public leaderboard endpoint (the anon
// Supabase key can't read other users' picks). Render cold-starts, so retry.
let _picks;
async function allPicks() {
  if (_picks) return _picks;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard?period=all`, { signal: AbortSignal.timeout(60000) });
      if (res.ok) { _picks = (await res.json()).picks || []; return _picks; }
    } catch {}
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('Could not load picks from backend');
}

async function pickCounts(eventId, fightKey) {
  const counts = new Map();
  let total = 0;
  for (const p of await allPicks()) {
    if (p.event_id !== eventId || p.fight_key !== fightKey || !p.pick) continue;
    counts.set(norm(p.pick), (counts.get(norm(p.pick)) || 0) + 1);
    total++;
  }
  return { counts, total };
}

function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

const METHOD_NAMES = { DEC: 'decision', UD: 'unanimous decision', SD: 'split decision', MD: 'majority decision', SUB: 'submission', 'KO/TKO': 'KO/TKO', KO: 'KO', TKO: 'TKO' };
// short = on-image label ("TKO R2"); long = caption wording ("TKO in round 2")
function methodLabel(fight, short = false) {
  if (!fight.method) return '';
  const m = METHOD_NAMES[fight.method.toUpperCase()] || fight.method;
  if (!fight.round || /decision/i.test(m)) return m;
  return short ? `${m} R${fight.round}` : `${m} in round ${fight.round}`;
}

async function render(page, html, name) {
  const rawPath = path.join(OUT_DIR, `_raw-${name}.png`);
  await renderCard(page, html, rawPath);
  return rawPath;
}

// ── builders ─────────────────────────────────────────────────────────────────

async function buildTaleOfTape(page) {
  const ev = upcomingEvents().find(e => FORCE || daysUntil(e.isoDate) === 2);
  if (!ev) return null;
  const mf = mainFightWithKey(ev);
  if (!mf) return null;
  const A = fighterByName(mf.fight.a), B = fighterByName(mf.fight.b);
  if (!A?.stats || !B?.stats) return null; // no ufcstats numbers — nothing honest to compare

  const rec = f => !f.record ? '-' : `${f.record.wins}-${f.record.losses}${f.record.draws ? `-${f.record.draws}` : ''}`;
  const v = x => (x === undefined || x === null || x === '') ? '-' : String(x);
  const rows = [
    { label: 'Record',          a: rec(A), b: rec(B) },
    { label: 'Age',             a: v(A.age), b: v(B.age) },
    { label: 'Height',          a: v(A.height), b: v(B.height) },
    { label: 'Reach',           a: v(A.reach), b: v(B.reach), better: 'high' },
    { label: 'Stance',          a: v(A.stance), b: v(B.stance) },
    { label: 'Strikes/min',     a: v(A.stats.slpm), b: v(B.stats.slpm), better: 'high' },
    { label: 'Strike acc.',     a: v(A.stats.strAcc), b: v(B.stats.strAcc), better: 'high' },
    { label: 'Absorbed/min',    a: v(A.stats.sapm), b: v(B.stats.sapm), better: 'low' },
    { label: 'Strike def.',     a: v(A.stats.strDef), b: v(B.stats.strDef), better: 'high' },
    { label: 'TD / 15 min',     a: v(A.stats.tdAvg), b: v(B.stats.tdAvg), better: 'high' },
    { label: 'TD acc.',         a: v(A.stats.tdAcc), b: v(B.stats.tdAcc), better: 'high' },
    { label: 'TD def.',         a: v(A.stats.tdDef), b: v(B.stats.tdDef), better: 'high' },
    { label: 'Subs / 15 min',   a: v(A.stats.subAvg), b: v(B.stats.subAvg), better: 'high' },
  ].filter(r => r.a !== '-' || r.b !== '-'); // drop rows neither fighter has data for
  const html = await taleOfTapeHtml({
    eventName: ev.name,
    a: { last: lastName(A.name), record: rec(A), img: imgFor(A.name, mf.fight) },
    b: { last: lastName(B.name), record: rec(B), img: imgFor(B.name, mf.fight) },
    rows,
  });
  const rawPath = await render(page, html, 'tale');
  const pickUrl = `${SITE_URL}/picks.html?id=${ev.id}`;
  const caption = withSourceLine(
    `Tale of the tape: ${A.name} vs. ${B.name}, ${ev.name}. ${lastName(A.name)} lands ${A.stats.slpm} significant strikes per minute, ${lastName(B.name)} lands ${B.stats.slpm}. Who has the edge? Make your pick: ${pickUrl}`,
    'Stats from the fighter profiles on MMA Bridge.');
  return [{ rawPath, caption, ref: ev.id }];
}

async function buildPicksLock(page) {
  const ev = upcomingEvents().find(inLockWindow);
  if (!ev) return null;
  const mf = mainFightWithKey(ev);
  const matchup = mf ? `${mf.fight.a} vs. ${mf.fight.b}` : ev.name;

  // Only mention how many people have picked once that number is flattering.
  let pickCountLine = '';
  try {
    const users = new Set((await allPicks()).filter(p => p.event_id === ev.id).map(p => p.user_id));
    if (users.size >= MIN_PUBLIC_PICKS) pickCountLine = `${users.size} fans have already locked in`;
  } catch {}

  const label = lockLabel(ev.start_time);
  const html = await picksLockHtml({ eventName: ev.name, matchup, lockLabel: label, poster: ev.poster, pickCountLine });
  const rawPath = await render(page, html, 'lock');
  const pickUrl = `${SITE_URL}/picks.html?id=${ev.id}`;
  const caption = withSourceLine(
    `Last call. Picks for ${ev.name} lock ${label}. Get yours in before the first bell: ${pickUrl}`,
    "From the pick'em on MMA Bridge.");
  return [{ rawPath, caption, ref: ev.id, expiresAt: ev.start_time }];
}

async function buildPickSplit(page) {
  const ev = upcomingEvents().find(inLockWindow);
  if (!ev) return null;
  const mf = mainFightWithKey(ev);
  if (!mf) return null;
  const { counts, total } = await pickCounts(ev.id, mf.key);
  if (total < MIN_PUBLIC_PICKS) {
    console.log(`   pick_split: only ${total} picks on ${ev.id} main event (need ${MIN_PUBLIC_PICKS}), skipping`);
    return null;
  }
  const { a, b } = mf.fight;
  const pa = pct(counts.get(norm(a)) || 0, total);
  const pb = 100 - pa;
  const html = await pickSplitHtml({
    eventName: ev.name,
    a: { last: lastName(a), pct: pa, img: imgFor(a, mf.fight) },
    b: { last: lastName(b), pct: pb, img: imgFor(b, mf.fight) },
  });
  const rawPath = await render(page, html, 'split');
  const [fav, favPct, dog] = pa >= pb ? [a, pa, b] : [b, pb, a];
  const pickUrl = `${SITE_URL}/picks.html?id=${ev.id}`;
  const caption = withSourceLine(
    `${favPct}% of MMA Bridge is taking ${fav} over ${dog} at ${ev.name}. Agree with the crowd or fade it? ${pickUrl}`,
    "Community picks from the pick'em on MMA Bridge.");
  return [{ rawPath, caption, ref: ev.id }];
}

async function buildUpset(page) {
  const ev = recentCompletedEvents().find(e => FORCE || daysUntil(e.isoDate) >= -4);
  if (!ev) return null;

  let best = null;
  for (const { fight, key } of allFightsWithKeys(ev)) {
    if (!fight.winner) continue;
    const { counts, total } = await pickCounts(ev.id, key);
    if (total < MIN_FIGHT_PICKS) continue;
    const p = pct(counts.get(norm(fight.winner)) || 0, total);
    if (p < 50 && (!best || p < best.p)) best = { fight, p };
  }
  if (!best) {
    console.log(`   upset: no fight on ${ev.id} with ${MIN_FIGHT_PICKS}+ picks where the crowd was wrong, skipping`);
    return null;
  }
  const { fight, p } = best;
  const loser = norm(fight.winner) === norm(fight.a) ? fight.b : fight.a;
  const html = await upsetHtml({
    eventName: ev.name,
    winner: { last: lastName(fight.winner), img: imgFor(fight.winner, fight) },
    loser, pct: p, method: methodLabel(fight, true),
  });
  const rawPath = await render(page, html, 'upset');

  // Crowd verdict on the main event, when enough people picked it.
  let verdict = '';
  const mf = mainFightWithKey(ev);
  if (mf?.fight.winner && mf.fight !== fight) {
    const { counts, total } = await pickCounts(ev.id, mf.key);
    if (total >= MIN_PUBLIC_PICKS) {
      const mp = pct(counts.get(norm(mf.fight.winner)) || 0, total);
      verdict = ` In the main event, ${mp}% had ${mf.fight.winner}.`;
    }
  }
  const caption = withSourceLine(
    `Only ${p}% of MMA Bridge picked ${fight.winner} to beat ${loser} at ${ev.name}.${verdict} Think you can call the next one? ${SITE_URL}/events.html`,
    "Community picks from the pick'em on MMA Bridge.");
  return [{ rawPath, caption, ref: ev.id }];
}

async function buildDreamMatchup(page) {
  if (!FORCE && new Date().getUTCDay() !== DREAM_MATCHUP_WEEKDAY) return null;

  const booked = new Set();
  for (const ev of upcomingEvents())
    for (const { fight } of allFightsWithKeys(ev)) booked.add([norm(fight.a), norm(fight.b)].sort().join('|'));

  const foughtRecently = (x, y) =>
    (x.last5 || []).some(f => norm(f.opponent) === norm(y.name)) ||
    (y.last5 || []).some(f => norm(f.opponent) === norm(x.name));

  const divisions = [];
  for (const div of readJson('rankings.json')) {
    if (/pound/i.test(div.division)) continue;
    const seen = new Set();
    const top = [];
    for (const r of div.fighters || []) {
      const ok = r.rank === 'C' || (typeof r.rank === 'number' && r.rank <= 5);
      const f = ok && fighterByName(r.name);
      if (!f?.img || seen.has(norm(r.name))) continue;
      seen.add(norm(r.name));
      top.push({ f, rankLabel: r.rank === 'C' ? 'Champion' : `No. ${r.rank} ranked` });
    }
    const pairs = [];
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) {
        const [x, y] = [top[i], top[j]];
        if (foughtRecently(x.f, y.f)) continue;
        if (booked.has([norm(x.f.name), norm(y.f.name)].sort().join('|'))) continue;
        pairs.push([x, y]);
      }
    if (pairs.length) divisions.push({ name: div.division, pairs });
  }
  if (!divisions.length) return null;

  // Rotate through divisions week by week, then through each division's pairs.
  const week = Math.floor(Date.now() / (7 * 86400000));
  const div  = divisions[week % divisions.length];
  const [x, y] = div.pairs[Math.floor(week / divisions.length) % div.pairs.length];

  const html = await dreamMatchupHtml({
    division: div.name.replace(/\s*Top Rank$/i, ''),
    a: { last: lastName(x.f.name), rankLabel: x.rankLabel, img: x.f.img },
    b: { last: lastName(y.f.name), rankLabel: y.rankLabel, img: y.f.img },
  });
  const rawPath = await render(page, html, 'dream');
  const caption = withSourceLine(
    `Dream matchup: ${x.f.name} vs. ${y.f.name}. ${x.rankLabel} against ${y.rankLabel} at ${div.name.replace(/\s*Top Rank$/i, '').toLowerCase()}. Who wins? Tell us in the comments.`,
    'Rankings and fighter data from MMA Bridge.');
  return [{ rawPath, caption, ref: [x.f.id, y.f.id].sort().join('+') }];
}

async function buildOnThisDay(page) {
  const today = todayKey();
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  const candidates = events()
    .filter(e => e.status === 'completed' && e.isoDate && (FORCE ? e.isoDate < today : e.isoDate.slice(5) === md && Number(e.isoDate.slice(0, 4)) < year))
    .filter(e => mainFightWithKey(e)?.fight.winner)
    // Prefer numbered PPVs, then the most recent year.
    .sort((a, b) => (b.type === 'PPV') - (a.type === 'PPV') || b.isoDate.localeCompare(a.isoDate));
  const ev = candidates[0];
  if (!ev) return null;

  const { fight } = mainFightWithKey(ev);
  const loser = norm(fight.winner) === norm(fight.a) ? fight.b : fight.a;
  const evYear = ev.isoDate.slice(0, 4);
  const dateLabel = new Date(ev.isoDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const html = await onThisDayHtml({
    year: evYear, dateLabel, eventName: ev.name,
    winner: { last: lastName(fight.winner), img: imgFor(fight.winner, fight) },
    loser, method: methodLabel(fight, true),
  });
  const rawPath = await render(page, html, 'otd');
  const how = fight.method ? ` by ${methodLabel(fight)}` : '';
  const caption = withSourceLine(
    `On this day in ${evYear}: ${fight.winner} def. ${loser}${how} in the main event of ${ev.name}. Full results: ${SITE_URL}/event-review.html?id=${ev.id}`,
    'From the event archive on MMA Bridge.');
  return [{ rawPath, caption, ref: ev.id }];
}

export async function buildDataPost(page, type) {
  switch (type) {
    case 'tale_of_tape':  return buildTaleOfTape(page);
    case 'picks_lock':    return buildPicksLock(page);
    case 'pick_split':    return buildPickSplit(page);
    case 'upset':         return buildUpset(page);
    case 'dream_matchup': return buildDreamMatchup(page);
    case 'on_this_day':   return buildOnThisDay(page);
    default: throw new Error(`Unknown data post type: ${type}`);
  }
}
