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
    const fighters = await API.getFighters();
    debugLog('Fighters loaded:', Object.keys(fighters).length);

    document.querySelectorAll("[data-fighter]").forEach(card => {
      card.onclick = e => {
        e.preventDefault();
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
          panel.querySelectorAll('.pfp-fight-card').forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(12px)';
            setTimeout(() => {
              el.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
              el.style.opacity = '1';
              el.style.transform = 'translateY(0)';
            }, 180 + i * 55);
          });
        });
      };
    });

    debugLog('PFP page ready!');
  } catch (error) {
    console.error('Error loading fighters:', error);
    const container = document.querySelector('.pfp-grid') || document.body;
    showError(container, 'Failed to load fighters');
  }
});
