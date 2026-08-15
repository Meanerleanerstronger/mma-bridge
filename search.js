// ==============================================
// MMA BRIDGE — GLOBAL SEARCH
// ==============================================
(function () {
  const input = document.getElementById('site-search');
  const form  = document.getElementById('site-search-form');
  if (!input || !form) return;

  let fighters = null, events = null, news = null;
  let loadPromise = null;
  let activeIdx = -1;
  let dropEl = null;
  let hideTimer = null;

  // ── Helpers ───────────────────────────────────
  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function slugify(s) {
    return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function isPast(ev) { return ev.isoDate && new Date(ev.isoDate) < new Date(); }
  function isMobile() { return window.matchMedia('(max-width:640px)').matches; }

  // ── Nickname / alias map ──────────────────────
  const ALIASES = {
    'blessed':          'max holloway',
    'suga':             "sean o'malley",
    'sugar':            "sean o'malley",
    'poatan':           'alex pereira',
    'borz':             'khamzat chimaev',
    'volk':             'alexander volkanovski',
    'highlight':        'justin gaethje',
    'el matador':       'ilia topuria',
    'boogeyman':        'ilia topuria',
    'chito':            'marlon vera',
    'pantera':          'charles oliveira',
    'do bronx':         'charles oliveira',
    'izzy':             'israel adesanya',
    'stylebender':      'israel adesanya',
    'bones':            'jon jones',
    'dc':               'daniel cormier',
    'wonderboy':        'stephen thompson',
    'nate':             'nate diaz',
    'nick':             'nick diaz',
    'prezident':        'dricus du plessis',
    'drakkar':          'drakkar klose',
    'leech':            'paddy pimblett',
    'paddy':            'paddy pimblett',
    'cowboy':           'donald cerrone',
    'gamebred':         'jorge masvidal',
    'soldier of god':   'khamzat chimaev',
    'le bon gamin':     'ciryl gane',
    'stylebender':      'israel adesanya',
    'the lion':         'ilia topuria',
  };

  // ── Page shortcuts ────────────────────────────
  const PAGE_SHORTCUTS = [
    { keywords: ['p4p','pound for pound','rankings','ranking','top 15'], label: 'P4P Rankings', sub: "Men's + Women's pound-for-pound", href: 'pfp.html' },
    { keywords: ['picks','upcoming events','fight card','events'], label: 'Upcoming Events & Picks', sub: 'Pick fight winners before they lock', href: 'events.html' },
    { keywords: ['leaderboard','standings','group','league','season'], label: 'Leaderboard', sub: 'Community + group season standings', href: 'leaderboard.html' },
    { keywords: ['review','reviews','past events','results','recap'], label: 'Event Reviews', sub: 'Rate and review past UFC events', href: 'reviews.html' },
    { keywords: ['lucas','bot','ai','chat','ask','analyst'], label: 'Ask Lucas Bot', sub: 'Your AI MMA analyst — ask anything', href: 'lucas.html' },
    { keywords: ['profile','account','my stats','my picks'], label: 'My Profile', sub: 'Your picks, stats, and tier rank', href: 'profile.html' },
    { keywords: ['about','privacy','contact'], label: 'About MMA Bridge', sub: 'About the site + privacy policy', href: 'about.html' },
  ];

  // ── Help topics — "how do I..." style queries get a real step-by-step
  // walkthrough card with screenshots instead of a page link. Matched by
  // phrase (substring) first, then by a looser keyword-overlap score so
  // "how do i view rankings" and "where are the divisional rankings"
  // both land on the same topic. ──────────────────────────────
  const HELP_TOPICS = [
    {
      id: 'make-picks',
      title: 'How to Make Your Picks',
      phrases: ['how do i make picks', 'how do i make my picks', 'how to make picks', 'how to pick', 'how do i pick', 'make picks', 'how does picking work'],
      keywords: ['pick', 'picks', 'picking'],
      steps: [
        { text: 'Head to Upcoming Events and open the card you want in on.', img: 'images/help/picks-1-events.jpg' },
        { text: 'Tap a fighter’s photo to pick them to win. Add a method and round guess for bonus points.', img: 'images/help/picks-2-select.jpg' },
        { text: 'Tip: press and hold (or hover) a fighter’s photo to preview their last 5 fights before you decide.', img: 'images/help/picks-3-profile.jpg' },
      ],
      cta: { label: 'Go make your picks', href: 'events.html' },
    },
    {
      id: 'p4p-rankings',
      title: 'How to View Pound-for-Pound Rankings',
      phrases: ['how do i view p4p', 'how to view p4p', 'where is p4p', 'how do i see p4p', 'p4p rankings', 'pound for pound rankings', 'how do i view pound for pound'],
      keywords: ['p4p', 'pound'],
      steps: [
        { text: 'Click Rankings in the top nav.', img: '' },
        { text: 'Men’s P4P is the default view — top 15 pound-for-pound, updated weekly. Switch to Women’s P4P with the tab next to it.', img: 'images/help/p4p-1-list.jpg' },
      ],
      cta: { label: 'Open P4P Rankings', href: 'pfp.html' },
    },
    {
      id: 'divisional-rankings',
      title: 'How to View Divisional Rankings',
      phrases: ['how do i view divisional rankings', 'how to view divisional rankings', 'divisional rankings', 'how do i see divisional rankings', 'weight class rankings', 'how do i view rankings by division'],
      keywords: ['divisional', 'division'],
      steps: [
        { text: 'Go to Rankings, then click the Divisional tab.', img: '' },
        { text: 'Pick a weight class chip (Flyweight, Bantamweight, Welterweight, etc) to see that division’s ranked contenders.', img: 'images/help/divisional-1-tab.jpg' },
      ],
      cta: { label: 'Open Divisional Rankings', href: 'pfp.html' },
    },
    {
      id: 'write-review',
      title: 'How to Write a Review',
      phrases: ['how do i write a review', 'how to write a review', 'how do i review', 'how to review an event', 'how do i rate a card', 'leave a review', 'write a review'],
      keywords: ['review', 'reviews', 'rate'],
      steps: [
        { text: 'Go to Review — every completed card is listed, newest first.', img: 'images/help/review-1-list.jpg' },
        { text: 'Open a card, rate it 1–5 stars, and optionally write up what you thought.', img: 'images/help/review-2-form.jpg' },
      ],
      cta: { label: 'Go to Reviews', href: 'reviews.html' },
    },
  ];

  // "how do/does/can/to i/you ..." — a strong signal this is a help query,
  // not a fighter/event search. Used to prioritize the help card over
  // regular results even on a looser keyword match.
  const HELP_INTENT_RE = /\b(how (do|does|can|to) (i|you|we)|where (is|are|do i)|how (do i|to))\b/i;

  function matchHelpTopic(q) {
    const ql = q.toLowerCase().trim();
    if (ql.length < 4) return null;
    // Exact/substring phrase match — highest confidence.
    for (const topic of HELP_TOPICS) {
      if (topic.phrases.some(p => ql.includes(p))) return topic;
    }
    // Looser match: has help intent AND at least one topic keyword.
    if (HELP_INTENT_RE.test(ql)) {
      for (const topic of HELP_TOPICS) {
        if (topic.keywords.some(kw => ql.includes(kw))) return topic;
      }
    }
    return null;
  }

  // ── Load data once ────────────────────────────
  async function loadData() {
    if (fighters && events) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const [fRes, eRes, nRes] = await Promise.all([
          fetch('fighters.json?_='+Date.now(), {cache:'no-store'}),
          fetch('data/events.json?_='+Date.now(), {cache:'no-store'}),
          fetch('data/news.json?_='+Date.now(), {cache:'no-store'}),
        ]);
        fighters = fRes.ok ? await fRes.json() : [];
        events   = eRes.ok ? await eRes.json() : [];
        news     = nRes.ok ? await nRes.json() : {};
      } catch {
        fighters = fighters || [];
        events   = events   || [];
        news     = news     || {};
      }
    })();
    return loadPromise;
  }

  // Pre-fetch on load
  loadData();

  // ── Matching logic ────────────────────────────
  function tokens(s) { return (s||'').toLowerCase().split(/\s+/).filter(Boolean); }

  function fighterMatches(f, q) {
    const alias = ALIASES[q.toLowerCase()];
    const checkQ = alias || q;
    const toks = tokens(checkQ);
    const haystack = [
      f.name, f.nickname, f.weightClass, f.nationality,
      f.fightingOut, f.flag, f.style,
      (f.bio||'').slice(0, 120)
    ].filter(Boolean).join(' ').toLowerCase();
    return toks.every(t => haystack.includes(t));
  }

  function eventMatches(ev, q) {
    const toks = tokens(q);
    const haystack = [
      ev.name, ev.eventName, ev.location, ev.venue,
      ...(ev.mainCard||[]).flatMap(f => [f.a, f.b, f.weight])
    ].filter(Boolean).join(' ').toLowerCase();
    return toks.every(t => haystack.includes(t));
  }

  function newsItems(q) {
    if (!news) return [];
    const toks = tokens(q);
    const items = [];
    if (news.hero?.title && toks.every(t => news.hero.title.toLowerCase().includes(t))) {
      items.push({ title: news.hero.title, href: 'index.html' });
    }
    (news.trending || []).forEach(n => {
      if (n.title && toks.every(t => n.title.toLowerCase().includes(t))) {
        items.push({ title: n.title, href: n.link || 'index.html' });
      }
    });
    (news.today || []).forEach(n => {
      const text = typeof n === 'string' ? n : n?.title || '';
      if (text && toks.every(t => text.toLowerCase().includes(t))) {
        items.push({ title: text, href: 'index.html' });
      }
    });
    return items.slice(0, 3);
  }

  function pageMatches(q) {
    const toks = tokens(q);
    return PAGE_SHORTCUTS.filter(p =>
      p.keywords.some(kw => toks.every(t => kw.includes(t)) || kw.includes(q.toLowerCase()))
    ).slice(0, 2);
  }

  // ── Record formatter ──────────────────────────
  function fmtRecord(r) {
    if (!r) return '';
    return `${r.wins||0}-${r.losses||0}${r.draws ? '-'+r.draws : ''}`;
  }

  // ── Dropdown ──────────────────────────────────
  function getOrCreateDrop() {
    if (dropEl) return dropEl;
    dropEl = document.createElement('div');
    dropEl.id = 'search-dropdown';
    dropEl.className = 'search-dropdown';
    if (isMobile()) document.body.appendChild(dropEl);
    else form.appendChild(dropEl);
    return dropEl;
  }

  function hideDrop() {
    clearTimeout(hideTimer);
    if (dropEl) dropEl.style.display = 'none';
    activeIdx = -1;
  }

  function navigateTo(url) {
    input.value = '';
    hideDrop();
    input.blur();
    window.location.href = url;
  }

  function buildRow(html, onClick) {
    const el = document.createElement('div');
    el.className = 'sd-row';
    el.innerHTML = html;
    el.addEventListener('mousedown', e => { e.preventDefault(); onClick(); });
    el.addEventListener('touchstart', e => { e.preventDefault(); onClick(); }, { passive: false });
    return el;
  }

  function addSection(drop, label) {
    drop.appendChild(Object.assign(document.createElement('div'), { className: 'sd-section', textContent: label }));
  }

  // ── User search via Supabase ──────────────────
  async function searchUsers(q) {
    const sb = window._sb;
    if (!sb || q.length < 1) return [];
    try {
      const { data } = await sb.from('profiles')
        .select('id, display_name, avatar_url')
        .ilike('display_name', `%${q}%`)
        .limit(4);
      return data || [];
    } catch { return []; }
  }

  // ── Render a "how do I..." help card ──────────
  function renderHelpCard(topic) {
    const drop = getOrCreateDrop();
    drop.innerHTML = '';
    drop.classList.add('sd-help-mode');

    const stepsHtml = topic.steps.map((s, i) => `
      <div class="sd-help-step">
        <div class="sd-help-step-row">
          <span class="sd-help-step-num">${i + 1}</span>
          <span class="sd-help-step-text">${escHtml(s.text)}</span>
        </div>
        ${s.img ? `<img class="sd-help-step-img" src="${escHtml(s.img)}" alt="Step ${i + 1}" loading="lazy">` : ''}
      </div>
    `).join('');

    const card = document.createElement('div');
    card.className = 'sd-help-card';
    card.innerHTML = `
      <div class="sd-help-header">
        <span class="sd-help-kicker">MMA Bridge Help</span>
        <button class="sd-help-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="sd-help-title">${escHtml(topic.title)}</div>
      <div class="sd-help-steps">${stepsHtml}</div>
      <a class="sd-help-cta" href="${escHtml(topic.cta.href)}">${escHtml(topic.cta.label)}</a>
    `;
    card.querySelector('.sd-help-close').addEventListener('mousedown', e => { e.preventDefault(); hideDrop(); });
    card.querySelector('.sd-help-cta').addEventListener('mousedown', e => { e.preventDefault(); navigateTo(topic.cta.href); });
    drop.appendChild(card);

    const askRow = document.createElement('div');
    askRow.className = 'sd-ask-lucas';
    askRow.innerHTML = `<span>Something else?</span> <a href="lucas.html">Ask Lucas <span class="sd-arrow-icon"></span></a>`;
    askRow.addEventListener('mousedown', e => e.preventDefault());
    drop.appendChild(askRow);

    drop.style.display = 'block';
    activeIdx = -1;
  }

  // ── Render dropdown ───────────────────────────
  function showDrop(pages, users, fighterResults, eventResults, newsResults) {
    const drop = getOrCreateDrop();
    drop.classList.remove('sd-help-mode');
    drop.innerHTML = '';

    const total = pages.length + users.length + fighterResults.length + eventResults.length + newsResults.length;
    if (!total) {
      drop.innerHTML = `<div class="sd-empty">No results — try "paddy", "lightweight", "UFC 330"</div>`;
      drop.style.display = 'block';
      activeIdx = -1;
      return;
    }

    // Pages
    if (pages.length) {
      addSection(drop, 'Go To');
      pages.forEach(p => {
        const row = buildRow(`
          <div class="sd-info">
            <span class="sd-name">${escHtml(p.label)}</span>
            <span class="sd-sub">${escHtml(p.sub)}</span>
          </div>
          <span class="sd-arrow-icon" style="width:9px;height:9px;flex-shrink:0;"></span>
        `, () => navigateTo(p.href));
        drop.appendChild(row);
      });
    }

    // People
    if (users.length) {
      addSection(drop, 'People');
      users.forEach(u => {
        const initials = (u.display_name||'?').slice(0,2).toUpperCase();
        const profileUrl = `profile.html?user=${encodeURIComponent(u.id)}`;
        const row = document.createElement('div');
        row.className = 'sd-row sd-user-row';
        row.innerHTML = `
          <div class="sd-user-avatar" ${u.avatar_url ? `style="background-image:url('${escHtml(u.avatar_url)}')"` : ''}>
            ${u.avatar_url ? '' : `<span>${escHtml(initials)}</span>`}
          </div>
          <div class="sd-info">
            <span class="sd-name">${escHtml(u.display_name||'Fighter')}</span>
            <span class="sd-sub">MMA Bridge member</span>
          </div>
          <button class="sd-challenge-btn" data-uid="${escHtml(u.id)}" data-uname="${escHtml(u.display_name||'Fighter')}">Challenge</button>
        `;
        const goToProfile = (e) => {
          if (e.target.closest('.sd-challenge-btn')) return;
          e.preventDefault();
          navigateTo(profileUrl);
        };
        const chBtn = row.querySelector('.sd-challenge-btn');
        if (chBtn) {
          const doChallenge = (e) => {
            e.stopPropagation(); e.preventDefault();
            input.value = ''; hideDrop();
            window.openChallengeModal?.(u.id, u.display_name||'Fighter');
          };
          chBtn.addEventListener('mousedown', e => { e.preventDefault(); doChallenge(e); });
          chBtn.addEventListener('touchstart', e => doChallenge(e), { passive: false });
        }
        row.addEventListener('mousedown', e => { e.preventDefault(); goToProfile(e); });
        row.addEventListener('touchstart', e => goToProfile(e), { passive: false });
        drop.appendChild(row);
      });
    }

    // Fighters
    if (fighterResults.length) {
      addSection(drop, 'Fighters');
      fighterResults.forEach(f => {
        const isChamp = (f.ranking||'').toLowerCase().includes('champ');
        const isPfp   = f.pfp || f.pfp_women;
        const record  = fmtRecord(f.record);
        const badges  = [
          isChamp ? `<span class="sd-badge sd-badge-champ">Champ</span>` : '',
          isPfp   ? `<span class="sd-badge sd-badge-pfp">★ P4P</span>` : '',
        ].filter(Boolean).join('');
        const row = buildRow(`
          <img class="sd-avatar" src="${escHtml(f.img||f.photo||'')}" alt="${escHtml(f.name)}" onerror="this.style.visibility='hidden'">
          <div class="sd-info">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span class="sd-name">${escHtml(f.name)}</span>${badges}
            </div>
            <span class="sd-sub">${escHtml(f.weightClass||'')}${record ? ' · ' + record : ''}${f.nationality ? ' · ' + f.nationality : ''}</span>
          </div>
        `, () => navigateTo(`fighter.html?id=${encodeURIComponent(f.id||slugify(f.name))}`));
        drop.appendChild(row);
      });
    }

    // Events
    if (eventResults.length) {
      addSection(drop, 'Events');
      eventResults.forEach(ev => {
        const id   = ev.id || slugify(ev.name||ev.eventName||'');
        const name = ev.name || ev.eventName || 'Unknown Event';
        const dest = isPast(ev)
          ? `event-review.html?id=${encodeURIComponent(id)}`
          : `events.html?id=${encodeURIComponent(id)}`;
        const main = (ev.mainCard||[]).find(f => f.slot==='main');
        const mainLine = main ? `${main.a} vs ${main.b}` : '';
        const row = buildRow(`
          <div class="sd-info">
            <span class="sd-name">${escHtml(name)}</span>
            <span class="sd-sub">${fmtDate(ev.isoDate)}${ev.location?' · '+ev.location:''}${mainLine?' · '+mainLine:''}</span>
          </div>
          <span style="font-size:0.65rem;color:rgba(255,255,255,0.25);flex-shrink:0;">${isPast(ev)?'Review':'Picks'}</span>
        `, () => navigateTo(dest));
        drop.appendChild(row);
      });
    }

    // News
    if (newsResults.length) {
      addSection(drop, 'News');
      newsResults.forEach(n => {
        const row = buildRow(`
          <div class="sd-info">
            <span class="sd-name" style="font-size:0.8rem;">${escHtml(n.title)}</span>
            <span class="sd-sub">Latest MMA news</span>
          </div>
        `, () => navigateTo(n.href));
        drop.appendChild(row);
      });
    }

    // "Ask Lucas" footer when there are results
    const askRow = document.createElement('div');
    askRow.className = 'sd-ask-lucas';
    askRow.innerHTML = `<span>Not finding it?</span> <a href="lucas.html">Ask Lucas <span class="sd-arrow-icon"></span></a>`;
    askRow.addEventListener('mousedown', e => e.preventDefault());
    drop.appendChild(askRow);

    drop.style.display = 'block';
    activeIdx = -1;
  }

  // ── Keyboard nav ──────────────────────────────
  function getRows() {
    return dropEl ? Array.from(dropEl.querySelectorAll('.sd-row')) : [];
  }

  input.addEventListener('keydown', e => {
    const rows = getRows();
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx+1, rows.length-1);
      rows.forEach((r,i) => r.classList.toggle('active', i===activeIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx-1, 0);
      rows.forEach((r,i) => r.classList.toggle('active', i===activeIdx));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && rows[activeIdx]) { e.preventDefault(); rows[activeIdx].dispatchEvent(new MouseEvent('mousedown')); }
    } else if (e.key === 'Escape') {
      hideDrop();
    }
  });

  // ── Input handler ─────────────────────────────
  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 1) { hideDrop(); return; }

    debounce = setTimeout(async () => {
      // Help queries ("how do I make picks") short-circuit straight to a
      // step-by-step card — no need to wait on fighter/event/news data.
      const helpTopic = matchHelpTopic(q);
      if (helpTopic) { renderHelpCard(helpTopic); return; }

      await loadData();
      const ql = q.toLowerCase();

      const pages = pageMatches(q);

      const fRes = (fighters||[])
        .filter(f => fighterMatches(f, q))
        .sort((a,b) => {
          const aTop = (a.pfp || a.pfp_women || (a.ranking||'').toLowerCase().includes('champ')) ? 0 : 1;
          const bTop = (b.pfp || b.pfp_women || (b.ranking||'').toLowerCase().includes('champ')) ? 0 : 1;
          return aTop - bTop;
        })
        .slice(0, 5);

      const eRes = (events||[])
        .filter(ev => eventMatches(ev, q))
        .sort((a,b) => new Date(b.isoDate||0) - new Date(a.isoDate||0))
        .slice(0, 5);

      const nRes = newsItems(q);
      const uRes = await searchUsers(q);

      showDrop(pages, uRes, fRes, eRes, nRes);
    }, 120);
  });

  // ── Hide on blur ──────────────────────────────
  input.addEventListener('blur', () => { hideTimer = setTimeout(hideDrop, 200); });
  input.addEventListener('focus', () => { clearTimeout(hideTimer); });

  form.addEventListener('submit', e => {
    if (dropEl && dropEl.style.display === 'block') e.preventDefault();
  });

  document.addEventListener('click', e => {
    if (dropEl && !form.contains(e.target) && !dropEl.contains(e.target)) hideDrop();
  });
})();
