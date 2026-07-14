/**
 * fighter-modal.js — Universal fighter profile modal
 * Opens from any page via window.openFighterModal(name)
 * Data sourced from /data/fighters.json
 */
(function () {
  'use strict';

  /* ── Data cache ──────────────────────────────────────── */
  let _fighters = null;
  let _loading  = false;
  let _queue    = [];

  function getFighters() {
    if (_fighters) return Promise.resolve(_fighters);
    if (_loading)  return new Promise(r => _queue.push(r));
    _loading = true;
    return fetch('/data/fighters.json?_=' + Math.floor(Date.now() / 3_600_000), { cache: 'force-cache' })
      .then(r => r.json())
      .then(data => {
        _fighters = data;
        _queue.forEach(r => r(data));
        _queue = [];
        return data;
      })
      .catch(() => { _loading = false; return []; });
  }

  function norm(s) {
    return (s || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  }

  function findFighter(name) {
    if (!_fighters || !name) return null;
    const n = norm(name);
    return _fighters.find(f => norm(f.name) === n)
        || _fighters.find(f => norm(f.name).includes(n) || n.includes(norm(f.name)));
  }

  /* ── CSS injected once ───────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('fm-style')) return;
    const s = document.createElement('style');
    s.id = 'fm-style';
    s.textContent = `
      #fm-overlay {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s ease;
      }
      #fm-overlay.fm-open { opacity: 1; pointer-events: all; }
      .fm-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.72);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      }
      .fm-panel {
        position: relative;
        width: min(520px, calc(100vw - 24px));
        max-height: min(88vh, 680px);
        overflow-y: auto;
        background: #0d0d11;
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 18px;
        box-shadow: 0 32px 80px rgba(0,0,0,0.65);
        transform: scale(0.96) translateY(10px);
        transition: transform 0.26s cubic-bezier(0.34,1.4,0.64,1);
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.07) transparent;
      }
      #fm-overlay.fm-open .fm-panel { transform: scale(1) translateY(0); }
      .fm-panel::-webkit-scrollbar { width: 4px; }
      .fm-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

      .fm-close {
        position: sticky; float: right;
        top: 12px; right: 12px; margin: 12px 12px 0 0;
        width: 28px; height: 28px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 50%; color: rgba(255,255,255,0.55);
        cursor: pointer; z-index: 3;
        display: flex; align-items: center; justify-content: center;
        font-size: 0.6rem; font-weight: 800;
        transition: background 0.14s, color 0.14s;
      }
      .fm-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

      .fm-hero {
        height: 240px; position: relative;
        background-size: cover; background-position: center 8%;
        background-color: #16161e;
        border-radius: 18px 18px 0 0;
        overflow: hidden;
      }
      .fm-hero-grad {
        position: absolute; inset: 0;
        background: linear-gradient(to top, #0d0d11 0%, rgba(0,0,0,0.35) 55%, transparent 100%);
      }
      .fm-hero-info {
        position: absolute; bottom: 0; left: 0;
        padding: 18px 22px; z-index: 1;
        max-width: 100%;
      }
      .fm-nickname {
        font-family: 'Inter', sans-serif;
        font-size: 0.62rem; font-style: italic;
        color: rgba(224,151,90,0.7); margin-bottom: 3px;
      }
      .fm-name {
        font-family: 'Montserrat', sans-serif;
        font-size: 1.5rem; font-weight: 900;
        text-transform: uppercase; color: #fff;
        letter-spacing: -0.015em; line-height: 1.1;
        margin-bottom: 7px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .fm-meta {
        display: flex; align-items: center; flex-wrap: wrap; gap: 7px;
      }
      .fm-record {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.75rem; font-weight: 800;
        color: rgba(255,255,255,0.9);
      }
      .fm-division {
        background: rgba(224,151,90,0.1);
        border: 1px solid rgba(224,151,90,0.22);
        border-radius: 4px; padding: 2px 8px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.52rem; font-weight: 800;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: #e0975a;
      }

      .fm-body { padding: 16px 22px 26px; }

      .fm-bio-row {
        display: flex; gap: 14px; align-items: stretch;
        margin-bottom: 14px;
      }
      .fm-phys {
        display: flex; flex-direction: column; gap: 6px;
        flex-shrink: 0;
      }
      .fm-phys-item {
        display: flex; flex-direction: column; align-items: center;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px; padding: 8px 12px; min-width: 56px;
      }
      .fm-phys-val {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.78rem; font-weight: 800; color: #fff;
        white-space: nowrap;
      }
      .fm-phys-lbl {
        font-size: 0.46rem; font-weight: 700;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: rgba(255,255,255,0.25); margin-top: 2px;
      }
      .fm-bio {
        font-size: 0.7rem; line-height: 1.65;
        color: rgba(255,255,255,0.42); flex: 1;
      }

      .fm-section-hd {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.5rem; font-weight: 800;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(255,255,255,0.2);
        margin: 18px 0 9px;
        display: flex; align-items: center; gap: 9px;
      }
      .fm-section-hd::after { content:''; flex:1; height:1px; background: rgba(255,255,255,0.06); }

      .fm-career-grid {
        display: flex; border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px; overflow: hidden;
      }
      .fm-cs {
        flex: 1; text-align: center; padding: 10px 4px;
        border-right: 1px solid rgba(255,255,255,0.05);
      }
      .fm-cs:last-child { border-right: none; }
      .fm-cs-val {
        display: block; font-family: 'Montserrat', sans-serif;
        font-size: 0.82rem; font-weight: 800; color: #fff;
      }
      .fm-cs-lbl {
        display: block; font-size: 0.46rem; font-weight: 700;
        letter-spacing: 0.09em; text-transform: uppercase;
        color: rgba(255,255,255,0.22); margin-top: 3px;
      }

      /* Win breakdown pills */
      .fm-win-breakdown { display: inline-flex; gap: 6px; margin-left: 6px; }
      .fm-wb-item {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.5rem; font-weight: 700;
        letter-spacing: 0.06em; padding: 2px 7px;
        border-radius: 20px; display: flex; align-items: center; gap: 4px;
      }
      .fm-wb-n { font-size: 0.68rem; font-weight: 900; }
      .fm-wb-ko  { background: rgba(255,80,80,0.1);  color: rgba(255,120,120,0.8); border: 1px solid rgba(255,80,80,0.15); }
      .fm-wb-sub { background: rgba(100,200,255,0.08); color: rgba(100,200,255,0.7); border: 1px solid rgba(100,200,255,0.14); }
      .fm-wb-dec { background: rgba(224,151,90,0.08);  color: rgba(224,151,90,0.6);  border: 1px solid rgba(224,151,90,0.14); }

      /* Fight rows */
      .fm-fights { display: flex; flex-direction: column; }
      .fm-fight-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .fm-fight-row:last-child { border-bottom: none; }
      .fm-fr {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.6rem; font-weight: 900;
        width: 20px; text-align: center; flex-shrink: 0;
        border-radius: 3px; padding: 2px 0;
      }
      .fm-fr-w  { color: #4ade80; background: rgba(74,222,128,0.09); }
      .fm-fr-l  { color: #f87171; background: rgba(248,113,113,0.09); }
      .fm-fr-nc { color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.04); }
      .fm-fight-opp {
        flex: 1; font-weight: 700; color: rgba(255,255,255,0.85);
        font-size: 0.72rem;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        min-width: 0;
      }
      .fm-fight-event {
        font-size: 0.58rem; color: rgba(255,255,255,0.2);
        flex-shrink: 0; white-space: nowrap; overflow: hidden;
        max-width: 90px; text-overflow: ellipsis;
      }
      .fm-fight-right {
        display: flex; align-items: center; gap: 4px; flex-shrink: 0;
      }
      .fm-fight-detail { font-size: 0.52rem; color: rgba(255,255,255,0.18); white-space: nowrap; }

      /* Method badge */
      .fm-mbadge {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.48rem; font-weight: 800;
        letter-spacing: 0.06em; padding: 2px 5px;
        border-radius: 3px; white-space: nowrap;
      }
      .fm-mb-ko  { background: rgba(255,80,80,0.1);   color: rgba(255,130,130,0.85); }
      .fm-mb-sub { background: rgba(100,200,255,0.09); color: rgba(120,200,255,0.8); }
      .fm-mb-dec { background: rgba(224,151,90,0.08);  color: rgba(224,151,90,0.65); }
      .fm-mb-nc  { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3); }

      /* Full record link */
      .fm-full-link {
        display: inline-flex; align-items: center; margin-top: 14px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.56rem; font-weight: 700;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: rgba(224,151,90,0.55);
        text-decoration: none;
        transition: color 0.15s;
      }
      .fm-full-link:hover { color: #e8c96a; }
      .fm-no-history {
        font-size: 0.65rem; color: rgba(255,255,255,0.18);
        padding: 10px 0 4px;
        display: flex; align-items: center; gap: 10px;
      }
      .fm-full-link-inline {
        font-size: 0.58rem; color: rgba(224,151,90,0.45);
        text-decoration: none; transition: color 0.15s;
      }
      .fm-full-link-inline:hover { color: #e8c96a; }

      .fm-empty {
        padding: 60px 0; text-align: center;
        font-size: 0.75rem; color: rgba(255,255,255,0.22);
      }
      .fm-loading { padding: 80px 0; text-align: center; font-size: 0.72rem; color: rgba(255,255,255,0.22); }

      body.fm-lock { overflow: hidden; }

      @media (max-width: 480px) {
        .fm-hero { height: 200px; }
        .fm-name { font-size: 1.2rem; }
        .fm-bio-row { flex-direction: column; }
        .fm-phys { flex-direction: row; flex-wrap: wrap; }
        .fm-phys-item { min-width: 70px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Modal skeleton ──────────────────────────────────── */
  function buildSkeleton() {
    if (document.getElementById('fm-overlay')) return;
    injectCSS();
    const wrap = document.createElement('div');
    wrap.id = 'fm-overlay';
    wrap.innerHTML = `
      <div class="fm-backdrop" id="fm-bd"></div>
      <div class="fm-panel" id="fm-panel">
        <button class="fm-close" id="fm-close" aria-label="Close">✕</button>
        <div id="fm-content"></div>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('fm-bd').addEventListener('click', closeModal);
    document.getElementById('fm-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  function closeModal() {
    const el = document.getElementById('fm-overlay');
    if (el) el.classList.remove('fm-open');
    document.body.classList.remove('fm-lock');
  }

  /* ── Render ──────────────────────────────────────────── */
  function nameToSlug(name) {
    return (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  }

  function methodBadge(method) {
    const m = (method || '').toUpperCase();
    if (/KO|TKO/.test(m))           return '<span class="fm-mbadge fm-mb-ko">KO/TKO</span>';
    if (/SUB|CHOKE|TRIANGLE|ARMBAR|HEEL|GUILLOTINE|RNC/.test(m)) return '<span class="fm-mbadge fm-mb-sub">SUB</span>';
    if (/DEC|DECISION/.test(m))     return '<span class="fm-mbadge fm-mb-dec">DEC</span>';
    if (/NC|NO CONTEST/.test(m))    return '<span class="fm-mbadge fm-mb-nc">NC</span>';
    if (method)                     return `<span class="fm-mbadge fm-mb-dec">${esc(method.substring(0,8))}</span>`;
    return '';
  }

  function renderFighter(f) {
    const rec = f.record
      ? `${f.record.wins}–${f.record.losses}${f.record.draws ? '–' + f.record.draws : ''}`
      : '';
    const fights   = f.last5 || [];
    const hasStats = f.stats && f.stats.slpm;
    const ufcSlug  = f.id || nameToSlug(f.name);

    // Win method breakdown
    const wins = fights.filter(x => x.result === 'W');
    const wKO  = wins.filter(x => /KO|TKO/.test((x.method||'').toUpperCase())).length;
    const wSub = wins.filter(x => /SUB|CHOKE|ARMBAR|TRIANGLE|HEEL|GUILLOTINE|RNC/.test((x.method||'').toUpperCase())).length;
    const wDec = wins.filter(x => /DEC|DECISION/.test((x.method||'').toUpperCase())).length;

    const physItems = [
      f.height  && ['Height', f.height],
      f.reach   && ['Reach',  f.reach],
      f.stance  && ['Stance', f.stance],
      f.age     && ['Age',    f.age],
    ].filter(Boolean);

    const physHtml = physItems.length ? `
      <div class="fm-phys">
        ${physItems.map(([lbl, val]) => `
          <div class="fm-phys-item">
            <span class="fm-phys-val">${esc(String(val))}</span>
            <span class="fm-phys-lbl">${lbl}</span>
          </div>`).join('')}
      </div>` : '';

    const bioSnippet = f.bio ? f.bio.substring(0, 300) + (f.bio.length > 300 ? '…' : '') : '';

    const winBreakdown = (wKO + wSub + wDec > 0) ? `
      <div class="fm-win-breakdown">
        ${wKO  ? `<span class="fm-wb-item fm-wb-ko"><span class="fm-wb-n">${wKO}</span> KO/TKO</span>`  : ''}
        ${wSub ? `<span class="fm-wb-item fm-wb-sub"><span class="fm-wb-n">${wSub}</span> SUB</span>` : ''}
        ${wDec ? `<span class="fm-wb-item fm-wb-dec"><span class="fm-wb-n">${wDec}</span> DEC</span>` : ''}
      </div>` : '';

    const statsHtml = hasStats ? `
      <div class="fm-section-hd">Career Averages</div>
      <div class="fm-career-grid">
        ${[
          ['SLpM',    f.stats.slpm],
          ['Str Acc', f.stats.strAcc],
          ['SApM',    f.stats.sapm],
          ['Str Def', f.stats.strDef],
          ['TD Avg',  f.stats.tdAvg],
          ['Sub Avg', f.stats.subAvg],
        ].filter(([,v]) => v).map(([l, v]) => `
          <div class="fm-cs">
            <span class="fm-cs-val">${esc(String(v))}</span>
            <span class="fm-cs-lbl">${l}</span>
          </div>`).join('')}
      </div>` : '';

    const fightsHtml = fights.length ? `
      <div class="fm-section-hd">Fight Record${winBreakdown}</div>
      <div class="fm-fights">
        ${fights.map(fight => {
          const res = (fight.result || '').toUpperCase();
          const cls = res === 'W' ? 'fm-fr-w' : res === 'L' ? 'fm-fr-l' : 'fm-fr-nc';
          const det = [fight.round ? 'R' + fight.round : '', fight.time || ''].filter(Boolean).join(' ');
          return `<div class="fm-fight-row">
            <span class="fm-fr ${cls}">${res || '–'}</span>
            <span class="fm-fight-opp">${esc(fight.opponent || '–')}</span>
            <span class="fm-fight-event">${esc((fight.event || '').replace(/^(UFC|PFL|ONE)\s*/i, ''))}</span>
            <span class="fm-fight-right">
              ${methodBadge(fight.method)}
              ${det ? `<span class="fm-fight-detail">${det}</span>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
      <a class="fm-full-link" href="https://www.ufc.com/athlete/${ufcSlug}" target="_blank" rel="noopener">
        Full record on UFC.com ↗
      </a>` : `
      <div class="fm-no-history">
        Fight history loading…
        <a class="fm-full-link-inline" href="https://www.ufc.com/athlete/${ufcSlug}" target="_blank" rel="noopener">View on UFC.com ↗</a>
      </div>`;

    return `
      <div class="fm-hero" ${f.img ? `style="background-image:url('${f.img}')"` : ''}>
        <div class="fm-hero-grad"></div>
        <div class="fm-hero-info">
          ${f.nickname ? `<div class="fm-nickname">"${esc(f.nickname)}"</div>` : ''}
          <div class="fm-name">${esc(f.name)}</div>
          <div class="fm-meta">
            ${rec ? `<span class="fm-record">${rec}</span>` : ''}
            ${f.weightClass ? `<span class="fm-division">${esc(f.weightClass)}</span>` : ''}
            ${f.flag ? `<span style="font-size:1.1rem">${f.flag}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="fm-body">
        ${physItems.length || bioSnippet ? `
          <div class="fm-bio-row">
            ${physHtml}
            ${bioSnippet ? `<div class="fm-bio">${esc(bioSnippet)}</div>` : ''}
          </div>` : ''}
        ${statsHtml}
        ${fightsHtml}
      </div>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Photo preloading ────────────────────────────────── */
  const _preloaded = new Set();

  function preloadPhoto(url) {
    if (!url || _preloaded.has(url)) return;
    _preloaded.add(url);
    const img = new Image();
    img.src = url;
  }

  function preloadFighterByName(name) {
    if (!_fighters) return;
    const f = findFighter(name);
    if (f?.img) preloadPhoto(f.img);
  }

  // After fighters.json loads, preload photos for fighters visible on this page
  function preloadPageFighters() {
    if (!_fighters) return;

    // P4P rows: [data-fighter] slug → match by id
    document.querySelectorAll('[data-fighter]').forEach(el => {
      const slug = el.dataset.fighter;
      const f = _fighters.find(x => x.id === slug || norm(x.name).replace(/\s/g,'-') === slug);
      if (f?.img) preloadPhoto(f.img);
    });

    // Picks page / events overlay: data-fa / data-fb fighter names
    document.querySelectorAll('[data-fa],[data-fb]').forEach(el => {
      if (el.dataset.fa) preloadFighterByName(el.dataset.fa);
      if (el.dataset.fb) preloadFighterByName(el.dataset.fb);
    });

    // Any rendered fighter name elements
    document.querySelectorAll('.ov-fighter, .div-contender-name, .div-champ-name, .pfp-row-name').forEach(el => {
      preloadFighterByName(el.textContent.trim());
    });
  }

  // Hover-preload: start fetching the photo as soon as user mouses over a clickable fighter
  function setupHoverPreload() {
    document.addEventListener('mouseover', function (e) {
      // Events overlay fighter names
      const ovFighter = e.target.closest('.ov-fighter');
      if (ovFighter) {
        preloadFighterByName(ovFighter.textContent.trim());
        return;
      }
      // Divisional contender rows
      const contRow = e.target.closest('.div-contender-row');
      if (contRow) {
        const nameEl = contRow.querySelector('.div-contender-name');
        if (nameEl) preloadFighterByName(nameEl.textContent.trim());
        return;
      }
      // Champion photo panel
      const champInfo = e.target.closest('.div-champ-info');
      if (champInfo) {
        const nameEl = champInfo.querySelector('.div-champ-name');
        if (nameEl) preloadFighterByName(nameEl.textContent.trim());
        return;
      }
      // Picks fighter name
      const fcName = e.target.closest('.fc-name');
      if (fcName) {
        // fc-name has mixed text + button; extract just text nodes
        const text = Array.from(fcName.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim())
          .join(' ').trim();
        if (text) preloadFighterByName(text);
      }
    }, { passive: true });
  }

  /* ── Public API ──────────────────────────────────────── */
  window.openFighterModal = function (name) {
    window.open('fighter.html?name=' + encodeURIComponent(name), '_blank', 'noopener,noreferrer');
  };

  /* Kick everything off on page load */
  window.addEventListener('load', () => {
    getFighters().then(() => {
      preloadPageFighters();
      setupHoverPreload();
    });
  });
})();
