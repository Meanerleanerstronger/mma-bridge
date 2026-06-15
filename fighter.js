// ==============================================
// MMA BRIDGE — FIGHTER PROFILE (PREMIUM)
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

  const fighterId   = getParam('id');
  const fighterName = getParam('name');
  if (!fighterId && !fighterName) { renderNotFound('No fighter specified.'); return; }

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  fetch('data/fighters.json?_='+Date.now(),{cache:'no-store'})
    .then(r => r.ok ? r.json() : [])
    .then(fighters => {
      let f;
      if (fighterId) {
        f = fighters.find(x => x.id === fighterId);
      } else {
        const slug = slugify(fighterName);
        f = fighters.find(x => slugify(x.name) === slug)
          || fighters.find(x => slugify(x.id) === slug);
      }
      if (!f) { renderNotFound(`Fighter "${escHtml(fighterName || fighterId)}" not found.`); return; }
      document.title = `${f.name} — MMA Bridge`;
      renderProfile(f);

      // ── Upcoming fight banner ─────────────────
      fetch('events.json?_='+Date.now(),{cache:'no-store'})
        .then(r => r.ok ? r.json() : [])
        .then(events => {
          const now = new Date();
          let foundFight = null, foundEvent = null;
          for (const ev of events) {
            if (ev.status !== 'upcoming' || !ev.isoDate) continue;
            if (new Date(ev.isoDate) < now) continue;
            const allFights = [...(ev.mainCard || []), ...(ev.prelims || []), ...(ev.earlyPrelims || [])];
            for (const fight of allFights) {
              const fSlug = slugify(f.name);
              if (slugify(fight.a || '') === fSlug || slugify(fight.b || '') === fSlug) {
                foundFight = fight;
                foundEvent = ev;
                break;
              }
            }
            if (foundFight) break;
          }
          if (foundFight && foundEvent) {
            const opponent = slugify(foundFight.a) === slugify(f.name) ? foundFight.b : foundFight.a;
            const evDate = foundEvent.isoDate
              ? new Date(foundEvent.isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : foundEvent.date || '';
            const banner = document.createElement('div');
            banner.className = 'fp-upcoming-banner';
            banner.innerHTML = `
              <div class="fp-upcoming-label">UPCOMING FIGHT</div>
              <div class="fp-upcoming-matchup">vs <strong>${escHtml(opponent)}</strong></div>
              <div class="fp-upcoming-event">${escHtml(foundEvent.name || '')} · ${escHtml(evDate)}</div>
              <a class="fp-upcoming-link" href="picks.html?id=${encodeURIComponent(foundEvent.id || '')}">Make Your Picks →</a>
            `;
            const hero = root.querySelector('.fp-hero');
            if (hero) root.insertBefore(banner, hero);
          }
        })
        .catch(() => {});
    })
    .catch(() => renderNotFound('Could not load fighter data.'));

  // ── Not Found ─────────────────────────────
  function renderNotFound(msg) {
    root.innerHTML = `
      <div class="fp-not-found">
        <h2>Fighter Not Found</h2>
        <p>${escHtml(msg)}</p>
        <a href="javascript:history.back()" style="display:inline-block;margin-top:28px;background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);color:cyan;font-family:'Montserrat',sans-serif;font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:10px 22px;border-radius:6px;text-decoration:none;">← Back</a>
      </div>`;
  }

  // ── Method badge colour ───────────────────
  function methodClass(method) {
    const m = (method || '').toUpperCase();
    if (m === 'KO') return 'fp-method-ko';
    if (m.includes('TKO')) return 'fp-method-tko';
    if (m.includes('SUB') || m.includes('CHOKE') || m.includes('ARM') || m.includes('LOCK')) return 'fp-method-sub';
    if (m === 'NC' || m === 'NO CONTEST') return 'fp-method-nc';
    return 'fp-method-dec';
  }

  // ── WL badge class ────────────────────────
  function wlClass(result) {
    const r = (result || '').toUpperCase();
    if (r === 'W') return 'fp-wl-w';
    if (r === 'L') return 'fp-wl-l';
    if (r === 'D') return 'fp-wl-d';
    return 'fp-wl-nc';
  }

  // ── Recent fights ─────────────────────────
  function buildFights(last5) {
    if (!last5 || !last5.length) return '';
    const cards = last5.map(fight => {
      const r    = (fight.result || 'NC').toUpperCase();
      const meth = fight.method || '';
      const rd   = fight.round ? `Rd ${fight.round}` : '';
      const tm   = fight.time  || '';
      const detail = [rd, tm].filter(Boolean).join(' · ');
      const dateStr = fight.date
        ? new Date(fight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      return `
        <div class="fp-fight-card">
          <div class="fp-wl ${wlClass(r)}">${escHtml(r)}</div>
          <div class="fp-fight-info-wrap">
            <div class="fp-fight-opp">vs ${escHtml(fight.opponent || '')}</div>
            <div class="fp-fight-meta">
              <span class="fp-method-badge ${methodClass(meth)}">${escHtml(meth)}</span>
              ${detail ? `<span class="fp-fight-detail">${escHtml(detail)}</span>` : ''}
              ${dateStr ? `<span class="fp-fight-date">${escHtml(dateStr)}</span>` : ''}
            </div>
          </div>
          <div class="fp-fight-event">${escHtml(fight.event || '')}</div>
        </div>`;
    }).join('');
    return `
      <div class="fp-section-label">Recent Fights</div>
      ${cards}`;
  }

  // ── Stats countup ─────────────────────────
  function animateStat(el, target) {
    // Only countup numeric values
    const num = parseFloat(target);
    if (isNaN(num) || num <= 5) { el.textContent = target; return; }
    const dur = 900, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = target.replace(/[\d.]+/, v => {
        const isInt = !v.includes('.');
        return isInt ? Math.round(num * ease) : (num * ease).toFixed(1);
      });
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }

  // ── Render profile ────────────────────────
  function renderProfile(f) {
    const wins   = f.record?.wins   ?? 0;
    const losses = f.record?.losses ?? 0;
    const draws  = f.record?.draws  ?? 0;

    const isChamp = (f.ranking || '').toLowerCase().includes('champ');
    const isLegend = f.legend === true;

    // Build badges
    let badgesHtml = '';
    if (isChamp) {
      badgesHtml += `<span class="fp-badge fp-badge-champ">🏆 ${escHtml(f.ranking)}</span>`;
    } else if (f.ranking) {
      let changeHtml = '';
      if (typeof f.ranking_change === 'number' && f.ranking_change > 0) {
        changeHtml = `<span class="fp-rank-up" title="Rose ${f.ranking_change} spot${Math.abs(f.ranking_change) !== 1 ? 's' : ''}">▲${f.ranking_change}</span>`;
      } else if (typeof f.ranking_change === 'number' && f.ranking_change < 0) {
        changeHtml = `<span class="fp-rank-down" title="Fell ${Math.abs(f.ranking_change)} spot${Math.abs(f.ranking_change) !== 1 ? 's' : ''}">▼${Math.abs(f.ranking_change)}</span>`;
      } else if (typeof f.ranking_change === 'number' && f.ranking_change === 0) {
        changeHtml = `<span class="fp-rank-same">—</span>`;
      }
      badgesHtml += `<span class="fp-badge fp-badge-rank">${escHtml(f.ranking)}${changeHtml}</span>`;
    }
    if (f.pfp) {
      badgesHtml += `<span class="fp-badge fp-badge-pfp">★ P4P</span>`;
    }
    if (f.weightClass) {
      badgesHtml += `<span class="fp-badge fp-badge-division">${escHtml(f.weightClass)}</span>`;
    }
    if (isLegend) {
      badgesHtml += `<span class="fp-badge fp-badge-legend">Legend</span>`;
    }

    // Stats strip
    const stats = [
      { val: f.height, lbl: 'Height' },
      { val: f.reach,  lbl: 'Reach'  },
      { val: f.stance, lbl: 'Stance' },
      { val: f.age ? `${f.age}` : null, lbl: 'Age' },
    ].filter(s => s.val);

    const statsHtml = stats.map(s => `
      <div class="fp-stat-item">
        <div class="fp-stat-val" data-target="${escHtml(String(s.val))}">${escHtml(String(s.val))}</div>
        <div class="fp-stat-lbl">${escHtml(s.lbl)}</div>
      </div>`).join('');

    root.innerHTML = `
      <!-- HERO -->
      <section class="fp-hero">
        <div class="fp-hero-bg" id="fpBg"></div>
        <div class="fp-hero-grad"></div>

        <!-- Fighter photo -->
        ${f.img ? `
        <div class="fp-photo-wrap">
          <img class="fp-photo" src="${escHtml(f.img)}" alt="${escHtml(f.name)}" loading="eager" onerror="this.closest('.fp-photo-wrap').style.display='none'">
        </div>` : ''}

        <!-- Back button -->
        <a href="javascript:history.back()" class="fp-back">
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
            <polyline points="7,1 2,7 7,13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </a>

        <!-- Left content -->
        <div class="fp-hero-content">
          ${badgesHtml ? `<div class="fp-badges">${badgesHtml}</div>` : ''}

          <h1 class="fp-name">${escHtml(f.name)}</h1>

          ${f.nickname ? `<div class="fp-nickname">"${escHtml(f.nickname)}"</div>` : ''}

          <!-- Record -->
          <div class="fp-record-grid">
            <div class="fp-rec-item">
              <span class="fp-rec-num">${wins}</span>
              <span class="fp-rec-lbl">Wins</span>
            </div>
            <div class="fp-rec-sep">–</div>
            <div class="fp-rec-item">
              <span class="fp-rec-num">${losses}</span>
              <span class="fp-rec-lbl">Losses</span>
            </div>
            ${draws > 0 ? `
            <div class="fp-rec-sep">–</div>
            <div class="fp-rec-item">
              <span class="fp-rec-num">${draws}</span>
              <span class="fp-rec-lbl">Draws</span>
            </div>` : ''}
          </div>

          <!-- Nationality / style -->
          <div class="fp-meta">
            ${f.flag && f.nationality ? `<span>${escHtml(f.flag)} ${escHtml(f.nationality)}</span>` : ''}
            ${f.fightingOut ? `<span class="fp-meta-sep">·</span><span>${escHtml(f.fightingOut)}</span>` : ''}
            ${f.style ? `<span class="fp-meta-sep">·</span><span class="fp-style-pill">${escHtml(f.style)}</span>` : ''}
          </div>
        </div>

        <div class="fp-hero-sep"></div>
      </section>

      <!-- STATS STRIP -->
      ${statsHtml ? `<div class="fp-stats-strip">${statsHtml}</div>` : ''}

      <!-- BODY -->
      <div class="fp-content">
        ${f.bio ? `<p class="fp-bio">${escHtml(f.bio)}</p>` : ''}
        <a class="fp-share-card-btn" href="share-card.html?id=${escHtml(f.id)}" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share Fighter Card
        </a>
        ${buildFights(f.last5)}
        <div class="fp-news-section" id="fpNews">
          <div class="fp-news-label">Recent News</div>
          <div class="fp-news-list" id="fpNewsList"><div class="fp-news-loading">Loading…</div></div>
        </div>
      </div>
    `;

    // Set blurred hero bg from photo
    if (f.img) {
      const bg = document.getElementById('fpBg');
      if (bg) bg.style.backgroundImage = `url('${f.img.replace(/'/g, "\\'")}')`;
    }

    // Load fighter news
    loadFighterNews(f.name);

    // Countup on stats when strip is visible
    const strip = root.querySelector('.fp-stats-strip');
    if (strip && 'IntersectionObserver' in window) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          strip.querySelectorAll('[data-target]').forEach(el => {
            animateStat(el, el.dataset.target);
          });
          obs.disconnect();
        }
      }, { threshold: 0.3 });
      obs.observe(strip);
    }
  }

  function loadFighterNews(name) {
    const list = document.getElementById('fpNewsList');
    if (!list) return;
    const API_BASE = 'https://mmabridge.onrender.com';
    fetch(`${API_BASE}/api/news/fighter?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : { articles: [] })
      .then(data => {
        const articles = data.articles || [];
        if (!articles.length) {
          list.innerHTML = '<div class="fp-news-empty">No recent news found.</div>';
          return;
        }
        list.innerHTML = articles.map(a => {
          const domain = a.source || '';
          const date   = a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
          return `<a class="fp-news-item" href="${escHtml(a.url)}" target="_blank" rel="noopener">
            <div class="fp-news-item-title">${escHtml(a.title)}</div>
            <div class="fp-news-item-meta">${escHtml(domain)}${date ? ' · ' + date : ''}</div>
          </a>`;
        }).join('');
      })
      .catch(() => {
        list.innerHTML = '<div class="fp-news-empty">Could not load news.</div>';
      });
  }

})();
