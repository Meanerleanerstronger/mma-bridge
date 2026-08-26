#!/usr/bin/env node
// Re-scrapes each fighter's actual UFC.com fight history and replaces
// last5 with verified data. Built because the existing last5 arrays had
// fabricated/duplicated entries (e.g. Arman Tsarukyan's last5 claimed a
// win over Renato Moicano that never happened, and listed Beneil Dariush
// twice for what was actually one fight).
//
// Usage:
//   node scripts/audit-last5.js                 # dry run, ranked fighters only
//   node scripts/audit-last5.js --apply          # write fixes
//   node scripts/audit-last5.js --all --apply    # every fighter with an existing last5, not just ranked

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

const FIGHTERS_PATHS = ['data/fighters.json', 'fighters.json'];
const RANKINGS_PATH = 'data/rankings.json';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

// The card's headshot alt text is normally just the fighter's name, but
// promo images (a belt-badge shot, a "posing in fight kit" photo-op
// shot) carry a whole sentence instead — "UFC interim heavyweight
// champion Ciryl Gane", "Aiemann Zahabi posing in UFC Freedom 250 fight
// kit". Strip the champion-title prefix, then bail to the slug-derived
// name (the caller's fallback) if what's left still isn't just a name.
function cleanOpponentName(raw, fallback) {
  const cleaned = decodeEntities(raw)
    .replace(/^UFC\s+(?:[A-Za-z']+\s+){0,3}champion\s+/i, '')
    .trim();
  if (cleaned.split(/\s+/).length > 4 || /\b(posing|face off|celebrat|weigh-in|press conference|fight kit|walkout|during the|kicks|punches)\b/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function eventNameFromSlug(slug, dateStr) {
  let s = slug.replace(/^[a-z0-9]+-ufc-(\d)/, 'ufc-$1'); // strip sponsor prefix e.g. cryptocom-ufc-331
  const mNum = s.match(/^ufc-(\d{2,4})(?:-|$)/);
  if (mNum) return `UFC ${mNum[1]}`;
  if (s.startsWith('ufc-fight-night')) return `UFC Fight Night${dateStr ? ': ' + dateStr : ''}`;
  return s.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

function methodFromRaw(raw) {
  const s = (raw || '').trim();
  if (/^ko\/?tko/i.test(s)) return 'KO/TKO';
  if (/^submission/i.test(s)) return 'Submission';
  if (/^decision/i.test(s)) {
    const m = s.match(/decision\s*-\s*(\w+)/i);
    return m ? `Decision (${m[1].toLowerCase()})` : 'Decision';
  }
  if (/dq/i.test(s)) return 'DQ';
  return s || 'Decision';
}

async function fetchPage(slug, page) {
  const res = await fetch(`https://www.ufc.com/athlete/${slug}${page ? '?page=' + page : ''}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
  });
  if (!res.ok) return null;
  return res.text();
}

// Results list is paginated 3-per-page (?page=0,1,2...) — need at least
// two pages to cover a full last 5.
async function fetchAthleteHistory(slug) {
  const html0 = await fetchPage(slug, 0);
  if (!html0) return null;
  await new Promise(r => setTimeout(r, 250));
  const html1 = await fetchPage(slug, 1);
  const html = html0 + (html1 || '');
  const articles = html.split('<article class="c-card-event--athlete-results">').slice(1);
  const fights = [];
  const seen = new Set();
  for (const block of articles) {
    if (fights.length >= 5) break;
    const selfImg = block.match(new RegExp(`athlete-results__(?:red|blue)-image ([a-z]+)"[\\s\\S]{0,260}?athlete/${slug}"`));
    const oppHref = [...block.matchAll(/href="https:\/\/www\.ufc\.com\/athlete\/([a-z0-9-]+)"/g)].map(m => m[1]).find(s => s !== slug);
    if (!selfImg || !oppHref) continue;
    const dateM = block.match(/athlete-results__date">([^<]+)</);
    const dedupeKey = `${oppHref}|${dateM ? dateM[1] : ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const resultRaw = selfImg[1];
    const result = resultRaw === 'win' ? 'W' : resultRaw === 'loss' ? 'L' : resultRaw === 'draw' ? 'D' : 'NC';
    const roundM = block.match(/Round<\/div>\s*<div class="c-card-event--athlete-results__result-text">([^<]+)</);
    const timeM = block.match(/Time<\/div>\s*<div class="c-card-event--athlete-results__result-text">([^<]+)</);
    const methodM = block.match(/Method<\/div>\s*<div class="c-card-event--athlete-results__result-text">([^<]+)</);
    const eventHrefM = block.match(/href="https:\/\/www\.ufc\.com\/event\/([a-z0-9-]+)(?:#[^"]*)?"/);
    // Opponent's headshot alt text carries the full name; the headline
    // link only has the last name.
    const oppAltM = block.match(new RegExp(`athlete/${oppHref}"[\\s\\S]{0,200}?alt="([^"]+)"`));
    const dateStr = dateM ? dateM[1].trim() : '';
    fights.push({
      opponent: (() => {
        const fallback = oppHref.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        return oppAltM ? cleanOpponentName(oppAltM[1], fallback) : fallback;
      })(),
      result,
      method: methodFromRaw(methodM ? methodM[1] : ''),
      event: eventHrefM ? eventNameFromSlug(eventHrefM[1], dateStr) : '',
      round: roundM ? parseInt(roundM[1]) || null : null,
      time: timeM ? timeM[1].trim() : null,
    });
  }
  return fights;
}

function fightsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((f, i) => f.opponent === b[i].opponent && f.result === b[i].result);
}

async function main() {
  const fightersA = JSON.parse(fs.readFileSync(FIGHTERS_PATHS[0], 'utf8'));
  const fightersB = fs.existsSync(FIGHTERS_PATHS[1]) ? JSON.parse(fs.readFileSync(FIGHTERS_PATHS[1], 'utf8')) : null;

  let names;
  const nameArg = process.argv.find(a => a.startsWith('--name='));
  if (nameArg) {
    names = [nameArg.slice('--name='.length)];
  } else if (ALL) {
    names = fightersA.filter(f => f.last5 && f.last5.length).map(f => f.name);
  } else {
    const rankings = JSON.parse(fs.readFileSync(RANKINGS_PATH, 'utf8'));
    const set = new Set();
    rankings.forEach(div => div.fighters.forEach(f => set.add(f.name)));
    names = [...set];
  }

  console.log(`Auditing last5 for ${names.length} fighters...`);
  let changed = 0, errored = 0, unchanged = 0;

  for (const name of names) {
    const slug = slugify(name);
    try {
      const fresh = await fetchAthleteHistory(slug);
      if (!fresh || !fresh.length) { console.log(`  [skip] ${name} — no history found`); errored++; continue; }
      const fA = fightersA.find(f => f.name === name);
      const current = fA?.last5 || [];
      if (fightsEqual(current, fresh)) { unchanged++; continue; }
      changed++;
      console.log(`\n[DIFF] ${name}`);
      console.log('  was:', current.map(f => `${f.opponent} (${f.result})`).join(', ') || '(none)');
      console.log('  now:', fresh.map(f => `${f.opponent} (${f.result})`).join(', '));
      if (APPLY) {
        if (fA) fA.last5 = fresh;
        if (fightersB) { const fB = fightersB.find(f => f.name === name); if (fB) fB.last5 = fresh; }
      }
    } catch (e) {
      console.log(`  [error] ${name} — ${e.message}`);
      errored++;
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\nDone. changed=${changed} unchanged=${unchanged} errored=${errored}`);
  if (APPLY && changed) {
    fs.writeFileSync(FIGHTERS_PATHS[0], JSON.stringify(fightersA, null, 2));
    if (fightersB) fs.writeFileSync(FIGHTERS_PATHS[1], JSON.stringify(fightersB, null, 2));
    console.log('Written.');
  }
}

main();
