// ==============================================
// MMA BRIDGE - MAIN SCRIPT (UPDATED WITH NEWS)
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';
import { showLoading, showError } from './loading.js';

// ===== MAIN =====
document.addEventListener("DOMContentLoaded", async () => {
  debugLog('MMA Bridge loaded', `Environment: ${CONFIG.ENV}`);

  // ===== RENDER NEWS =====
  await renderNews();

  // ===== TOP FIGHTERS RENDER =====
  const topFightersContainer = document.getElementById("top-fighters");
  if (topFightersContainer) {
    try {
      showLoading(topFightersContainer, 'Loading fighters...');
      
      const fighters = await API.getPFPRankings();
      
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
    } catch (err) {
      console.error("Top fighters failed to load", err);
      showError(topFightersContainer, 'Failed to load fighters');
    }
  }

  // ===== SEARCH (LIVE FILTER + ENTER NAV) =====
  setupSearch();
});

// ==============================================
// RENDER NEWS FROM API
// ==============================================
async function renderNews() {
  try {
    const news = await API.getNews();
    debugLog("NEWS API RESPONSE:", news);
    
    // Extract trending array
    const articles = news.trending || news || [];
    
    if (!articles || articles.length === 0) {
      console.warn('No news articles found');
      return;
    }

    // Render trending cards (first 3 articles)
    renderTrendingCards(articles.slice(0, 3));
    
    // Render sidebar list (first 4 articles)
    renderSidebarList(articles.slice(0, 4));
    
  } catch (error) {
    console.error("Error loading news:", error);
  }
}

// ==============================================
// RENDER TRENDING CARDS
// ==============================================
function renderTrendingCards(articles) {
  const cardsContainer = document.getElementById('trending-cards');
  if (!cardsContainer) return;
  
  cardsContainer.innerHTML = '';
  
  articles.forEach((article, index) => {
    // Support both old format (link) and new NewsAPI format (url)
    const articleUrl   = article.url || article.link || '#';
    const articleImage = article.imageUrl || article.image || '';
    const articleTitle = article.title || '';
    const articleSource = article.source || '';

    const card = document.createElement('a');
    card.href = articleUrl;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'card-link';
    card.setAttribute('data-title', articleTitle);
    
    const imageStyle = articleImage 
      ? `background-image: url('${articleImage}'); background-size:cover; background-position:center;` 
      : '';
    
    card.innerHTML = `
      <div class="medium-card">
        <div class="card-image ${!articleImage ? `story${index + 1}` : ''}" 
             style="${imageStyle}">
        </div>
        <h2>${articleTitle}</h2>
        ${articleSource ? `<div class="card-source" style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:4px;font-family:'Inter',sans-serif;">${articleSource}</div>` : ''}
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });
}

// ==============================================
// RENDER SIDEBAR LIST
// ==============================================
function renderSidebarList(articles) {
  const listContainer = document.getElementById('today-list');
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  
  articles.forEach(article => {
    const li = document.createElement('li');
    li.textContent = article.title;
    listContainer.appendChild(li);
  });
}

// ==============================================
// SETUP SEARCH
// ==============================================
function setupSearch() {
  const form = document.getElementById("site-search-form");
  const input = document.getElementById("site-search");
  const cardsWrap = document.getElementById("trending-cards");
  const todayList = document.getElementById("today-list");

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

    if (!q) {
      cardLinks.forEach(a => (a.style.display = ""));
      todayItems.forEach(li => (li.style.display = ""));
      return;
    }

    cardLinks.forEach(a => {
      const title =
        normalize(a.getAttribute("data-title")) ||
        normalize(a.querySelector("h2")?.textContent);

      a.style.display = title.includes(q) ? "" : "none";
    });

    todayItems.forEach(li => {
      const text = normalize(li.textContent);
      li.style.display = text.includes(q) ? "" : "none";
    });
  }

  input.addEventListener("input", (e) => filterPage(e.target.value));

  form.addEventListener("submit", (e) => {
    const cleaned = input.value.trim();

    if (!cleaned) {
      e.preventDefault();
      filterPage("");
      return;
    }

    input.value = cleaned;
  });
}
