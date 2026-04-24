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
  'jack-della-maddalena': 'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/5/DELLA_MADDALENA_JACK_L_09-16.png',
  'arman-tsarukyan':      'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-11/TSARUKYAN_ARMAN_L_11-22.png',
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

  function renderLast5(fights, slug) {
    if (!fights?.length) return `<p style="color:rgba(255,255,255,0.4);padding:16px 0;">No recent fights on record</p>`;

    const streak = fights.slice(0, 5).map(f => (f.result || '').toUpperCase());

    // Streak bar
    const streakHtml = `
      <div style="display:flex;gap:6px;margin-bottom:24px;">
        ${streak.map(r => {
          const bg = r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#555';
          return `<div style="
            flex:1;height:36px;border-radius:6px;background:${bg};
            display:flex;align-items:center;justify-content:center;
            font-family:Montserrat,sans-serif;font-weight:900;font-size:0.85rem;
            color:#fff;letter-spacing:0.06em;
          ">${r}</div>`;
        }).join('')}
      </div>`;

    // Fight cards
    const cardsHtml = fights.slice(0, 5).map((f, i) => {
      const r     = (f.result || '').toUpperCase();
      const color = r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#6b7280';
      const bgTint = r === 'W' ? 'rgba(22,163,74,0.06)' : r === 'L' ? 'rgba(220,38,38,0.06)' : 'rgba(255,255,255,0.03)';
      const mColor = methodColor(f.method);
      const mLabel = methodLabel(f.method);

      return `
        <div class="bout-card" style="
          background:${bgTint};
          border:1px solid rgba(255,255,255,0.06);
          border-left:3px solid ${color};
          border-radius:8px;
          padding:14px 16px;
          margin-bottom:8px;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="
              width:28px;height:28px;border-radius:6px;
              background:${color};
              display:flex;align-items:center;justify-content:center;
              font-family:Montserrat,sans-serif;font-weight:900;font-size:0.75rem;
              color:#fff;flex-shrink:0;
            ">${r}</div>
            <div style="font-family:Montserrat,sans-serif;font-weight:800;font-size:1rem;color:#fff;flex:1;">
              vs ${esc(f.opponent)}
            </div>
          </div>

          <div style="font-size:0.62rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
            color:rgba(255,255,255,0.3);margin-bottom:8px;">
            ${esc(f.event || '')}
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="
              padding:3px 10px;border-radius:4px;
              background:${mColor}22;border:1px solid ${mColor}55;
              font-size:0.65rem;font-weight:800;letter-spacing:0.1em;
              text-transform:uppercase;color:${mColor};
            ">${esc(mLabel)}</div>

            ${f.method && mLabel !== esc(f.method) ? `<div style="
              font-size:0.62rem;color:rgba(255,255,255,0.4);
            ">${esc(f.method)}</div>` : ''}

            <div style="
              margin-left:auto;
              font-family:monospace;font-size:0.72rem;
              color:rgba(255,255,255,0.35);letter-spacing:0.04em;
            ">R${esc(String(f.round))} · ${esc(f.time || '')}</div>
          </div>
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

        const photo = FIGHTER_PHOTOS[slug];
        const champBadge = f.champion
          ? `<div style="display:inline-block;padding:3px 10px;border-radius:4px;background:rgba(200,168,75,0.15);border:1px solid rgba(200,168,75,0.4);font-size:0.6rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#c8a84b;margin-top:6px;">⚡ Champion</div>`
          : '';

        drawerTitle.textContent = f.name;
        drawerContent.innerHTML = `

          ${photo ? `
          <div style="
            position:relative;width:calc(100% + 48px);margin:-24px -24px 0 -24px;
            height:200px;overflow:hidden;border-radius:0;
          ">
            <img src="${photo}" style="
              width:100%;height:100%;object-fit:cover;object-position:center top;
              display:block;filter:brightness(0.7);
            " onerror="this.parentElement.style.display='none'"/>
            <div style="
              position:absolute;bottom:0;left:0;right:0;height:120px;
              background:linear-gradient(transparent, #111);
            "></div>
            <div style="
              position:absolute;bottom:16px;left:20px;
              font-family:Montserrat,sans-serif;font-weight:900;
              font-size:1.5rem;color:#fff;letter-spacing:0.02em;
              text-shadow:0 2px 8px rgba(0,0,0,0.8);
            ">${esc(f.name)}</div>
          </div>` : ''}

          <div style="padding-top:${photo ? '16px' : '0'};margin-bottom:20px;">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
              <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${esc(f.flag)} ${esc(f.country)}</span>
              <span style="width:1px;height:12px;background:rgba(255,255,255,0.15);"></span>
              <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${esc(f.record)}</span>
              <span style="width:1px;height:12px;background:rgba(255,255,255,0.15);"></span>
              <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${esc(f.division)}</span>
            </div>
            ${champBadge}
          </div>

          <div style="font-size:0.56rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;
            color:rgba(255,255,255,0.25);margin-bottom:14px;display:flex;align-items:center;gap:10px;">
            <span>Last 5 Fights</span>
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div>
          </div>

          ${renderLast5(f.last5, slug)}

          <div style="font-size:0.56rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;
            color:rgba(255,255,255,0.25);margin:20px 0 14px;display:flex;align-items:center;gap:10px;">
            <span>Profile</span>
            <div style="flex:1;height:1px;background:rgba(255,255,255,0.07);"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${[['Stance',f.stance],['Age',f.age],['Height',f.height],['Reach',f.reach]].map(([label,val]) => `
              <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:10px 12px;">
                <div style="font-size:0.58rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
                  color:rgba(255,255,255,0.3);margin-bottom:4px;">${label}</div>
                <div style="font-size:0.9rem;font-weight:700;color:#fff;">${esc(val)}</div>
              </div>`).join('')}
          </div>
        `;

        drawer.classList.add("open");
        document.body.classList.add("no-scroll");

        // Stagger animation
        requestAnimationFrame(() => {
          drawerContent.querySelectorAll('.bout-card').forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(14px)';
            setTimeout(() => {
              el.style.transition = 'opacity 0.28s ease, transform 0.28s ease';
              el.style.opacity = '1';
              el.style.transform = 'translateY(0)';
            }, 120 + i * 70);
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
