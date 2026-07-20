#!/usr/bin/env node
/**
 * rankings-sync.js — Scrape official UFC divisional rankings from UFC.com
 * Writes to data/rankings.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT           = path.join(__dirname, '..', 'data', 'rankings.json');
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');

function decodeEntities(s) {
  return (s || '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function normName(s) { return decodeEntities(s).toLowerCase().replace(/[^a-z]/g, ''); }

// ── Week-over-week rank movement ──────────────────────────
// The site's rankings.json gets fully overwritten every run, so "movement"
// has to be computed by diffing against whatever was on disk *before* this
// run's write — there's no separate history file to maintain. Only applies
// to non-champion ranked entries (numeric rank); champions get a distinct
// 'new-champ' flag instead of an up/down arrow, since rank 'C' has no
// numeric direction.
function loadPreviousRankings() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return []; }
}

function attachMovement(divisions, prevDivisions) {
  const prevByDiv = {};
  prevDivisions.forEach(d => { if (!prevByDiv[d.division]) prevByDiv[d.division] = d; });

  divisions.forEach(d => {
    const prev = prevByDiv[d.division];
    const prevRankMap = {};
    let prevChamp = null;
    if (prev) {
      prev.fighters.forEach(f => {
        if (f.isChamp) prevChamp = f;
        else if (typeof f.rank === 'number') prevRankMap[normName(f.name)] = f.rank;
      });
    }

    d.fighters.forEach(f => {
      if (f.isChamp) {
        if (prevChamp && normName(prevChamp.name) !== normName(f.name)) f.movement = 'new-champ';
        return;
      }
      const key = normName(f.name);
      if (!(key in prevRankMap)) {
        f.movement = 'new';
      } else if (prevRankMap[key] === f.rank) {
        f.movement = 'same';
      } else {
        f.movement = prevRankMap[key] > f.rank ? 'up' : 'down';
        f.prevRank = prevRankMap[key];
      }
    });
  });
}

// ── Keep fighters.json's own `ranking` field in sync with the live scrape ──
// This field is read directly on fighter.html, search.js, results.js, and
// pfp.js, but nothing was ever updating it after it was first set — found
// via a stale-ranking case (Taila Santos still shown as UFC #7 flyweight
// months after she'd left for the PFL). rankings.json itself was already
// fresh; fighters.json's copy of the same information just wasn't wired up.
function syncFighterRankings(divisions) {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  const inactivePattern = /retired|former/i;

  // Merge same-named divisions (the UFC rankings page lists each division
  // twice in its markup) into one fighter list per division.
  const byDivision = {};
  divisions.forEach(d => {
    const key = normName(d.division);
    if (key.includes('poundforpound')) return; // P4P handled separately, not a per-fighter "ranking" label
    if (!byDivision[key]) byDivision[key] = [];
    byDivision[key].push(...d.fighters);
  });

  let changed = 0;
  const log = [];

  fighters.forEach(fighter => {
    // Never touch deliberately historical labels like "Former Champion"
    if (fighter.ranking && inactivePattern.test(fighter.ranking)) return;
    if (!fighter.weightClass) return; // can't determine which division to check

    const divFighters = byDivision[normName(fighter.weightClass)];
    if (!divFighters) return;

    const entry = divFighters.find(f => normName(f.name) === normName(fighter.name));
    const newRanking = entry ? (entry.isChamp ? 'Champion' : `#${entry.rank}`) : '';

    if ((fighter.ranking || '') !== newRanking) {
      log.push(`${fighter.name}: "${fighter.ranking || '(none)'}" -> "${newRanking || '(unranked)'}"`);
      fighter.ranking = newRanking;
      changed++;
    }
  });

  if (changed > 0) {
    fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
  }
  console.log(`✅ Fighter rankings synced: ${changed} changed`);
  log.slice(0, 20).forEach(l => console.log(`  ${l}`));
  return changed;
}

async function run() {
  // Read before writing — this run's "previous" is whatever's on disk now.
  const prevDivisions = loadPreviousRankings();

  const res = await fetch('https://www.ufc.com/rankings', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`UFC rankings HTTP ${res.status}`);
  const html = await res.text();

  const divisions = [];

  // Each division is wrapped in <div class="view-grouping">
  const sections = html.split('<div class="view-grouping">').slice(1);

  for (const section of sections) {
    // Division name. Not just [^<]+ up to the closing </div> — the P4P
    // headers ("Men's Pound-for-Pound <span>Top Rank</span>") have a nested
    // <span>, which silently broke that simpler match (regex can't cross the
    // inner tag boundary), so the two P4P sections were dropped entirely
    // with no error. Match everything up to the closing tag non-greedily,
    // then strip any inner tags from the captured text instead.
    const divMatch = /<div class="view-grouping-header">([\s\S]*?)<\/div>/.exec(section);
    if (!divMatch) continue;
    const division = decodeEntities(divMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    // Champion from h5 inside rankings--athlete--champion block
    const champMatch = /<h5><a[^>]*>([^<]+)<\/a><\/h5>/.exec(section);
    const champion = champMatch ? champMatch[1].trim() : null;

    const fighters = [];
    if (champion) fighters.push({ rank: 'C', name: champion, isChamp: true });

    // Ranked contenders from table rows
    const rowRe = /<td class="views-field views-field-weight-class-rank">(\d+)\s*<\/td>\s*<td class="views-field views-field-title"><a[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = rowRe.exec(section)) !== null) {
      fighters.push({ rank: parseInt(m[1], 10), name: m[2].trim(), isChamp: false });
    }

    if (fighters.length) divisions.push({ division, fighters });
  }

  if (!divisions.length) throw new Error('Parsed 0 divisions — UFC page structure may have changed');

  // The UFC rankings page lists each division twice in its markup (the
  // second pass is a stray partial listing) — keep first occurrence only,
  // which is always the full 16-fighter version. Deduping here (not just
  // in syncFighterRankings) matters now that movement diffing keys off
  // division name — a duplicate would let the partial entry silently win.
  const seenDiv = new Set();
  const dedupedDivisions = divisions.filter(d => {
    if (seenDiv.has(d.division)) return false;
    seenDiv.add(d.division);
    return true;
  });

  attachMovement(dedupedDivisions, prevDivisions);

  fs.writeFileSync(OUT, JSON.stringify(dedupedDivisions, null, 2));
  console.log(`✅ Rankings: wrote ${dedupedDivisions.length} divisions to data/rankings.json`);
  dedupedDivisions.slice(0, 4).forEach(d => {
    const champ = d.fighters.find(f => f.isChamp);
    console.log(`  ${d.division}: champ=${champ?.name || 'none'}, ${d.fighters.length} total`);
  });

  syncFighterRankings(dedupedDivisions);
}

run().catch(e => { console.error('Rankings sync failed:', e.message); process.exit(1); });
