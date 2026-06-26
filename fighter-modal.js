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
        color: rgba(200,168,75,0.7); margin-bottom: 3px;
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
        background: rgba(200,168,75,0.1);
        border: 1px solid rgba(200,168,75,0.22);
        border-radius: 4px; padding: 2px 8px;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.52rem; font-weight: 800;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: #c8a84b;
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

      .fm-fights { display: flex; flex-direction: column; }
      .fm-fight-row {
        display: flex; align-items: center; gap: 9px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        font-size: 0.7rem;
      }
      .fm-fight-row:last-child { border-bottom: none; }
      .fm-fr {
        font-family: 'Montserrat', sans-serif;
        font-size: 0.62rem; font-weight: 900;
        width: 20px; text-align: center; flex-shrink: 0;
        border-radius: 3px; padding: 2px 0;
      }
      .fm-fr-w { color: #4ade80; background: rgba(74,222,128,0.08); }
      .fm-fr-l { color: #f87171; background: rgba(248,113,113,0.08); }
      .fm-fr-nc { color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.04); }
      .fm-fight-opp {
        flex: 1; font-weight: 600; color: rgba(255,255,255,0.82);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .fm-fight-method { font-size: 0.6rem; color: rgba(255,255,255,0.28); flex-shrink: 0; }
      .fm-fight-meta   { font-size: 0.55rem; color: rgba(255,255,255,0.18); flex-shrink: 0; white-space: nowrap; }

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
  function renderFighter(f) {
    const rec = f.record
      ? `${f.record.wins}–${f.record.losses}${f.record.draws ? '–' + f.record.draws : ''}`
      : '';
    const last5    = (f.last5 || []).slice(0, 5);
    const hasStats = f.stats && f.stats.slpm;

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

    const bioSnippet = f.bio ? f.bio.substring(0, 280) + (f.bio.length > 280 ? '…' : '') : '';

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

    const fightsHtml = last5.length ? `
      <div class="fm-section-hd">Recent Fights</div>
      <div class="fm-fights">
        ${last5.map(fight => {
          const res  = (fight.result || '').toUpperCase();
          const cls  = res === 'W' ? 'fm-fr-w' : res === 'L' ? 'fm-fr-l' : 'fm-fr-nc';
          const meth = fight.method ? esc(fight.method) : '';
          const det  = [fight.round ? 'R' + fight.round : '', fight.event ? esc(fight.event) : ''].filter(Boolean).join(' · ');
          return `<div class="fm-fight-row">
            <span class="fm-fr ${cls}">${res || '–'}</span>
            <span class="fm-fight-opp">${esc(fight.opponent || '–')}</span>
            <span class="fm-fight-method">${meth}</span>
            <span class="fm-fight-meta">${det}</span>
          </div>`;
        }).join('')}
      </div>` : '';

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
        ${!last5.length && !hasStats ? `<div style="font-size:0.65rem;color:rgba(255,255,255,0.2);padding:8px 0 4px">Fight history syncing weekly.</div>` : ''}
      </div>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Public API ──────────────────────────────────────── */
  window.openFighterModal = function (name) {
    buildSkeleton();
    const overlay = document.getElementById('fm-overlay');
    const content = document.getElementById('fm-content');
    content.innerHTML = '<div class="fm-loading">Loading…</div>';
    overlay.classList.add('fm-open');
    document.body.classList.add('fm-lock');

    getFighters().then(() => {
      const f = findFighter(name);
      content.innerHTML = f
        ? renderFighter(f)
        : `<div class="fm-empty">No profile found for "${esc(name)}"</div>`;
    });
  };

  /* Pre-fetch quietly on page load */
  window.addEventListener('load', getFighters);
})();
