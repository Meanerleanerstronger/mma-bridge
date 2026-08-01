(function () {
  function normalize(s) { return (s||'').toLowerCase().trim(); }
  function cleanQuery(q) { return (q||'').replace(/[\\\/]+$/g,'').replace(/\s+/g,' ').trim(); }
  function getQuery() { return cleanQuery(new URLSearchParams(window.location.search).get('q')||''); }
  function slugify(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function isPast(ev) { return ev.isoDate && new Date(ev.isoDate) < new Date(); }
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function fmtRecord(r) {
    if (!r) return '';
    return `${r.wins||0}-${r.losses||0}${r.draws?'-'+r.draws:''}`;
  }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  const titleEl  = document.getElementById('results-title');
  const countEl  = document.getElementById('results-count');
  const searchEl = document.getElementById('results-search');
  const cardsEl  = document.getElementById('results-cards');
  if (!searchEl || !cardsEl) return;

  let fighters = [], events = [], news = {};

  async function loadAll() {
    try {
      const [fRes, eRes, nRes] = await Promise.all([
        fetch('fighters.json?_='+Date.now(),{cache:'no-store'}),
        fetch('data/events.json?_='+Date.now(),{cache:'no-store'}),
        fetch('data/news.json?_='+Date.now(),{cache:'no-store'}),
      ]);
      fighters = fRes.ok ? await fRes.json() : [];
      events   = eRes.ok ? await eRes.json() : [];
      news     = nRes.ok ? await nRes.json() : {};
    } catch {}
  }

  // ── Alias map (shared with search.js) ────────
  const ALIASES = {
    'blessed':'max holloway','suga':"sean o'malley",'sugar':"sean o'malley",
    'poatan':'alex pereira','borz':'khamzat chimaev','volk':'alexander volkanovski',
    'highlight':'justin gaethje','boogeyman':'ilia topuria','el matador':'ilia topuria',
    'chito':'marlon vera','pantera':'charles oliveira','do bronx':'charles oliveira',
    'izzy':'israel adesanya','stylebender':'israel adesanya','bones':'jon jones',
    'dc':'daniel cormier','wonderboy':'stephen thompson','nate':'nate diaz',
    'nick':'nick diaz','prezident':'dricus du plessis','paddy':'paddy pimblett',
    'le bon gamin':'ciryl gane','gamebred':'jorge masvidal',
  };

  function tokens(s) { return (s||'').toLowerCase().split(/\s+/).filter(Boolean); }

  function fighterMatches(f, q) {
    const alias = ALIASES[q.toLowerCase()];
    const toks = tokens(alias||q);
    const hay = [f.name,f.nickname,f.weightClass,f.nationality,f.fightingOut,f.style,(f.bio||'').slice(0,120)]
      .filter(Boolean).join(' ').toLowerCase();
    return toks.every(t => hay.includes(t));
  }

  function eventMatches(ev, q) {
    const toks = tokens(q);
    const hay = [ev.name,ev.eventName,ev.location,ev.venue,
      ...(ev.mainCard||[]).flatMap(f=>[f.a,f.b,f.weight])
    ].filter(Boolean).join(' ').toLowerCase();
    return toks.every(t => hay.includes(t));
  }

  function newsMatches(text, q) {
    const toks = tokens(q);
    return toks.every(t => text.toLowerCase().includes(t));
  }

  // ── Card builders ─────────────────────────────
  function fighterCard(f) {
    const isChamp = (f.ranking||'').toLowerCase().includes('champ');
    const isPfp   = f.pfp || f.pfp_women;
    const record  = fmtRecord(f.record);
    const badge   = isChamp ? `<span style="background:rgba(200,150,10,.14);border:1px solid rgba(200,150,10,.4);color:#c9a227;font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:20px;padding:2px 8px;">Champ</span>` :
                    isPfp   ? `<span style="background:rgba(255,138,61,.08);border:1px solid rgba(255,138,61,.22);color:#ff8a3d;font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:20px;padding:2px 8px;">★ P4P</span>` : '';
    return `
      <a href="fighter.html?id=${esc(f.id||slugify(f.name))}" class="results-card">
        ${f.img||f.photo ? `<img class="results-card-img" src="${esc(f.img||f.photo)}" alt="${esc(f.name)}" loading="lazy" style="object-fit:cover;object-position:top center;">` : `<div class="results-card-img-placeholder"></div>`}
        <div class="results-card-body">
          <div class="results-card-type" style="display:flex;align-items:center;gap:6px;">
            Fighter ${badge}
          </div>
          <div class="results-card-name">${esc(f.name)}${f.nickname?` <span style="font-weight:400;opacity:.5;font-size:.8em;">"${esc(f.nickname)}"</span>`:''}</div>
          <div class="results-card-meta">${esc(f.weightClass||'')}${record?' · '+record:''}${f.nationality?' · '+f.nationality:''}</div>
        </div>
      </a>`;
  }

  function eventCard(ev) {
    const id   = ev.id||slugify(ev.name||ev.eventName||'');
    const name = ev.name||ev.eventName||'Unknown Event';
    const dest = isPast(ev) ? `event-review.html?id=${encodeURIComponent(id)}` : `events.html?id=${encodeURIComponent(id)}`;
    const main = (ev.mainCard||[]).find(f=>f.slot==='main');
    const mainLine = main ? `${main.a} vs ${main.b}` : '';
    const statusTag = isPast(ev)
      ? `<span style="color:rgba(255,255,255,.3);">Completed</span>`
      : `<span style="color:#ff8a3d;">Upcoming</span>`;
    return `
      <a href="${dest}" class="results-card">
        ${ev.poster ? `<img class="results-card-img" src="${esc(ev.poster)}" alt="${esc(name)}" loading="lazy" style="object-fit:cover;object-position:top center;">` : `<div class="results-card-img-placeholder"></div>`}
        <div class="results-card-body">
          <div class="results-card-type" style="display:flex;align-items:center;gap:6px;">${esc(ev.type||'Event')} ${statusTag}</div>
          <div class="results-card-name">${esc(name)}</div>
          <div class="results-card-meta">${fmtDate(ev.isoDate)}${ev.location?' · '+ev.location:''}${mainLine?'<br>'+mainLine:''}</div>
        </div>
      </a>`;
  }

  function newsCard(title, href) {
    return `
      <a href="${esc(href)}" class="results-card" target="_blank" rel="noopener">
        <div class="results-card-img-placeholder" style="background:linear-gradient(135deg,#0d1117,#161b22);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:2rem;opacity:.3;">📰</span>
        </div>
        <div class="results-card-body">
          <div class="results-card-type">News</div>
          <div class="results-card-name">${esc(title)}</div>
        </div>
      </a>`;
  }

  // ── Render ────────────────────────────────────
  function render(raw) {
    const q = cleanQuery(raw);

    if (titleEl) titleEl.innerHTML = q ? `"<span>${esc(q)}</span>"` : 'Search MMA Bridge';

    if (!q) {
      cardsEl.innerHTML = `<div class="results-empty" style="grid-column:1/-1">
        <div class="results-empty-title">What are you looking for?</div>
        <div class="results-empty-sub">Try a fighter name, nickname, event, weight class, or nationality.</div>
      </div>`;
      if (countEl) countEl.textContent = '';
      return;
    }

    const fRes = fighters.filter(f=>fighterMatches(f,q))
      .sort((a,b)=>{
        const aTop=(a.pfp||a.pfp_women||(a.ranking||'').toLowerCase().includes('champ'))?0:1;
        const bTop=(b.pfp||b.pfp_women||(b.ranking||'').toLowerCase().includes('champ'))?0:1;
        return aTop-bTop;
      }).slice(0,12);

    const eRes = events.filter(ev=>eventMatches(ev,q))
      .sort((a,b)=>new Date(b.isoDate||0)-new Date(a.isoDate||0))
      .slice(0,8);

    const nRes = [];
    if (news.hero?.title && newsMatches(news.hero.title,q)) nRes.push({title:news.hero.title,href:'index.html'});
    (news.trending||[]).forEach(n=>{ if(n.title&&newsMatches(n.title,q)) nRes.push({title:n.title,href:n.link||'index.html'}); });
    (news.today||[]).forEach(n=>{ const t=typeof n==='string'?n:n?.title||''; if(t&&newsMatches(t,q)) nRes.push({title:t,href:'index.html'}); });

    const total = fRes.length + eRes.length + nRes.length;

    if (countEl) countEl.textContent = total ? `${total} result${total!==1?'s':''}` : '';

    if (!total) {
      cardsEl.innerHTML = `
        <div class="results-empty" style="grid-column:1/-1">
          <div class="results-empty-title">No results for "${esc(q)}"</div>
          <div class="results-empty-sub">Try a fighter nickname, weight class, or country. Or <a href="lucas.html" style="color:#ff8a3d;">ask Lucas</a>.</div>
        </div>`;
      return;
    }

    let html = '';
    if (fRes.length) html += fRes.map(fighterCard).join('');
    if (eRes.length) html += eRes.map(eventCard).join('');
    if (nRes.length) html += nRes.map(n=>newsCard(n.title,n.href)).join('');
    cardsEl.innerHTML = html;
  }

  // ── Init ──────────────────────────────────────
  const initial = getQuery();
  searchEl.value = initial;

  loadAll().then(() => render(initial));

  let debounce = null;
  searchEl.addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => render(e.target.value), 150);
  });
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const cleaned = cleanQuery(searchEl.value);
      const url = new URL(window.location.href);
      url.searchParams.set('q', cleaned);
      window.history.replaceState({}, '', url);
      render(cleaned);
    }
  });
})();
