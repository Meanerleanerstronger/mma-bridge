document.addEventListener("DOMContentLoaded", async () => {
  const drawer = document.getElementById("fightDrawer");
  const drawerClose = document.getElementById("drawerClose");
  const drawerX = document.getElementById("drawerX");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerContent = document.getElementById("drawerContent");

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const prettyDate = d =>
    d ? d.split("-").slice(1).concat(d.split("-")[0]).join("/") : "";

  function openDrawer(title, html) {
    drawerTitle.textContent = title;
    drawerContent.innerHTML = html;
    drawer.classList.add("open");
    document.body.classList.add("no-scroll");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    document.body.classList.remove("no-scroll");
  }

  drawerClose.onclick = closeDrawer;
  drawerX.onclick = closeDrawer;
  document.addEventListener("keydown", e => e.key === "Escape" && closeDrawer());

  function renderLast5(fights) {
    if (!fights?.length) return `<div class="empty">No recent fights</div>`;

    // ---- STREAK (WWLWW etc) ----
    const streak = fights
      .slice(0, 5)
      .map(f => (f.result || "").toUpperCase());

    return `
      <div class="streak">
        ${streak.map(r => {
          const cls = r === "W" ? "win" : r === "L" ? "loss" : "na";
          return `<span class="wl ${cls}">${r}</span>`;
        }).join("")}
      </div>

      <div class="last5-list">
        ${fights.slice(0, 5).map(f => {
          const r = (f.result || "").toUpperCase();
          const cls = r === "W" ? "win" : r === "L" ? "loss" : "na";
          return `
            <div class="bout ${cls}">
              <div class="bout-top">
                <span class="wl ${cls}">${r}</span>
                <span class="bout-opp">vs ${escapeHtml(f.opponent)}</span>
                <span class="bout-date">${prettyDate(f.date)}</span>
              </div>
              <div class="bout-sub">
                ${f.method ? `<span class="pill">${escapeHtml(f.method)}</span>` : ""}
                ${f.round ? `<span class="pill pill-dim">R${escapeHtml(f.round)}</span>` : ""}
              </div>
            </div>`;
        }).join("")}
      </div>
    `;
  }

  const fighters = await fetch("fighters.json").then(r => r.json());

  document.querySelectorAll("[data-fighter]").forEach(card => {
    card.onclick = e => {
      e.preventDefault();
      const f = fighters[card.dataset.fighter];
      if (!f) return;

      openDrawer(f.name, `
        <div class="drawer-hero">
          <div class="drawer-a">${escapeHtml(f.name)}</div>
          <div class="drawer-pills">
            <span class="pill">${escapeHtml(f.flag)} ${escapeHtml(f.country)}</span>
            <span class="pill pill-dim">${escapeHtml(f.record)}</span>
            <span class="pill">${escapeHtml(f.division)}</span>
          </div>
        </div>

        <div class="drawer-card">
          ${renderLast5(f.last5)}
        </div>

        <div class="drawer-card">
          <div class="drawer-card-title">Profile</div>
          <div class="stats-grid">
            <div class="stat-row">
              <div class="stat-label">Stance</div><div>${escapeHtml(f.stance)}</div>
            </div>
            <div class="stat-row">
              <div class="stat-label">Age</div><div>${escapeHtml(f.age)}</div>
            </div>
            <div class="stat-row">
              <div class="stat-label">Height</div><div>${escapeHtml(f.height)}</div>
            </div>
            <div class="stat-row">
              <div class="stat-label">Reach</div><div>${escapeHtml(f.reach)}</div>
            </div>
          </div>
        </div>
      `);
    };
  });
});
