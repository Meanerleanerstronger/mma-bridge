// ==============================================
// MMA BRIDGE - PFP PAGE (PREMIUM REDESIGN)
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';
import { showLoading, showError } from './loading.js';

const FIGHTER_PHOTOS = {
  // Men's P4P
  'islam-makhachev':        'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/7/MAKHACHEV_ISLAM_L_BELT_01-18.png',
  'ilia-topuria':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-10/TOPURIA_ILIA_L_BELT_10-26.png',
  'khamzat-chimaev':        'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-08/CHIMAEV_KHAMZAT_L_BELTMOCK.png',
  'alex-pereira':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-03/PEREIRA_ALEX_L.png',
  'alexander-volkanovski':  'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/VOLKANOVSKI_ALEXANDER_L_BELT_01-31.png',
  'petr-yan':               'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/YAN_PETR_L_BELT_04-09.png',
  'merab-dvalishvili':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2022-08/DVALISHVILI_MERAB_L_08-20.png',
  'tom-aspinall':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-10/ASPINALL_TOM_L_BELT_10-25.png',
  'alexandre-pantoja':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/PANTOJA_ALEXANDRE_L_07-08.png',
  'max-holloway':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-04/HOLLOWAY_MAX_L_04-13.png',
  'joshua-van':             'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/VAN_JOSHUA_L_BELTMOCK.png',
  'arman-tsarukyan':        'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-11/TSARUKYAN_ARMAN_L_11-22.png',
  'justin-gaethje':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/GAETHJE_JUSTIN_L_BELTMOCK.png',
  'sean-omalley':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/OMALLEY_SEAN_L_01-24.png',
  'sean-strickland':        'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-01/STRICKLAND_SEAN_L_BELT_01-20.png',
  'charles-oliveira':       'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-03/OLIVEIRA_CHARLES_L_BMFMOCK.png',
  'ciryl-gane':             'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-06/GANE_CIRYL_R_06-14.png',
  // Women's P4P
  'valentina-shevchenko':   'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-11/SHEVCHENKO_VALENTINA_L_BELT_11-15.png',
  'kayla-harrison':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-06/HARRISON_KAYLA_L_BELTMOCK.png',
  'zhang-weili':            'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2022-06/d6bd47bc-d423-4ae8-9073-f0abd7777751%252FWEILI_ZHANG_L_06-11.png',
  'natalia-silva':          'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/SILVA_NATALIA_L_01-24.png',
  'manon-fiorot':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-10/FIOROT_MANON_L_10-18.png',
  'mackenzie-dern':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-10/DERN_MACKENZIE_L_BELT.png',
  'alexa-grasso':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-03/GRASSO_ALEXA_L_03-28.png',
  'erin-blanchfield':       'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-11/BLANCHFIELD_ERIN_L_11-15.png',
  'julianna-pena':          'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2022-08/PENA_JULIANNA_L_12-11.png',
  'tatiana-suarez':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-04/SUAREZ_TATIANA_L_04-11.png',
  'virna-jandiroba':        'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-04/JANDIROBA_VIRNA_L_04-04.png',
  'raquel-pennington':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/5/PENNINGTON_RAQUEL_L_01-20.png',
  'yan-xiaonan':            'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-04/XIAONAN_YAN_L_04-12.png',
  'rose-namajunas':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-06/NAMAJUNAS_ROSE_L_06-14.png',
  'maycee-barber':          'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/BARBER_MAYCEE_L_12-06.png',
};

document.addEventListener("DOMContentLoaded", async () => {
  const drawer      = document.getElementById("fightDrawer");
  const drawerClose = document.getElementById("drawerClose");
  const drawerX     = document.getElementById("drawerX");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerContent = document.getElementById("drawerContent");

  const esc = (s) => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function openDrawer(title, html) {
    drawerTitle.textContent = title;
    drawerContent.innerHTML = html;
    drawer.classList.add("open");
    document.body.classList.add("no-scroll");

    // Staggered animation for fight cards
    requestAnimationFrame(() => {
      drawerContent.querySelectorAll('.bout-card').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(14px)';
        setTimeout(() => {
          el.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, 80 + i * 65);
      });
    });
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    document.body.classList.remove("no-scroll");
  }

  drawerClose.onclick = closeDrawer;
  drawerX.onclick     = closeDrawer;
  document.addEventListener("keydown", e => e.key === "Escape" && closeDrawer());

  // ==============================================
  // LOAD + RENDER
  // ==============================================
  try {
    debugLog('Loading PFP page...');

    const rawList = await fetch('data/fighters.json?_=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => []);

    // Build slug-keyed fighter map
    const fighters = {};
    rawList.forEach(f => {
      const rec = f.record || {};
      const wins = rec.wins ?? 0, losses = rec.losses ?? 0, draws = rec.draws ?? 0;
      const recordStr = draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`;
      const domRow = document.querySelector(`[data-fighter="${f.id}"] .pfp-row-num`);
      const rank = domRow ? (parseInt(domRow.textContent) || null) : (f.pfp || null);
      fighters[f.id] = {
        name: f.name, record: recordStr,
        division: f.weightClass || f.division || '',
        stance: f.stance || '—', height: f.height || '—', reach: f.reach || '—',
        flag: f.flag || '', country: f.fightingOut || f.nationality || '',
        champion: f.ranking || null, last5: f.last5 || [],
        rank,
        rankWomen: f.pfp_women || null,
        gender: f.gender || 'male',
      };
    });

    // Sorted women's list for dynamic grid
    const womenList = rawList
      .filter(f => f.gender === 'female' && f.pfp_women)
      .sort((a, b) => a.pfp_women - b.pfp_women);

    // ── Render women's grid into #pfpWomenGrid ──
    function buildWomenGrid() {
      const grid = document.getElementById('pfpWomenGrid');
      if (!grid || grid.dataset.built) return;
      grid.dataset.built = '1';
      const left = document.createElement('div');
      const right = document.createElement('div');
      womenList.forEach((f, i) => {
        if (i === 0) return; // #1 shown in hero
        const rec = f.record || {};
        const wins = rec.wins ?? 0, losses = rec.losses ?? 0, draws = rec.draws ?? 0;
        const recStr = draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`;
        const photo = FIGHTER_PHOTOS[f.id] || f.img || '';
        const champLabel = f.ranking || '';
        const isChamp = champLabel.toLowerCase().includes('champ');
        const row = document.createElement('div');
        row.className = 'pfp-row';
        row.dataset.fighter = f.id;
        row.innerHTML = `
          <div class="pfp-row-num">${f.pfp_women}</div>
          <div class="pfp-row-photo" style="${photo ? `background-image:url('${photo}')` : ''}"></div>
          <div class="pfp-row-info">
            <div class="pfp-row-name">${esc(f.name)}</div>
            <div class="pfp-row-sub">${esc(f.weightClass||'')} · ${esc(f.flag||'')}${isChamp ? ` <span class="pfp-row-champ">${esc(champLabel)}</span>` : ''}</div>
          </div>
          <div class="pfp-row-rec">${recStr}</div>`;
        (i < 8 ? left : right).appendChild(row);
      });
      grid.appendChild(left);
      grid.appendChild(right);
    }

    // ── Toggle logic ──
    let showingWomen = false;
    const toggleBtn   = document.getElementById('pfpGenderToggle');
    const menSection  = document.getElementById('pfpMenSection');
    const womenSection = document.getElementById('pfpWomenSection');
    const listTitle   = document.getElementById('pfpListTitle');
    const heroEl      = document.querySelector('.pfp-hero');

    // Men's hero data
    const menHero = {
      photo: 'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/7/MAKHACHEV_ISLAM_L_BELT_01-18.png',
      tag: '#1 Pound for Pound · June 2026',
      name: 'Islam<br>Makhachev',
      record: '28–1',
      div: 'Lightweight · 🇷🇺',
      champ: 'LW Champion',
      slug: 'islam-makhachev',
    };
    // Women's hero — Valentina
    const womenHeroF = womenList[0];
    const womenHero = womenHeroF ? {
      photo: FIGHTER_PHOTOS[womenHeroF.id] || womenHeroF.img || '',
      tag: '#1 Women\'s P4P · June 2026',
      name: womenHeroF.name.replace(' ', '<br>'),
      record: (() => { const r = womenHeroF.record||{}; const w=r.wins??0,l=r.losses??0,d=r.draws??0; return d>0?`${w}–${l}–${d}`:`${w}–${l}`; })(),
      div: `${womenHeroF.weightClass||''} · ${womenHeroF.flag||''}`,
      champ: womenHeroF.ranking || '',
      slug: womenHeroF.id,
    } : null;

    function setHero(data) {
      if (!heroEl || !data) return;
      heroEl.dataset.fighter = data.slug;
      heroEl.querySelector('.pfp-hero-photo').style.backgroundImage = `url('${data.photo}')`;
      heroEl.querySelector('.pfp-hero-tag').textContent = data.tag;
      heroEl.querySelector('.pfp-hero-name').innerHTML = data.name;
      heroEl.querySelector('.pfp-hero-record').textContent = data.record;
      heroEl.querySelector('.pfp-hero-div').textContent = data.div;
      heroEl.querySelector('.pfp-hero-champ').textContent = data.champ;
    }

    function switchToWomen() {
      if (showingWomen) return;
      showingWomen = true;
      buildWomenGrid();
      if (listTitle) listTitle.textContent = "Women's Pound-for-Pound";
      // Fade in women's section (tab handles display toggling)
      requestAnimationFrame(() => {
        womenSection.style.opacity = '0';
        womenSection.style.transform = 'translateY(14px)';
        requestAnimationFrame(() => {
          womenSection.style.transition = 'opacity 0.38s ease, transform 0.38s ease';
          womenSection.style.opacity = '1';
          womenSection.style.transform = 'translateY(0)';
          setTimeout(() => { womenSection.style.transition = ''; }, 400);
        });
      });
      attachRowClicks();
      if (womenHero) setHero(womenHero);
    }

    function switchToMen() {
      if (!showingWomen) return;
      showingWomen = false;
      if (listTitle) listTitle.textContent = "Men's Pound-for-Pound";
      requestAnimationFrame(() => {
        menSection.style.opacity = '0';
        menSection.style.transform = 'translateY(14px)';
        requestAnimationFrame(() => {
          menSection.style.transition = 'opacity 0.38s ease, transform 0.38s ease';
          menSection.style.opacity = '1';
          menSection.style.transform = 'translateY(0)';
          setTimeout(() => { menSection.style.transition = ''; }, 400);
        });
      });
      attachRowClicks();
      setHero(menHero);
    }

    // Expose for tab system
    window.pfpSwitchToMen   = switchToMen;
    window.pfpSwitchToWomen = switchToWomen;

    function attachRowClicks() {
      document.querySelectorAll("[data-fighter]").forEach(card => {
      card.onclick = e => {
        e.preventDefault();
        const slug = card.dataset.fighter;
        if (!slug) return;
        window.location.href = `fighter.html?id=${encodeURIComponent(slug)}`;
      };
    }); // end forEach
    } // end attachRowClicks

    attachRowClicks();
    debugLog('PFP page ready!');
  } catch (error) {
    console.error('Error loading fighters:', error);
    const container = document.querySelector('.pfp-grid') || document.body;
    showError(container, 'Unable to load rankings right now. Please try again.');
  }
});
