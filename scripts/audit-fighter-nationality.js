#!/usr/bin/env node
/**
 * audit-fighter-nationality.js
 * Checks every currently-ranked fighter (data/rankings.json — the ones
 * actually visible on the site) against ufc.com's own athlete page for a
 * nationality/flag mismatch, like Joshua Van being stored as Canadian
 * when he's Burmese. Scrapes the og:description demonym ("X is a
 * Burmese professional mixed martial artist...") plus Place of Birth,
 * and only auto-fixes when the demonym maps cleanly to a known flag —
 * anything ambiguous is reported, not guessed.
 *
 * Run: node scripts/audit-fighter-nationality.js [--apply]
 * Without --apply it's read-only and just prints a diff report.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const FIGHTERS_PATH = path.join(__dirname, '..', 'data', 'fighters.json');
const FIGHTERS_ROOT = path.join(__dirname, '..', 'fighters.json');
const RANKINGS_PATH = path.join(__dirname, '..', 'data', 'rankings.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 450;

const APPLY = process.argv.includes('--apply');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nameToSlug(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}
function normName(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Demonym (as it appears in "X is a ___ professional mixed martial artist")
// -> [canonical nationality label to store, flag emoji]. Only entries here
// get auto-applied; anything not in this map is reported as "unmapped
// demonym" instead of guessed.
const DEMONYM_MAP = {
  'american': ['American', '🇺🇸'], 'brazilian': ['Brazilian', '🇧🇷'],
  'russian': ['Russian', '🇷🇺'], 'british': ['British', '🇬🇧'],
  'english': ['English', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'], 'irish': ['Irish', '🇮🇪'],
  'nigerian': ['Nigerian', '🇳🇬'], 'cameroonian': ['Cameroonian', '🇨🇲'],
  'georgian': ['Georgian', '🇬🇪'], 'kazakhstani': ['Kazakhstani', '🇰🇿'],
  'kazakh': ['Kazakhstani', '🇰🇿'], 'kyrgyzstani': ['Kyrgyzstani', '🇰🇬'],
  'polish': ['Polish', '🇵🇱'], 'french': ['French', '🇫🇷'],
  'swedish': ['Swedish', '🇸🇪'], 'canadian': ['Canadian', '🇨🇦'],
  'australian': ['Australian', '🇦🇺'], 'new zealand': ['New Zealander', '🇳🇿'],
  'japanese': ['Japanese', '🇯🇵'], 'south korean': ['South Korean', '🇰🇷'],
  'korean': ['South Korean', '🇰🇷'], 'chinese': ['Chinese', '🇨🇳'],
  'dutch': ['Dutch', '🇳🇱'], 'welsh': ['Welsh', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'],
  'scottish': ['Scottish', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'], 'ecuadorean': ['Ecuadorean', '🇪🇨'],
  'ecuadorian': ['Ecuadorean', '🇪🇨'], 'mexican': ['Mexican', '🇲🇽'],
  'peruvian': ['Peruvian', '🇵🇪'], 'chilean': ['Chilean', '🇨🇱'],
  'argentine': ['Argentine', '🇦🇷'], 'argentinian': ['Argentine', '🇦🇷'],
  'venezuelan': ['Venezuelan', '🇻🇪'], 'ukrainian': ['Ukrainian', '🇺🇦'],
  'belarusian': ['Belarusian', '🇧🇾'], 'azerbaijani': ['Azerbaijani', '🇦🇿'],
  'armenian': ['Armenian', '🇦🇲'], 'tajikistani': ['Tajikistani', '🇹🇯'],
  'uzbekistani': ['Uzbekistani', '🇺🇿'], 'burmese': ['Burmese', '🇲🇲'],
  'thai': ['Thai', '🇹🇭'], 'filipino': ['Filipino', '🇵🇭'],
  'indian': ['Indian', '🇮🇳'], 'pakistani': ['Pakistani', '🇵🇰'],
  'south african': ['South African', '🇿🇦'], 'egyptian': ['Egyptian', '🇪🇬'],
  'moroccan': ['Moroccan', '🇲🇦'], 'tunisian': ['Tunisian', '🇹🇳'],
  'israeli': ['Israeli', '🇮🇱'], 'iranian': ['Iranian', '🇮🇷'],
  'icelandic': ['Icelandic', '🇮🇸'], 'norwegian': ['Norwegian', '🇳🇴'],
  'danish': ['Danish', '🇩🇰'], 'german': ['German', '🇩🇪'],
  'italian': ['Italian', '🇮🇹'], 'spanish': ['Spanish', '🇪🇸'],
  'portuguese': ['Portuguese', '🇵🇹'], 'croatian': ['Croatian', '🇭🇷'],
  'serbian': ['Serbian', '🇷🇸'], 'czech': ['Czech', '🇨🇿'],
  'slovak': ['Slovak', '🇸🇰'], 'hungarian': ['Hungarian', '🇭🇺'],
  'romanian': ['Romanian', '🇷🇴'], 'bulgarian': ['Bulgarian', '🇧🇬'],
  'greek': ['Greek', '🇬🇷'], 'turkish': ['Turkish', '🇹🇷'],
  'finnish': ['Finnish', '🇫🇮'], 'swiss': ['Swiss', '🇨🇭'],
  'austrian': ['Austrian', '🇦🇹'], 'belgian': ['Belgian', '🇧🇪'],
  'moldovan': ['Moldovan', '🇲🇩'], 'lithuanian': ['Lithuanian', '🇱🇹'],
  'latvian': ['Latvian', '🇱🇻'], 'estonian': ['Estonian', '🇪🇪'],
  'colombian': ['Colombian', '🇨🇴'], 'panamanian': ['Panamanian', '🇵🇦'],
  'cuban': ['Cuban', '🇨🇺'], 'dominican': ['Dominican', '🇩🇴'],
  'jamaican': ['Jamaican', '🇯🇲'], 'surinamese': ['Surinamese', '🇸🇷'],
  'mongolian': ['Mongolian', '🇲🇳'], 'indonesian': ['Indonesian', '🇮🇩'],
  'singaporean': ['Singaporean', '🇸🇬'],
};

async function fetchAthlete(name) {
  const slug = nameToSlug(name);
  const url  = `https://www.ufc.com/athlete/${slug}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ogMatch = html.match(/property="og:description"\s+content="([^"]+)"/i);
    const ogDesc  = ogMatch ? ogMatch[1] : '';
    const demonymMatch = ogDesc.match(/is an?\s+([A-Za-z][A-Za-z\s-]*?)\s+professional mixed martial artist/i);
    const demonym = demonymMatch ? demonymMatch[1].trim().toLowerCase() : null;

    const pobMatch = html.match(/c-bio__label">Place of Birth<\/div>\s*<div class="c-bio__text">([^<]+)</i);
    const placeOfBirth = pobMatch ? pobMatch[1].trim() : null;

    return { demonym, placeOfBirth };
  } catch {
    return null;
  }
}

async function run() {
  const fighters = JSON.parse(fs.readFileSync(FIGHTERS_PATH, 'utf8'));
  const rankings = JSON.parse(fs.readFileSync(RANKINGS_PATH, 'utf8'));

  const rankedNames = new Set();
  rankings.forEach(div => div.fighters.forEach(f => rankedNames.add(f.name)));

  const byNorm = {};
  fighters.forEach(f => { byNorm[normName(f.name)] = f; });

  console.log(`Auditing ${rankedNames.size} ranked fighters${APPLY ? ' (APPLY MODE — writing changes)' : ' (dry run — pass --apply to write)'}...\n`);

  let mismatches = 0, unmapped = 0, notFound = 0, checked = 0;

  for (const name of rankedNames) {
    const fighter = byNorm[normName(name)];
    if (!fighter) { console.log(`❓ NOT IN fighters.json: ${name}`); notFound++; continue; }

    const info = await fetchAthlete(name);
    checked++;
    if (!info || !info.demonym) { await sleep(DELAY_MS); continue; }

    const mapped = DEMONYM_MAP[info.demonym];
    if (!mapped) {
      console.log(`⚠️  Unmapped demonym "${info.demonym}" for ${fighter.name} (currently: ${fighter.nationality || '—'} ${fighter.flag || ''}) — Place of Birth: ${info.placeOfBirth || '?'}`);
      unmapped++;
      await sleep(DELAY_MS);
      continue;
    }

    const [correctNat, correctFlag] = mapped;
    if (fighter.nationality !== correctNat || fighter.flag !== correctFlag) {
      console.log(`❌ ${fighter.name}: stored "${fighter.nationality || '—'}" ${fighter.flag || ''} -> should be "${correctNat}" ${correctFlag} (born: ${info.placeOfBirth || '?'})`);
      mismatches++;
      if (APPLY) {
        fighter.nationality = correctNat;
        fighter.flag = correctFlag;
      }
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n— Summary —`);
  console.log(`Checked: ${checked}/${rankedNames.size}`);
  console.log(`Mismatches found: ${mismatches}`);
  console.log(`Unmapped demonyms (need manual review): ${unmapped}`);
  console.log(`Not in fighters.json: ${notFound}`);

  if (APPLY && mismatches > 0) {
    fs.writeFileSync(FIGHTERS_PATH, JSON.stringify(fighters, null, 2));
    fs.writeFileSync(FIGHTERS_ROOT, JSON.stringify(fighters, null, 2));
    console.log(`\n✅ Wrote ${mismatches} fixes to data/fighters.json and fighters.json`);
  }
}

run().catch(e => { console.error('audit failed:', e.message); process.exit(1); });
