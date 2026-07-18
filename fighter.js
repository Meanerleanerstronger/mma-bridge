// MMA Bridge — Fighter Profile Page
(function () {
  const root = document.getElementById('fp-root');
  if (!root) return;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function norm(s) {
    return (s||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ');
  }
  function slugify(s) {
    return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function methodClass(m) {
    const u = (m||'').toUpperCase();
    if (u.includes('KO') || u.includes('TKO') || u.includes('RETIREMENT') || u.includes('CORNER')) return 'ko';
    if (u.includes('SUB') || u.includes('CHOKE') || u.includes('LOCK') || u.includes('CRANK')) return 'sub';
    if (u.includes('DEC') || u.includes('UNANIMOUS') || u.includes('SPLIT') || u.includes('MAJORITY')) return 'dec';
    return 'nc';
  }

  function methodLabel(m) {
    const u = (m||'').toUpperCase();
    if (u.includes('RETIREMENT') || u.includes('CORNER STOPPAGE')) return 'TKO';
    if (u.includes('TKO')) return 'TKO';
    if (u.includes('KO')) return 'KO';
    if (u.includes('SUB') || u.includes('CHOKE') || u.includes('LOCK') || u.includes('CRANK')) return 'SUB';
    if (u.includes('UNANIMOUS')) return 'UD';
    if (u.includes('SPLIT')) return 'SD';
    if (u.includes('MAJORITY')) return 'MD';
    if (u.includes('DEC')) return 'DEC';
    if (u.includes('NC') || u.includes('NO CONTEST')) return 'NC';
    return m || '—';
  }

  function cleanEvent(ev) {
    return (ev||'').replace(/^UFC\s+/i,'').replace(/^Fight Night:\s*/i,'FN: ').replace(/#.+$/,'').trim();
  }

  function renderProfile(f) {
    const wins   = f.record?.wins   || 0;
    const losses = f.record?.losses || 0;
    const draws  = f.record?.draws  || 0;
    const rec    = `${wins}–${losses}${draws ? `–${draws}` : ''}`;

    const fights = f.last5 || [];
    let wKO = 0, wSub = 0, wDec = 0;
    fights.forEach(fight => {
      if ((fight.result||'').toUpperCase() !== 'W') return;
      const mc = methodClass(fight.method);
      if (mc === 'ko')  wKO++;
      else if (mc === 'sub') wSub++;
      else if (mc === 'dec') wDec++;
    });

    const pillsHtml = [
      wKO  ? `<span class="fp-win-pill ko">${wKO} KO/TKO</span>`  : '',
      wSub ? `<span class="fp-win-pill sub">${wSub} SUB</span>`    : '',
      wDec ? `<span class="fp-win-pill dec">${wDec} DEC</span>`    : '',
    ].filter(Boolean).join('');

    const stats = [
      f.height ? {val: esc(f.height), lbl: 'Height'} : null,
      f.reach  ? {val: esc(f.reach),  lbl: 'Reach'}  : null,
      f.stance ? {val: esc(f.stance), lbl: 'Stance'} : null,
      f.age    ? {val: esc(String(f.age)), lbl: 'Age'} : null,
    ].filter(Boolean);

    const statsHtml = stats.length
      ? `<div class="fp-stats-strip">${stats.map(s=>`<div class="fp-stat-item"><span class="fp-stat-val">${s.val}</span><span class="fp-stat-lbl">${s.lbl}</span></div>`).join('')}</div>`
      : '';

    const fightsHtml = fights.length
      ? `<div class="fp-section-head">
           <span class="fp-section-title">Record</span>
           <div class="fp-win-pills">${pillsHtml}</div>
           <div class="fp-section-line"></div>
         </div>
         ${fights.map(fight => {
           const res = (fight.result||'').toLowerCase();
           const mc  = methodClass(fight.method);
           const rnd = fight.round ? `R${fight.round}` : '';
           const tm  = fight.time  || '';
           const rnds = [rnd, tm].filter(Boolean).join(' · ');
           return `<div class="fp-fight-row">
             <div class="fp-res ${res}">${res.toUpperCase()}</div>
             <div class="fp-fight-opp-wrap">
               <div class="fp-fight-opp">${esc(fight.opponent)}</div>
               ${fight.event ? `<div class="fp-fight-event-name">${esc(cleanEvent(fight.event))}</div>` : ''}
             </div>
             <div class="fp-fight-method ${mc}">${esc(methodLabel(fight.method))}</div>
             ${rnds ? `<div class="fp-fight-rnd">${esc(rnds)}</div>` : ''}
           </div>`;
         }).join('')}`
      : `<div class="fp-section-head">
           <span class="fp-section-title">Record</span>
           <div class="fp-section-line"></div>
         </div>
         <div style="padding:18px 0;color:rgba(255,255,255,0.18);font-size:0.78rem;">Fight history loading…</div>`;

    const ufcSlug = f.id || slugify(f.name);

    document.title = `${f.name} — MMA Bridge`;

    root.innerHTML = `
      <div class="fp-hero">
        <div class="fp-hero-photo"${f.img ? ` style="background-image:url('${f.img.replace(/'/g,"\\'")}')"` : ''}></div>
        <div class="fp-hero-grad"></div>
        <div class="fp-hero-content">
          ${f.nickname ? `<div class="fp-nickname">"${esc(f.nickname)}"</div>` : ''}
          <div class="fp-name">${esc(f.name)}</div>
          <div class="fp-meta-row">
            <span class="fp-record">${rec}</span>
            ${f.weightClass ? `<span class="fp-division">${esc(f.weightClass)}</span>` : ''}
            ${f.flag ? `<span class="fp-flag">${f.flag}</span>` : ''}
            ${f.ranking ? `<span class="fp-rank">${esc(f.ranking)}</span>` : ''}
          </div>
        </div>
      </div>
      ${statsHtml}
      <div class="fp-content">
        ${fightsHtml}
        <a class="fp-ufc-link" href="https://www.ufc.com/athlete/${ufcSlug}" target="_blank" rel="noopener">
          Full record on UFC.com
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        <div class="fp-news-section" id="fpNews">
          <div class="fp-section-head" style="padding-top:40px">
            <span class="fp-section-title">News</span>
            <div class="fp-section-line"></div>
          </div>
          <div class="fp-news-list" id="fpNewsList"><div class="fp-news-loading">Loading…</div></div>
        </div>
      </div>`;

    // Upcoming fight banner
    const _cv = Math.floor(Date.now() / 3600000);
    fetch(`events.json?v=${_cv}`)
      .then(r => r.ok ? r.json() : [])
      .then(events => {
        const now = new Date();
        for (const ev of events) {
          if (ev.status !== 'upcoming' || !ev.isoDate) continue;
          if (new Date(ev.isoDate) < now) continue;
          const all = [...(ev.mainCard||[]), ...(ev.prelims||[]), ...(ev.earlyPrelims||[])];
          const match = all.find(fight =>
            slugify(fight.a||'') === slugify(f.name) || slugify(fight.b||'') === slugify(f.name)
          );
          if (match) {
            const opp = slugify(match.a) === slugify(f.name) ? match.b : match.a;
            const evDate = new Date(ev.isoDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
            const banner = document.createElement('div');
            banner.className = 'fp-upcoming-banner';
            banner.innerHTML = `
              <span class="fp-upcoming-label">Next Fight</span>
              <span class="fp-upcoming-matchup">vs <strong>${esc(opp)}</strong></span>
              <span class="fp-upcoming-event">${esc(ev.name||'')} · ${esc(evDate)}</span>
              <a class="fp-upcoming-link" href="picks.html?id=${encodeURIComponent(ev.id||'')}">Make Your Picks</a>`;
            const hero = root.querySelector('.fp-hero');
            if (hero) root.insertBefore(banner, hero);
            break;
          }
        }
      }).catch(()=>{});

    // News
    loadFighterNews(f.name);
  }

  function loadFighterNews(name) {
    const list = document.getElementById('fpNewsList');
    if (!list) return;
    fetch(`https://mmabridge-backend.onrender.com/api/news/fighter?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : {articles:[]})
      .then(data => {
        const articles = data.articles || [];
        if (!articles.length) { list.innerHTML = '<div class="fp-news-empty">No recent news found.</div>'; return; }
        list.innerHTML = articles.map(a => {
          const date = a.date ? new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
          return `<a class="fp-news-item" href="${esc(a.url)}" target="_blank" rel="noopener">
            <div class="fp-news-item-title">${esc(a.title)}</div>
            <div class="fp-news-item-meta">${esc(a.source||'')}${date ? ' · '+date : ''}</div>
          </a>`;
        }).join('');
      }).catch(() => { list.innerHTML = '<div class="fp-news-empty">Could not load news.</div>'; });
  }

  function renderNotFound(name) {
    root.innerHTML = `
      <div class="fp-not-found">
        <strong>Fighter not found</strong>
        <span>${name ? `No profile for "${esc(name)}"` : 'No fighter specified.'}</span>
        <a href="events.html">← Back to events</a>
      </div>`;
  }

  const params    = new URLSearchParams(location.search);
  const nameParam = params.get('name') || params.get('id') || '';
  if (!nameParam) { renderNotFound(''); return; }

  const _cv = Math.floor(Date.now() / 3600000);
  fetch(`data/fighters.json?v=${_cv}`)
    .then(r => r.ok ? r.json() : [])
    .then(fighters => {
      const n = norm(nameParam);
      const f = fighters.find(x => norm(x.name) === n)
             || fighters.find(x => norm(x.name).includes(n) || n.includes(norm(x.name)))
             || fighters.find(x => (x.id||'') === slugify(nameParam));
      if (!f) { renderNotFound(nameParam); return; }
      renderProfile(f);
    })
    .catch(() => renderNotFound(nameParam));
})();
