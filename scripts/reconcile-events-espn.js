#!/usr/bin/env node
/**
 * reconcile-events-espn.js — ONE-TIME historical data integrity check/fix
 *
 * Re-fetches every completed event from ESPN's API (Nov 2023 - present,
 * the same authoritative source ufc-sync.js already trusts for live
 * results) and cross-checks events.json's stored fighters/winners/methods
 * against it. Corrects mismatches; conservatively flags (rather than
 * deletes) anything it can't confidently verify.
 *
 * Run with --dry-run first to see the report without writing anything.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const EV_ROOT   = path.join(ROOT, 'events.json');
const EV_DATA   = path.join(ROOT, 'data', 'events.json');

const DRY_RUN = process.argv.includes('--dry-run');
const ESPN    = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';

function normName(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }
function namesMatch(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const minLen = Math.min(na.length, nb.length, 7);
  if (minLen >= 5 && na.slice(0, minLen) === nb.slice(0, minLen)) return true;
  if (na.includes(nb.slice(0, 6)) || nb.includes(na.slice(0, 6))) return true;
  return false;
}

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MMABridge-Reconcile/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function espnWindow(from, to) {
  try {
    const data = await getJSON(`${ESPN}?dates=${from}-${to}`);
    return data.events || [];
  } catch (e) {
    console.warn(`  ESPN fetch failed (${from}-${to}):`, e.message);
    return [];
  }
}

async function fetchAllHistoricalESPN() {
  const start = new Date('2023-10-01T00:00:00Z');
  const end   = new Date();
  const windows = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const from = new Date(cursor);
    const to   = new Date(cursor);
    to.setMonth(to.getMonth() + 2);
    windows.push({
      from: from.toISOString().slice(0, 10).replace(/-/g, ''),
      to:   to.toISOString().slice(0, 10).replace(/-/g, ''),
    });
    cursor.setMonth(cursor.getMonth() + 2);
  }
  console.log(`Fetching ${windows.length} ESPN date windows (Oct 2023 → today)...`);
  const all = [];
  const seen = new Set();
  for (const w of windows) {
    const evs = await espnWindow(w.from, w.to);
    for (const ev of evs) {
      if (!seen.has(ev.id)) { seen.add(ev.id); all.push(ev); }
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(`\nESPN returned ${all.length} historical events\n`);
  return all;
}

function parseMethod(details) {
  for (const d of details || []) {
    const text = (d.type?.text || '').toLowerCase();
    if (text.includes('unofficial winner')) {
      if (text.includes('kotko'))      return 'TKO';
      if (text.includes('submission')) return 'SUB';
      if (text.includes('decision'))   return 'DEC';
      if (text.includes('nc') || text.includes('no contest')) return 'NC';
      if (text.includes('dq') || text.includes('disqualif'))  return 'DQ';
    }
  }
  return '';
}

async function main() {
  const events = JSON.parse(fs.readFileSync(EV_DATA, 'utf8'));
  const espnEvents = await fetchAllHistoricalESPN();

  const report = {
    checked: 0, noEspnMatch: [],
    fightsFixed: [], fightsSuspect: [],
  };

  for (const ev of events) {
    if (ev.status !== 'completed') continue;

    const espnEv = espnEvents.find(e => (e.date || '').slice(0, 10) === ev.isoDate);
    if (!espnEv) { report.noEspnMatch.push(ev.name); continue; }

    const comps = espnEv.competitions || [];
    const espnFights = [];
    // Also track every individual competitor name that appeared on this
    // card at all, win or lose, graded or not — used below to tell
    // "this exact pairing didn't happen" apart from "this fighter fought
    // someone else on the card that night" (the latter is not corruption,
    // just a fight our site doesn't happen to store).
    const allCompetitorNames = new Set();
    for (const comp of comps) {
      for (const c of (comp.competitors || [])) {
        const n = c.athlete?.displayName;
        if (n) allCompetitorNames.add(n);
      }
      if (!comp.status?.type?.completed) continue;
      const winner = (comp.competitors || []).find(c => c.winner);
      const loser  = (comp.competitors || []).find(c => !c.winner);
      if (!winner) continue;
      espnFights.push({
        winnerName: winner.athlete?.displayName || '',
        loserName:  loser?.athlete?.displayName  || '',
        method: parseMethod(comp.details),
        round: comp.status?.period || null,
      });
    }
    report.checked++;
    const namesArr = [...allCompetitorNames];

    // Check each LOCAL fight against ESPN's real data for this date —
    // never the other way around. This avoids the false-positive trap of
    // ESPN simply having more total undercard fights than this site
    // chooses to store (that's a scope difference, not a bug).
    for (const section of ['mainCard', 'prelims', 'earlyPrelims']) {
      const fights = ev[section] || [];
      for (const f of fights) {
        if (!f.winner) continue; // not yet graded, nothing to verify

        // Does this exact pairing appear in ESPN's real completed fights?
        const espnFight = espnFights.find(ef =>
          (namesMatch(ef.winnerName, f.a) && namesMatch(ef.loserName, f.b)) ||
          (namesMatch(ef.winnerName, f.b) && namesMatch(ef.loserName, f.a)));

        if (espnFight) {
          const correctWinner = namesMatch(espnFight.winnerName, f.a) ? f.a : f.b;
          const changes = [];
          if (f.winner !== correctWinner) changes.push(`winner: "${f.winner}" -> "${correctWinner}"`);
          if (espnFight.method && f.method !== espnFight.method) changes.push(`method: "${f.method}" -> "${espnFight.method}"`);
          if (espnFight.round && f.round !== espnFight.round) changes.push(`round: ${f.round} -> ${espnFight.round}`);
          if (changes.length) {
            report.fightsFixed.push({ event: ev.name, fight: `${f.a} vs ${f.b}`, changes });
            if (!DRY_RUN) {
              f.winner = correctWinner;
              if (espnFight.method) f.method = espnFight.method;
              if (espnFight.round)  f.round  = espnFight.round;
            }
          }
          continue;
        }

        // No exact pairing found. Distinguish "these two didn't fight each
        // other" (suspect — flag, don't auto-delete) from "ESPN just
        // doesn't have this fight in its feed at all" (both fighters
        // missing from the roster — can't verify either way, leave alone).
        const aOnCard = namesArr.some(n => namesMatch(n, f.a));
        const bOnCard = namesArr.some(n => namesMatch(n, f.b));
        if (aOnCard && bOnCard) {
          // Both fighters really were on this card that night, but not
          // against each other — near-certain corruption/misplacement.
          report.fightsSuspect.push({ event: ev.name, fight: `${f.a} vs ${f.b}`, winner: f.winner, reason: 'both fighters on card but not vs each other' });
        }
        // else: neither/one fighter not in ESPN's feed for this date at
        // all — can't confirm either way from this source, leave untouched.
      }
    }
  }

  console.log('=== Reconciliation Report ===');
  console.log('Completed events checked:', report.checked);
  console.log('No ESPN match for event date (skipped entirely):', report.noEspnMatch.length);
  console.log('Fights corrected (winner/method/round):', report.fightsFixed.length);
  console.log('Suspect fights — both fighters on card but not vs each other (flagged, not auto-fixed):', report.fightsSuspect.length);

  fs.writeFileSync(path.join(ROOT, 'scripts', '_reconcile-report.json'), JSON.stringify(report, null, 2));
  console.log('\nFull report written to scripts/_reconcile-report.json');

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files written.');
    return;
  }

  const json = JSON.stringify(events, null, 2);
  fs.writeFileSync(EV_ROOT, json);
  fs.writeFileSync(EV_DATA, json);
  console.log('\n💾 Saved events.json (root + data/)');
}

main().catch(e => { console.error(e); process.exit(1); });
