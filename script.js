// ===== MAIN =====
document.addEventListener("DOMContentLoaded", () => {
  // ===== NEWS JSON =====
  fetch("./data/news.json")
    .then(response => response.json())
    .then(data => {
      console.log("NEWS JSON LOADED:", data);
      // If you render news cards somewhere, do it here.
    })
    .catch(error => {
      console.error("Error loading news:", error);
    });

  // ===== TOP FIGHTERS RENDER =====
  const topFightersContainer = document.getElementById("top-fighters");
  if (topFightersContainer) {
    fetch("./data/top_fighters.json")
      .then(res => res.json())
      .then(fighters => {
        topFightersContainer.innerHTML = "";
        fighters.forEach(f => {
          const div = document.createElement("div");
          div.className = "fighter-card";
          div.innerHTML = `
            <h3>${f.name}</h3>
            <p>${f.weight}</p>
            <p>${f.record}</p>
            <p>Wins: ${f.wins}</p>
          `;
          topFightersContainer.appendChild(div);
        });
      })
      .catch(err => {
        console.error("Top fighters failed to load", err);
      });
  }

  // ===== SEARCH (LIVE FILTER + ENTER NAV) =====
  const form = document.getElementById("site-search-form");
  const input = document.getElementById("site-search");
  const cardsWrap = document.getElementById("trending-cards");
  const todayList = document.getElementById("today-list");

  // If these are missing on this page, search doesn't run. That’s normal.
  if (!form || !input) return;

  const cardLinks = cardsWrap
    ? Array.from(cardsWrap.querySelectorAll(".card-link"))
    : [];
  const todayItems = todayList
    ? Array.from(todayList.querySelectorAll("li"))
    : [];

  function normalize(str) {
    return (str || "").toLowerCase().trim();
  }

  function filterPage(queryRaw) {
    const q = normalize(queryRaw);

    // If empty: show everything
    if (!q) {
      cardLinks.forEach(a => (a.style.display = ""));
      todayItems.forEach(li => (li.style.display = ""));
      return;
    }

    // Filter cards (use data-title first, fallback to h2 text)
    cardLinks.forEach(a => {
      const title =
        normalize(a.getAttribute("data-title")) ||
        normalize(a.querySelector("h2")?.textContent);

      a.style.display = title.includes(q) ? "" : "none";
    });

    // Filter sidebar list
    todayItems.forEach(li => {
      const text = normalize(li.textContent);
      li.style.display = text.includes(q) ? "" : "none";
    });
  }

  // Live filter while typing
  input.addEventListener("input", (e) => filterPage(e.target.value));

  // Clean submit (Enter)
  form.addEventListener("submit", (e) => {
    const cleaned = input.value.trim();

    if (!cleaned) {
      e.preventDefault(); // don’t go to results page with empty query
      filterPage("");
      return;
    }

    input.value = cleaned;
    // Let the form submit normally to results.html?q=cleaned
  });
});
