#!/usr/bin/env node
/**
 * rankings-sync.js — Fetch UFC divisional rankings from ESPN and write to data/rankings.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'rankings.json');

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MMABridge-Sync/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

function normalizeRecord(athlete) {
  const stats = athlete?.statistics?.[0]?.splits?.[0]?.stats || [];
  const wins   = stats.find(s => s.name === 'wins')?.value   ?? '';
  const losses = stats.find(s => s.name === 'losses')?.value ?? '';
  const draws  = stats.find(s => s.name === 'draws')?.value  ?? '';
  if (wins !== '' && losses !== '') return `${wins}-${losses}${draws ? `-${draws}` : ''}`;
  return athlete?.record || '';
}

async function run() {
  const data = await getJSON('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings');

  // ESPN returns { rankings: [ { name, type, ranks: [ { current, athlete: { displayName, record } } ] } ] }
  const rankingsRaw = data.rankings || data.groups || [];

  const divisions = rankingsRaw
    .filter(group => group.type !== 'poundforpound')
    .map(group => {
      const division = group.name || group.shortName || 'Unknown';
      const fighters = (group.ranks || []).map(r => ({
        rank:     r.current ?? r.rank ?? 0,
        name:     r.athlete?.displayName || r.displayName || '',
        record:   normalizeRecord(r.athlete) || r.athlete?.record || '',
        movement: r.movement ?? 0,
        isChamp:  r.current === 0 || r.isChampion || false,
      })).filter(f => f.name);
      return { division, fighters };
    })
    .filter(d => d.fighters.length > 0);

  fs.writeFileSync(OUT, JSON.stringify(divisions, null, 2));
  console.log(`✅ Rankings: wrote ${divisions.length} divisions to data/rankings.json`);
}

run().catch(e => { console.error('Rankings sync failed:', e.message); process.exit(1); });
