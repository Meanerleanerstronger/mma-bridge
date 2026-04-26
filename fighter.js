// ==============================================
// MMA BRIDGE — FIGHTER PROFILE
// ==============================================
(function () {
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  const root = document.getElementById('fp-root');
  if (!root) return;

  const fighterId = getParam('id');
  if (!fighterId) {
    renderNotFound('No fighter specified.');
    return;
  }

  fetch('data/fighters.json')
    .then(r => r.ok ? r.json() : [])
    .then(fighters => {
      const f = fighters.find(x => x.id === fighterId);
      if (!f) { renderNotFound(`Fighter "${escHtml(fighterId)}" not found.`); return; }
      document.title = `${f.name} — MMA Bridge`;
      renderProfile(f);
    })
    .catch(() => renderNotFound('Could not load fighter data.'));

  function renderNotFound(msg) {
    root.innerHTML = `
      <div class="fp-not-found">
        <h2>Fighter Not Found</h2>
        <p>${escHtml(msg)}</p>
        <a href="index.html" style="display:inline-block;margin-top:24px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.25);color:cyan;font-family:'Montserrat',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:10px 20px;border-radius:6px;text-decoration:none;">← Back Home</a>
      </div>`;
  }

  function renderProfile(f) {
    const isChamp = (f.ranking || '').toLowerCase().includes('champ');
    const badgeClass = isChamp ? 'fp-ranking-badge fp-champion-badge' : 'fp-ranking-badge';
    const badgeText = isChamp ? '🏆 ' + f.ranking : f.ranking || f.weightClass;
    const weightClass = f.weightClass || '';
    const record = f.record ? `${f.record.wins}-${f.record.losses}${f.record.draws ? '-' + f.record.draws : ''}` : '';

    root.innerHTML = `
      <!-- HERO -->
      <section class="fp-hero" id="fpHero">
        <div class="fp-hero-bg" id="fpBg"></div>
        ${f.img ? `<img class="fp-photo" id="fpPhoto" src="${escHtml(f.img)}" alt="${escHtml(f.name)}" onerror="this.style.display='none'">` : ''}
        <div class="fp-hero-content">
          <a href="javascript:history.back()" class="fp-back">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="6,1 2,5 6,9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Back
          </a>
          <div class="${escHtml(badgeClass)}">${escHtml(badgeText)}</div>
          <h1 class="fp-name">${escHtml(f.name)}</h1>
          ${f.nickname ? `<div class="fp-nickname">"${escHtml(f.nickname)}"</div>` : ''}
          ${record ? `<div class="fp-record">${escHtml(record)} <span>W-L${f.record?.draws ? '-D' : ''}</span></div>` : ''}
          <div class="fp-meta-row">
            ${f.nationality ? `<div class="fp-meta-item">${escHtml(f.flag || '')} ${escHtml(f.nationality)}</div>` : ''}
            ${f.fightingOut ? `<div class="fp-meta-item"><strong>Out of</strong> ${escHtml(f.fightingOut)}</div>` : ''}
            ${weightClass ? `<div class="fp-meta-item"><strong>${escHtml(weightClass)}</strong></div>` : ''}
          </div>
        </div>
      </section>

      <!-- BODY -->
      <div class="fp-body">
        <!-- Stats -->
        <div class="fp-stats-row">
          ${f.height ? `<div class="fp-stat"><div class="fp-stat-val">${escHtml(f.height)}</div><div class="fp-stat-label">Height</div></div>` : ''}
          ${f.reach  ? `<div class="fp-stat"><div class="fp-stat-val">${escHtml(f.reach)}</div><div class="fp-stat-label">Reach</div></div>` : ''}
          ${f.stance ? `<div class="fp-stat"><div class="fp-stat-val">${escHtml(f.stance)}</div><div class="fp-stat-label">Stance</div></div>` : ''}
          ${f.age    ? `<div class="fp-stat"><div class="fp-stat-val">${escHtml(String(f.age))}</div><div class="fp-stat-label">Age</div></div>` : ''}
        </div>

        <!-- Style tag -->
        ${f.style ? `<div class="fp-style-tag">${escHtml(f.style)}</div>` : ''}

        <!-- Bio -->
        ${f.bio ? `<p class="fp-bio">${escHtml(f.bio)}</p>` : ''}

        <!-- Last 5 -->
        ${buildLast5(f.last5)}
      </div>
    `;

    // Set blurred hero background from the photo
    if (f.img) {
      const bg = document.getElementById('fpBg');
      if (bg) bg.style.backgroundImage = `url('${f.img.replace(/'/g, "\\'")}')`;
    }
  }

  function buildLast5(last5) {
    if (!last5 || !last5.length) return '';
    const rows = last5.map(fight => {
      const res = fight.result || 'W';
      return `
        <div class="fp-fight-row">
          <div class="fp-result-badge ${escHtml(res)}">${escHtml(res)}</div>
          <div class="fp-fight-info">
            <div class="fp-fight-opp">${escHtml(fight.opponent || '')}</div>
            <div class="fp-fight-detail">${escHtml(fight.method || '')}${fight.round ? ' · Rd ' + fight.round : ''}${fight.time ? ' ' + fight.time : ''}</div>
          </div>
          <div class="fp-fight-event">${escHtml(fight.event || '')}</div>
        </div>`;
    }).join('');
    return `
      <div class="fp-section-title">Last 5 Fights</div>
      <div>${rows}</div>`;
  }
})();
