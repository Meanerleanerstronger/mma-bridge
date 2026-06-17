// ==============================================
// MMA BRIDGE - PFP PAGE (PREMIUM REDESIGN)
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';
import { showLoading, showError } from './loading.js';

const FIGHTER_PHOTOS = {
  'islam-makhachev':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/7/MAKHACHEV_ISLAM_L_BELT_01-18.png',
  'ilia-topuria':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-10/TOPURIA_ILIA_L_BELT_10-26.png',
  'khamzat-chimaev':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-08/CHIMAEV_KHAMZAT_L_BELTMOCK.png',
  'alex-pereira':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-03/PEREIRA_ALEX_L.png',
  'alexander-volkanovski':'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/VOLKANOVSKI_ALEXANDER_L_BELT_01-31.png',
  'petr-yan':             'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/YAN_PETR_L_BELT_04-09.png',
  'merab-dvalishvili':    'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2022-08/DVALISHVILI_MERAB_L_08-20.png',
  'tom-aspinall':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-10/ASPINALL_TOM_L_BELT_10-25.png',
  'alexandre-pantoja':    'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/PANTOJA_ALEXANDRE_L_07-08.png',
  'max-holloway':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-04/HOLLOWAY_MAX_L_04-13.png',
  'dricus-du-plessis':    'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-08/DU_PLESSIS_DRICUS_L_01-20.png',
  'joshua-van':           'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-12/VAN_JOSHUA_L_BELTMOCK.png',
  'magomed-ankalaev':     'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-10/ANKALAEV_MAGOMED_L_10-26.png',
  'arman-tsarukyan':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-11/TSARUKYAN_ARMAN_L_11-22.png',
  'carlos-ulberg':        'https://www.ufc.com/images/styles/athlete_bio_full_body/s3/2026-04/ULBERG_CARLOS_L_BELTMOCK.png',
  'justin-gaethje':       'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/GAETHJE_JUSTIN_L_BELTMOCK.png',
  'sean-omalley':         'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/OMALLEY_SEAN_L_01-24.png',
  'sean-strickland':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-01/STRICKLAND_SEAN_L_BELT_01-20.png',
  'charles-oliveira':     'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2023-06/OLIVEIRA_CHARLES_L_06-10.png',
  'conor-mcgregor':       'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2021-07/MCGREGOR_CONOR_L_07-10.png',
  'ciryl-gane':           'https://ufc.com/images/styles/athlete_bio_full_body/s3/2026-06/GANE_CIRYL_R_06-14.png',
  'charles-oliveira':     'https://ufc.com/images/styles/athlete_bio_full_body/s3/2026-03/OLIVEIRA_CHARLES_L_BMFMOCK.png',
};

function burstParticles(x, y) {
  const colors = [
    'rgba(0,229,255,0.95)',
    'rgba(200,168,75,0.95)',
    'rgba(255,255,255,0.85)',
    'rgba(0,180,255,0.8)',
  ];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'pfp-burst-particle';
    const size = 5 + Math.random() * 9;
    const angle = (i / count) * 360 + Math.random() * 30;
    const dist  = 35 + Math.random() * 65;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dur   = 380 + Math.random() * 220;
    const tx = Math.cos(angle * Math.PI / 180) * dist;
    const ty = Math.sin(angle * Math.PI / 180) * dist;
    el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`
      + `background:${color};box-shadow:0 0 ${size * 2}px ${color};`
      + `--tx:${tx}px;--ty:${ty}px;`
      + `animation:pfp-burst ${dur}ms cubic-bezier(0.2,0,0.8,1) forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), dur + 50);
  }
}

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

  function methodColor(method) {
    if (!method) return '#555';
    const m = method.toUpperCase();
    if (m.includes('KO') || m.includes('TKO')) return '#e53935';
    if (m.includes('SUB') || m.includes('CHOKE') || m.includes('CRANK') || m.includes('TRIANGLE') || m.includes('RNC')) return '#8b5cf6';
    if (m.includes('NC') || m.includes('NO CONTEST')) return '#555';
    return '#1a6ccc';
  }

  function methodLabel(method) {
    if (!method) return '';
    const m = method.toUpperCase();
    if (m.includes('KO') && !m.includes('TKO')) return 'KO';
    if (m.includes('TKO')) return 'TKO';
    if (m.includes('SUB') || m.includes('CHOKE') || m.includes('CRANK') || m.includes('TRIANGLE') || m.includes('RNC')) return 'SUB';
    if (m.includes('UD')) return 'UD';
    if (m.includes('SD')) return 'SD';
    if (m.includes('MD')) return 'MD';
    if (m.includes('NC') || m.includes('NO CONTEST')) return 'NC';
    return method;
  }

  function renderLast5(fights) {
    if (!fights?.length) return `<p style="color:rgba(255,255,255,0.4);padding:16px 0;font-family:'Montserrat',sans-serif;font-size:0.82rem;">No recent fights on record</p>`;

    const streak = fights.slice(0, 5).map(f => (f.result || '').toUpperCase());

    const streakHtml = `
      <div class="pfp-streak-bar">
        ${streak.map(r => {
          const bg = r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#444';
          return `<div class="pfp-streak-pill" style="background:${bg};">${r}</div>`;
        }).join('')}
      </div>`;

    const cardsHtml = fights.slice(0, 5).map(f => {
      const r      = (f.result || '').toUpperCase();
      const cls    = r === 'W' ? 'win' : r === 'L' ? 'loss' : 'nc';
      const resBg  = r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#555';
      const mColor = methodColor(f.method);
      const mLabel = methodLabel(f.method);
      return `
        <div class="pfp-fight-card ${cls}">
          <div class="pfp-fight-top">
            <div class="pfp-fight-result-badge" style="background:${resBg};">${r}</div>
            <div class="pfp-fight-opponent">vs ${esc(f.opponent)}</div>
          </div>
          <div class="pfp-fight-details">
            <span class="pfp-fight-method" style="background:${mColor}20;border:1px solid ${mColor}50;color:${mColor};">${esc(mLabel)}</span>
            ${f.method && mLabel !== f.method ? `<span class="pfp-fight-info">${esc(f.method)}</span>` : ''}
            <span class="pfp-fight-info" style="margin-left:auto;">R${esc(String(f.round))} · ${esc(f.time||'')}</span>
          </div>
          ${f.event ? `<div class="pfp-fight-event-name">${esc(f.event)}</div>` : ''}
        </div>`;
    }).join('');

    return streakHtml + cardsHtml;
  }

  // ==============================================
  // LOAD + RENDER
  // ==============================================
  try {
    debugLog('Loading PFP page...');

    // Load directly from local JSON — no backend dependency, no cold-start delay
    const rawList = await fetch('data/fighters.json?_=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => []);

    // Build a slug-keyed map that matches the shape pfp.js expects
    const fighters = {};
    rawList.forEach(f => {
      const rec = f.record || {};
      const wins   = rec.wins   ?? 0;
      const losses = rec.losses ?? 0;
      const draws  = rec.draws  ?? 0;
      const recordStr = draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`;

      // Rank: read from DOM for P4P fighters; fall back to f.pfp or null
      const domRow = document.querySelector(`[data-fighter="${f.id}"] .pfp-row-num`);
      const rank = domRow ? (parseInt(domRow.textContent) || null) : (f.pfp || null);

      fighters[f.id] = {
        name:      f.name,
        record:    recordStr,
        division:  f.weightClass || f.division || '',
        stance:    f.stance || '—',
        height:    f.height || '—',
        reach:     f.reach  || '—',
        flag:      f.flag   || '',
        country:   f.fightingOut || f.nationality || '',
        champion:  f.ranking || null,
        last5:     f.last5  || [],
        rank,
      };
    });

    debugLog('Fighters loaded:', Object.keys(fighters).length);

    document.querySelectorAll("[data-fighter]").forEach(card => {
      card.onclick = e => {
        e.preventDefault();
        // Burst particles from click point
        burstParticles(e.clientX, e.clientY);
        card.classList.remove('pfp-row-tapping');
        void card.offsetWidth;
        card.classList.add('pfp-row-tapping');

        const slug = card.dataset.fighter;
        const f = fighters[slug];
        if (!f) return;

        const photo = FIGHTER_PHOTOS[slug] || '';
        const panel = document.querySelector('#fightDrawer .drawer-panel');

        const champBadge = f.champion
          ? `<span class="pfp-modal-champ-badge">⚡ ${esc(f.champion)}</span>`
          : '';

        const statsHtml = `
          <div class="pfp-division-header">${esc(f.division||'')}</div>
          <div class="pfp-stats-grid">
            ${[['Record',f.record],['Stance',f.stance],['Height',f.height],['Reach',f.reach]].map(([lbl,val]) => `
              <div class="pfp-stat-box">
                <div class="pfp-stat-val">${esc(val||'—')}</div>
                <div class="pfp-stat-lbl">${lbl}</div>
              </div>`).join('')}
          </div>`;

        panel.innerHTML = `
          <div class="pfp-photo-col">
            ${photo ? `<img class="pfp-photo-col-img" src="${photo}" onerror="this.style.display='none'">` : ''}
            <div class="pfp-photo-col-grad"></div>
            <div class="pfp-photo-col-info">
              <div class="pfp-modal-rank-tag">#${f.rank || '?'} P4P</div>
              <div class="pfp-modal-fighter-name">${esc(f.name)}</div>
              <div class="pfp-modal-meta-row">
                <span class="pfp-modal-record">${esc(f.record)}</span>
                ${champBadge ? `<span class="pfp-modal-sep"></span>${champBadge}` : ''}
              </div>
            </div>
          </div>
          <div class="pfp-info-col">
            <div class="pfp-info-topbar">
              <span class="pfp-info-country">
                <span class="pfp-country-flag">${esc(f.flag||'')}</span>
                <span class="pfp-country-name">${esc(f.country||'')}</span>
              </span>
              <button class="drawer-x" id="pfpModalX" aria-label="Close">✕</button>
            </div>
            <div class="pfp-info-scroll">
              ${statsHtml}
              <div class="pfp-section-lbl">Last 5 Fights</div>
              ${renderLast5(f.last5)}
            </div>
          </div>`;

        document.getElementById('pfpModalX').onclick = closeDrawer;

        drawer.classList.add("open");
        document.body.classList.add("no-scroll");

        requestAnimationFrame(() => {
          // Stat boxes
          if (window.MicroStaggerStats) MicroStaggerStats(panel);
          // Streak pills
          if (window.MicroStaggerPills) MicroStaggerPills(panel.querySelector('.pfp-streak-bar'));
          // Fight history cards
          panel.querySelectorAll('.pfp-fight-card').forEach((el, i) => {
            el.classList.remove('micro-stagger-up');
            el.style.animationDelay = (220 + i * 60) + 'ms';
            void el.offsetWidth;
            el.classList.add('micro-stagger-up');
          });
        });
      };
    });

    debugLog('PFP page ready!');
  } catch (error) {
    console.error('Error loading fighters:', error);
    const container = document.querySelector('.pfp-grid') || document.body;
    showError(container, 'Unable to load rankings right now. Please try again.');
  }
});
