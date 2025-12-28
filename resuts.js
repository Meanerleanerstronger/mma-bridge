(function () {
  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  function cleanQuery(q) {
    return (q || "")
      .replace(/[\\\/]+$/g, "")  // remove trailing \ or /
      .replace(/\s+/g, " ")      // collapse spaces
      .trim();
  }

  function getQuery() {
    const params = new URLSearchParams(window.location.search);
    return cleanQuery(params.get("q") || "");
  }

  const titleEl = document.getElementById("results-title");
  const searchInput = document.getElementById("results-search");
  const form = document.getElementById("results-search-form");
  const cardsWrap = document.getElementById("results-cards");
  const todayWrap = document.getElementById("results-today");

  if (!searchInput || !cardsWrap || !todayWrap) {
    console.error("Results page missing required elements.");
    return;
  }

  const cards = [
    { title: "Paddy vs Gaethje Official", href: "https://www.espn.com/mma/", imgClass: "story1" },
    { title: "Ilia vs Max Heats Up", href: "https://www.espn.com/mma/", imgClass: "story2" },
    { title: "Gaethje Teases Retirement", href: "https://www.espn.com/mma/", imgClass: "story3" },
  ];

  const today = [
    "Gaethje hints at retirement",
    "Ilia and Max go back and forth at UFC 308 Presser",
    "Islam calls out Usman for 1st defence",
    "UFC 325 rumored for Perth, Australia",
  ];

  function setTitle(qRaw) {
    const q = normalize(qRaw);
    if (!titleEl) return;
    titleEl.textContent = q ? `Results for "${qRaw}"` : "Search Results";
  }

  function matches(qRaw, text) {
    const q = normalize(qRaw);
    if (!q) return true;
    return normalize(text).includes(q);
  }

  function render(qRaw) {
    const cleaned = cleanQuery(qRaw);
    setTitle(cleaned);

    const matchedCards = cards.filter(c => matches(cleaned, c.title));
    cardsWrap.innerHTML = matchedCards.length
      ? matchedCards.map(c => `
          <a href="${c.href}" target="_blank" class="card-link" data-title="${c.title}">
            <div class="medium-card">
              <div class="card-image ${c.imgClass}"></div>
              <h2>${c.title}</h2>
            </div>
          </a>
        `).join("")
      : `<p style="color:#aaa;">No matching trending cards.</p>`;

    const matchedToday = today.filter(t => matches(cleaned, t));
    todayWrap.innerHTML = matchedToday.length
      ? matchedToday.map(t => `<li style="margin-bottom:12px;">${t}</li>`).join("")
      : `<li style="color:#aaa;">No matching items.</li>`;
  }

  // init
  const initialQ = getQuery();
  searchInput.value = initialQ;
  render(initialQ);

  // live filter
  searchInput.addEventListener("input", (e) => render(e.target.value));

  // submit
  if (form) {
    form.addEventListener("submit", (e) => {
      const cleaned = cleanQuery(searchInput.value);
      if (!cleaned) {
        e.preventDefault();
        searchInput.value = "";
        render("");
        return;
      }
      searchInput.value = cleaned;
      // allow normal GET navigation to results.html?q=cleaned
    });
  }
})();
