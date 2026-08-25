// ==============================================
// MMA BRIDGE — RANKINGS PAGE
// ==============================================
// One data source (data/rankings.json, synced by rankings-sync.js) and one
// render path (renderSpotlight) drive all three tabs — Men's P4P, Women's
// P4P, and every Divisional weight class. Previously Men's P4P was a
// hand-typed static HTML list, Women's P4P was built from a completely
// different fighters.json field (pfp_women), and Divisional had its own
// third implementation — three disconnected systems that could each drift
// out of sync with reality independently. Now there's exactly one.

const DIV_LABELS = {
  'Flyweight': 'FLW', 'Bantamweight': 'BW', 'Featherweight': 'FW',
  'Lightweight': 'LW', 'Welterweight': 'WW', 'Middleweight': 'MW',
  'Light Heavyweight': 'LHW', 'Heavyweight': 'HW',
  "Women's Strawweight": 'W·STW', "Women's Flyweight": 'W·FLW',
  "Women's Bantamweight": 'W·BW', "Women's Featherweight": 'W·FW',
};

// Fighter names have to survive a round trip between two independently
// edited JSON files (rankings.json from a weekly scrape, fighters.json
// hand-maintained). Two ways this broke the join silently, falling back
// to a blank initials circle with no explanation: a curly vs straight
// apostrophe ("Lone'er Kavanagh" vs "Lone’er Kavanagh"), and un-decoded
// HTML entities from the scrape ("Sean O&#039;Malley" instead of "Sean
// O'Malley" — the &#039; itself doesn't strip to nothing, so it never
// matched "seanomalley"). Decode entities first, then strip everything
// but letters/numbers so punctuation differences can't break the match.
function normName(s) {
  return String(s || '')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .toLowerCase().normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

document.addEventListener('DOMContentLoaded', async () => {
  const photoA   = document.getElementById('divPhotoA');
  const photoB   = document.getElementById('divPhotoB');
  const pillNav  = document.getElementById('divPillNav');
  const champInfoEl = document.getElementById('divChampInfo');
  const listEl   = document.getElementById('divContenderList');
  const tabs     = document.querySelectorAll('.rnk-tab');
  const spotlight = document.getElementById('divSpotlight');

  let fighterMap = {};
  let p4pMen = null, p4pWomen = null, divisions = [];
  let activeLayer = 'A';
  let currentDivIdx = 0;
  let currentMode = 'mens-p4p'; // 'mens-p4p' | 'womens-p4p' | 'divisional'

  try {
    const ts = Date.now();
    const [rankings, fighters] = await Promise.all([
      fetch('data/rankings.json?_=' + ts, { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('data/fighters.json?_=' + ts, { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ]);

    fighters.forEach(f => { fighterMap[normName(f.name)] = f; });

    (rankings || []).forEach(d => {
      if (/pound-for-pound/i.test(d.division)) {
        if (/women/i.test(d.division)) p4pWomen = d;
        else p4pMen = d;
      }
    });
    const seen = new Set();
    divisions = (rankings || []).filter(d => {
      if (/pound-for-pound/i.test(d.division)) return false;
      if (seen.has(d.division)) return false;
      seen.add(d.division);
      return true;
    });
    // Men's divisions first, then women's — pill nav order + separator.
    divisions.sort((a, b) => {
      const aw = /women/i.test(a.division) ? 1 : 0;
      const bw = /women/i.test(b.division) ? 1 : 0;
      return aw - bw;
    });

    buildPillNav();
    if (p4pMen) renderSpotlight(p4pMen, { isP4P: true, animate: false });
    preloadUpcomingPhotos();
  } catch (e) {
    console.error('Rankings load failed:', e);
    if (listEl) listEl.innerHTML = `<div style="padding:40px 0;color:rgba(255,255,255,0.3);font-family:'Inter',sans-serif;font-size:0.85rem;">Unable to load rankings right now. Please try again.</div>`;
    return;
  }

  // ── Pill nav (Divisional weight classes only) ──────────
  function buildPillNav() {
    if (!pillNav) return;
    const menCount = divisions.filter(d => !/women/i.test(d.division)).length;
    pillNav.innerHTML = divisions.map((d, i) => {
      const isW = /women/i.test(d.division);
      const lbl = DIV_LABELS[d.division] || d.division;
      const sep = i === menCount ? '<div class="div-pill-sep"></div>' : '';
      return `${sep}<button class="div-pill${isW ? ' women' : ''}${i === 0 ? ' active' : ''}" data-di="${i}">${lbl}</button>`;
    }).join('');
    pillNav.querySelectorAll('.div-pill').forEach(p => {
      p.addEventListener('click', () => {
        const idx = parseInt(p.dataset.di);
        if (idx === currentDivIdx) return;
        currentDivIdx = idx;
        pillNav.querySelectorAll('.div-pill').forEach((el, i) => el.classList.toggle('active', i === idx));
        renderSpotlight(divisions[idx], { isP4P: false, animate: true });
      });
    });
  }

  function preloadUpcomingPhotos() {
    const all = [...(p4pMen ? [p4pMen] : []), ...(p4pWomen ? [p4pWomen] : []), ...divisions];
    all.forEach(d => {
      const hero = d.fighters.find(f => f.isChamp) || d.fighters.find(f => f.rank === 1);
      const fw = hero ? fighterMap[normName(hero.name)] : null;
      if (fw?.img) { const img = new Image(); img.src = fw.img; }
    });
  }

  // ── Tab switching ───────────────────────────────────────
  tabs.forEach(t => t.addEventListener('click', () => {
    const key = t.dataset.tab;
    if (key === currentMode) return;
    tabs.forEach(el => el.classList.toggle('active', el === t));
    currentMode = key;
    document.body.classList.toggle('is-divisional', key === 'divisional');

    if (key === 'mens-p4p'   && p4pMen)   renderSpotlight(p4pMen,   { isP4P: true, animate: true });
    if (key === 'womens-p4p' && p4pWomen) renderSpotlight(p4pWomen, { isP4P: true, animate: true });
    if (key === 'divisional') renderSpotlight(divisions[currentDivIdx], { isP4P: false, animate: true });
  }));

  // ── One render path for every tab ───────────────────────
  function renderSpotlight(entry, { isP4P, animate }) {
    if (!entry) return;
    const isW = /women/i.test(entry.division);
    const hero = isP4P
      ? entry.fighters.find(f => f.rank === 1)
      : entry.fighters.find(f => f.isChamp);
    if (!hero) return;
    const contenders = entry.fighters
      .filter(f => f !== hero && normName(f.name) !== normName(hero.name))
      .sort((a, b) => (a.rank === 'C' ? 0 : a.rank) - (b.rank === 'C' ? 0 : b.rank))
      .slice(0, 15);
    const heroFw = fighterMap[normName(hero.name)];
    const photoUrl = heroFw?.img || '';

    const apply = () => {
      updateChampInfo(entry, hero, heroFw, isW, isP4P);
      updateContenders(contenders, isW);
    };

    if (!animate) {
      if (photoUrl) { photoA.style.backgroundImage = `url('${photoUrl}')`; photoA.classList.add('active'); }
      apply();
      return;
    }

    const next = activeLayer === 'A' ? photoB : photoA;
    const curr = activeLayer === 'A' ? photoA : photoB;
    const swap = () => {
      next.classList.add('active');
      setTimeout(() => curr.classList.remove('active'), 20);
      activeLayer = activeLayer === 'A' ? 'B' : 'A';
    };
    if (photoUrl) {
      const img = new Image();
      img.onload  = () => { next.style.backgroundImage = `url('${photoUrl}')`; swap(); };
      img.onerror = () => { next.style.backgroundImage = ''; swap(); };
      img.src = photoUrl;
    } else {
      next.style.backgroundImage = '';
      swap();
    }

    listEl.classList.add('fading');
    champInfoEl.classList.add('fading');
    setTimeout(() => {
      apply();
      listEl.classList.remove('fading');
      champInfoEl.classList.remove('fading');
    }, 210);
  }

  function updateChampInfo(entry, hero, fw, isW, isP4P) {
    if (!champInfoEl) return;
    const rec = fw ? `${fw.record?.wins ?? 0}–${fw.record?.losses ?? 0}${fw.record?.draws ? '–' + fw.record.draws : ''}` : '';
    const nick = fw?.nickname ? `"${esc(fw.nickname)}"` : '';
    const divLabel = fw?.weightClass || entry.division.replace(/'s Pound-for-Pound Top Rank/i, "'s P4P").replace(/^Pound-for-Pound Top Rank/i, 'P4P');
    const badgeLabel = isP4P ? '#1 POUND-FOR-POUND' : (hero.movement === 'new-champ' ? 'NEW CHAMPION' : 'CHAMPION');
    champInfoEl.className = 'div-champ-info' + (isW ? ' women-div' : '');
    champInfoEl.innerHTML = `
      <div class="div-champ-badge${hero.movement === 'new-champ' ? ' div-champ-badge-new' : ''}">${badgeLabel}</div>
      <div class="div-champ-division">${esc(divLabel)}${fw?.flag ? ' · ' + fw.flag : ''}</div>
      ${nick ? `<div class="div-champ-nickname">${nick}</div>` : ''}
      <div class="div-champ-name">${esc(hero.name)}</div>
      ${rec ? `<div class="div-champ-record">${rec}</div>` : ''}
    `;
  }

  function updateContenders(contenders, isW) {
    if (!listEl) return;
    const gold = isW ? 'rgba(240,100,200,0.5)' : 'rgba(255,138,61,0.5)';
    listEl.innerHTML = `
      <div class="div-contenders-header">
        <span class="div-contenders-label">Contenders</span>
        <div class="div-contenders-line"></div>
      </div>
      ${contenders.map(f => {
        const fw  = fighterMap[normName(f.name)];
        const rec = fw ? `${fw.record?.wins ?? '?'}–${fw.record?.losses ?? '?'}${fw.record?.draws ? '–' + fw.record.draws : ''}` : '';
        const photo = fw?.img || '';
        const init  = f.name.trim().split(/\s+/).pop().substring(0, 2).toUpperCase();
        const rankColor = typeof f.rank === 'number' && f.rank <= 3 ? `color:${gold}` : '';
        // Every row gets a movement indicator — a neutral dash for "same"
        // instead of nothing, so the list doesn't read like most rows were
        // never updated (only the ones that happened to move showed
        // anything at all before).
        const moveHtml = f.movement === 'up'
          ? `<span class="div-move div-move-up">▲ ${(f.prevRank ?? f.rank) - f.rank}</span>`
          : f.movement === 'down'
            ? `<span class="div-move div-move-down">▼ ${f.rank - (f.prevRank ?? f.rank)}</span>`
            : f.movement === 'new'
              ? `<span class="div-move div-move-new">NEW</span>`
              : `<span class="div-move div-move-same">–</span>`;
        return `<div class="div-contender-row" data-name="${esc(f.name)}">
          <div class="div-contender-rank" style="${rankColor}">#${f.rank}</div>
          <div class="div-contender-photo" ${photo ? `style="background-image:url('${photo}')"` : ''}>${photo ? '' : init}</div>
          <div class="div-contender-info">
            <div class="div-contender-name">${esc(f.name)}</div>
            ${rec ? `<div class="div-contender-rec">${rec}</div>` : ''}
          </div>
          ${moveHtml}
        </div>`;
      }).join('')}
    `;
  }

  // ── Row / hero clicks → fighter profile, same tab ───────
  document.addEventListener('click', e => {
    const row = e.target.closest('.div-contender-row, .div-champ-info');
    if (!row || !spotlight.contains(row)) return;
    const name = row.dataset.name || row.querySelector('.div-champ-name')?.textContent?.trim();
    if (name) window.location.href = 'fighter.html?name=' + encodeURIComponent(name);
  });
});
