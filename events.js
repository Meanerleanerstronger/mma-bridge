// ==============================================
// MMA BRIDGE - EVENTS PAGE (UPDATED)
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';
import { showLoading, showError } from './loading.js';

document.addEventListener("DOMContentLoaded", async () => {
  const wrap = document.getElementById("events-list");

  const drawer = document.getElementById("fightDrawer");
  const drawerClose = document.getElementById("drawerClose");
  const drawerX = document.getElementById("drawerX");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerContent = document.getElementById("drawerContent");

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openDrawer(title, html) {
    drawerTitle.textContent = title;
    drawerContent.innerHTML = html;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  drawerClose?.addEventListener("click", closeDrawer);
  drawerX?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // -----------------------
  // Fighters DB (read-only)
  // -----------------------
  let fightersDB = {};

  function slugifyName(name) {
    return (name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  function getFighterByName(name) {
    return fightersDB[slugifyName(name)] || null;
  }

  function methodIcon(method) {
    const m = (method || "").toUpperCase();
    if (m.includes("SUB")) return "⛓️";
    if (m.includes("KO") || m.includes("TKO")) return "🥊";
    if (m.includes("UD") || m.includes("SD") || m.includes("MD")) return "🧾";
    return "•";
  }

  function renderFormColumn(name) {
    const f = getFighterByName(name);

    if (!f) {
      return `
        <div class="form-col">
          <div class="form-head">
            <div class="form-name">${escapeHtml(name)}</div>
            <div class="form-record">—</div>
          </div>
          <div class="hint">No data yet</div>
        </div>
      `;
    }

    const fights = Array.isArray(f.last5) ? f.last5.slice(0, 5) : [];

    return `
      <div class="form-col">
        <div class="form-head">
          <div class="form-name">${escapeHtml(f.name)}</div>
          <div class="form-record">${escapeHtml(f.record || "—")}</div>
        </div>

        <div class="form-list">
          ${
            fights.length
              ? fights
                  .map(
                    (x) => `
                  <div class="form-row">
                    <span class="form-badge ${x.result === "W" ? "win" : "loss"}">${escapeHtml(x.result)}</span>
                    <span class="form-icon">${methodIcon(x.method)}</span>
                    <span class="form-opp">vs ${escapeHtml(x.opponent)}</span>
                    <span class="form-date">${escapeHtml(x.date || "")}</span>
                  </div>
                `
                  )
                  .join("")
              : `<div class="hint">No recent fights listed</div>`
          }
        </div>
      </div>
    `;
  }

  function renderRecentFormDual(a, b) {
    return `
      <div class="drawer-card">
        <div class="drawer-card-title">Recent Form</div>
        <div class="form-split">
          ${renderFormColumn(a)}
          ${renderFormColumn(b)}
        </div>
      </div>
    `;
  }

  // -----------------------
  // Existing events helpers
  // -----------------------
  function iconRow(f) {
    const icons = [];
    if (f.titleFight) icons.push(`<span class="ico cup" title="Title fight">🏆</span>`);
    if (f.ranked) icons.push(`<span class="ico star" title="Ranked fight">⭐</span>`);
    return icons.join("");
  }

  function slotLabel(f) {
    if (f.slot === "main") return `<div class="slot main-slot">MAIN EVENT</div>`;
    if (f.slot === "comain") return `<div class="slot comain-slot">CO-MAIN EVENT</div>`;
    return "";
  }

  function fightRow(f, eventMeta) {
    const a = escapeHtml(f.a);
    const b = escapeHtml(f.b);
    const w = escapeHtml(f.weight || "");
    const r = escapeHtml(f.rounds || "");
    const icons = iconRow(f);
    const slot = slotLabel(f);

    const isMain = f.slot === "main";
    const isCoMain = f.slot === "comain";
    const heroClass = isMain ? "fight-hero" : isCoMain ? "fight-hero fight-hero-2" : "";

    const payload = escapeHtml(
      JSON.stringify({
        ...f,
        eventName: eventMeta.name,
        eventDate: eventMeta.date,
        eventLocation: eventMeta.location,
        eventVenue: eventMeta.venue
      })
    );

    return `
      <button class="fight-row ${heroClass}" type="button" data-fight="${payload}">
        <div class="fight-topline">
          ${slot}
          <div class="fight-icons">${icons}</div>
        </div>

        <div class="fight-names">
          <span class="fight-a">${a}</span>
          <span class="fight-vs">vs</span>
          <span class="fight-b">${b}</span>
        </div>

        <div class="fight-meta">
          ${w ? `<span class="pill">${w}</span>` : ""}
          ${r ? `<span class="pill pill-dim">${r}</span>` : ""}
        </div>
      </button>
    `;
  }

  function dropdown(label, fights, eventMeta, openByDefault = false) {
    const openAttr = openByDefault ? "open" : "";
    const count = Array.isArray(fights) ? fights.length : 0;

    return `
      <details class="drop" ${openAttr}>
        <summary class="drop-sum">
          <span class="drop-label">${escapeHtml(label)}</span>
          <span class="drop-right">
            <span class="count">${count}</span>
            <span class="chev">▾</span>
          </span>
        </summary>

        <div class="drop-body">
          ${
            count
              ? fights.map((f) => fightRow(f, eventMeta)).join("")
              : `<div class="empty">Nothing listed yet.</div>`
          }
        </div>
      </details>
    `;
  }

  function eventAccordion(ev, idx) {
    const name = escapeHtml(ev.name);
    const type = escapeHtml(ev.type || "");
    const date = escapeHtml(ev.date || "TBA");
    const location = escapeHtml(ev.location || "");
    const venue = escapeHtml(ev.venue || "");
    const posterPath = escapeHtml(ev.poster || "");

    const eventMeta = {
      name: ev.name,
      date: ev.date,
      location: ev.location,
      venue: ev.venue
    };

    const poster = posterPath
      ? `<img class="event-poster" src="${posterPath}" alt="${name} poster" onerror="this.style.display='none'">`
      : "";

    return `
      <details class="event" ${idx === 0 ? "open" : ""}>
        <summary class="event-sum">
          <div class="event-left">
            <div class="event-title">
              ${name}
              ${type ? `<span class="event-tag">${type}</span>` : ""}
            </div>
            <div class="event-subline">
              <span class="dim">${date}</span>
              ${location ? `<span class="dot">•</span><span class="dim">${location}</span>` : ""}
              ${venue ? `<span class="dot">•</span><span class="dim">${venue}</span>` : ""}
            </div>
          </div>

          <div class="event-right">
            <div class="view-chip">VIEW</div>
            <div class="event-chev">▾</div>
          </div>
        </summary>

        <div class="event-body cinematic">
          <div class="poster-wrap">
            ${poster}
          </div>

          <div class="event-drops">
            ${dropdown("Main Card", ev.mainCard, eventMeta, true)}
            ${dropdown("Prelims", ev.prelims, eventMeta, false)}
            ${dropdown("Early Prelims", ev.earlyPrelims, eventMeta, false)}
          </div>
        </div>
      </details>
    `;
  }

  function bindFightClicks() {
    wrap.querySelectorAll("[data-fight]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-fight");
        if (!raw) return;

        let f;
        try {
          f = JSON.parse(raw);
        } catch {
          return;
        }

        const title = `${f.a} vs ${f.b}`;

        const html = `
          <div class="drawer-hero">
            <div class="drawer-fightline">
              <div class="drawer-a">${escapeHtml(f.a)}</div>
              <div class="drawer-vs">vs</div>
              <div class="drawer-b">${escapeHtml(f.b)}</div>
            </div>

            <div class="drawer-pills">
              ${f.weight ? `<span class="pill">${escapeHtml(f.weight)}</span>` : ""}
              ${f.rounds ? `<span class="pill pill-dim">${escapeHtml(f.rounds)}</span>` : ""}
              ${f.titleFight ? `<span class="pill">🏆 Belt</span>` : ""}
              ${f.ranked ? `<span class="pill">⭐ Ranked</span>` : ""}
            </div>

            <div class="drawer-sub">
              <div class="drawer-event">${escapeHtml(f.eventName || "")}</div>
              <div class="drawer-meta">
                ${escapeHtml(f.eventDate || "TBA")}
                ${f.eventLocation ? ` • ${escapeHtml(f.eventLocation)}` : ""}
                ${f.eventVenue ? ` • ${escapeHtml(f.eventVenue)}` : ""}
              </div>
            </div>
          </div>

          <div class="drawer-grid">
            <div class="drawer-card">
              <div class="drawer-card-title">Quick Notes</div>
              <div class="drawer-lines">
                <div class="line">${f.titleFight ? "🏆 Belt on the line" : "No belt on the line"}</div>
                <div class="line">${f.ranked ? "⭐ Ranked matchup" : "Not ranked matchup"}</div>
              </div>
              <div class="hint">
                Next step: hook this to fighters.json for records, stance, reach, last 3 fights.
              </div>
            </div>

            ${renderRecentFormDual(f.a, f.b)}

            <div class="drawer-card">
              <div class="drawer-card-title">Prediction slot</div>
              <div class="hint">
                Later: odds, "who wins", and a tiny breakdown.
              </div>
            </div>
          </div>
        `;

        openDrawer(title, html);
      });
    });
  }

  // ==============================================
  // UPDATED LOADING SECTION
  // ==============================================
  try {
    // Show loading state
    showLoading(wrap, 'Loading events...');
    
    debugLog('Loading events page...');

    // Load fighters DB first (safe if missing)

    // Load fighters DB first (safe if missing)
    try {
      fightersDB = await API.getFighters();
      debugLog('Fighters loaded:', Object.keys(fightersDB).length);
    } catch (error) {
      debugLog('Fighters DB failed to load (non-critical)');
      fightersDB = {};
    }

    // Load events using new API
    const events = await API.getUpcomingEvents();
    debugLog('Events loaded:', events.length);

    if (!Array.isArray(events) || !events.length) {
      wrap.innerHTML = `<div class="empty big">No events loaded. Your data source is empty.</div>`;
      return;
    }

    wrap.innerHTML = events.map(eventAccordion).join("");
    bindFightClicks();
    
    debugLog('Events page ready!');

  } catch (err) {
    console.error('Error loading events:', err);
    showError(wrap, 'Failed to load events. Please try again.');
  }
});