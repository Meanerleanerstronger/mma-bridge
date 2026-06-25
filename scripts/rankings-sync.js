#!/usr/bin/env node
/**
 * rankings-sync.js — Scrape official UFC divisional rankings from UFC.com
 * Writes to data/rankings.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'rankings.json');

async function run() {
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
    // Division name
    const divMatch = /<div class="view-grouping-header">([^<]+)<\/div>/.exec(section);
    if (!divMatch) continue;
    const division = divMatch[1].trim();

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

  fs.writeFileSync(OUT, JSON.stringify(divisions, null, 2));
  console.log(`✅ Rankings: wrote ${divisions.length} divisions to data/rankings.json`);
  divisions.slice(0, 4).forEach(d => {
    const champ = d.fighters.find(f => f.isChamp);
    console.log(`  ${d.division}: champ=${champ?.name || 'none'}, ${d.fighters.length} total`);
  });
}

run().catch(e => { console.error('Rankings sync failed:', e.message); process.exit(1); });
