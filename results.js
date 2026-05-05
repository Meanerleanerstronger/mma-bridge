(function () {
  function normalize(s) { return (s || '').toLowerCase().trim(); }
  function cleanQuery(q) {
    return (q || '').replace(/[\\\/]+$/g, '').replace(/\s+/g, ' ').trim();
  }
  function getQuery() {
    return cleanQuery(new URLSearchParams(window.location.search).get('q') || '');
  }

  const titleEl   = document.getElementById('results-title');
  const countEl   = document.getElementById('results-count');
  const searchEl  = document.getElementById('results-search');
  const cardsEl   = document.getElementById('results-cards');

  if (!searchEl || !cardsEl) return;

  // Static story data — replace with API data when available
  const stories = [
    { title: 'Paddy vs Gaethje Official', type: 'Breaking', img: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2025-12/012426-ufc-324-gaethje-vs-pimblett-EVENT-ART.jpg', href: '#' },
    { title: 'Ilia vs Max Heats Up', type: 'News', img: 'https://www.ufc.com/images/styles/background_image_xl_2x/s3/2024-09/102624-ufc-308-topuria-vs-holloway-EVENT-ART.jpg', href: '#' },
    { title: 'Gaethje Teases Retirement', type: 'Feature', img: 'https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2026-01/GAETHJE_JUSTIN_L_BELTMOCK.png', href: '#' },
    { title: 'UFC 325 Rumored for Perth', type: 'News', img: '', href: '#' },
    { title: 'Islam Calls Out Usman', type: 'Breaking', img: '', href: '#' },
  ];

  function matches(q, text) {
    if (!q) return true;
    return normalize(text).includes(normalize(q));
  }

  function cardHtml(s) {
    return `
      <a href="${s.href}" class="results-card">
        ${s.img
          ? `<img class="results-card-img" src="${s.img}" alt="${s.title}" loading="lazy">`
          : `<div class="results-card-img-placeholder"></div>`}
        <div class="results-card-body">
          <div class="results-card-type">${s.type}</div>
          <div class="results-card-name">${s.title}</div>
        </div>
      </a>`;
  }

  function render(raw) {
    const q = cleanQuery(raw);

    if (titleEl) titleEl.innerHTML = q
      ? `"<span>${q}</span>"`
      : 'All Stories';

    const matched = stories.filter(s => matches(q, s.title));

    if (countEl) countEl.textContent = matched.length
      ? `${matched.length} result${matched.length !== 1 ? 's' : ''}`
      : '';

    if (matched.length) {
      cardsEl.innerHTML = matched.map(cardHtml).join('');
    } else {
      cardsEl.innerHTML = `
        <div class="results-empty" style="grid-column:1/-1">
          <div class="results-empty-icon">🔍</div>
          <div class="results-empty-title">No results found</div>
          <div class="results-empty-sub">Try a fighter name like "paddy" or "ilia", or an event like "UFC 300".</div>
        </div>`;
    }
  }

  const initial = getQuery();
  searchEl.value = initial;
  render(initial);

  searchEl.addEventListener('input', e => render(e.target.value));

  // Allow re-searching by pressing Enter
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
