// ==============================================
// MMA BRIDGE — NOTIFICATION SYSTEM v2
// Clean YouTube-style bell. Only real future events.
// ==============================================
(function () {
  'use strict';

  // Version bump clears stale data from old implementation
  const V            = '2';
  const NOTIF_KEY    = 'mma_notifs_v' + V;
  const SEEN_KEY     = 'mma_seen_v' + V;
  const FAV_KEY      = 'mma_fav_fighter';
  const KNOWN_EV_KEY = 'mma_known_events';
  const MAX_NOTIFS   = 25;

  // Clear stale keys from v1
  ['mma_notifications','mma_notif_seen_ids','mma_notif_seen_v1','mma_notifs_v1'].forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function daysUntil(isoDate) {
    if (!isoDate) return null;
    const diff = new Date(isoDate) - new Date();
    return Math.ceil(diff / 86400000);
  }

  // ── Storage ──────────────────────────────────
  function getNotifs()  { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; } }
  function saveNotifs(a){ try { localStorage.setItem(NOTIF_KEY, JSON.stringify(a.slice(0, MAX_NOTIFS))); } catch {} }
  function getSeen()    { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } }
  function addSeen(id)  {
    const s = getSeen(); s.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500))); } catch {}
  }
  function getKnownEvents() { try { return new Set(JSON.parse(localStorage.getItem(KNOWN_EV_KEY) || '[]')); } catch { return new Set(); } }
  function saveKnownEvents(s){ try { localStorage.setItem(KNOWN_EV_KEY, JSON.stringify([...s])); } catch {} }

  // ── Fav fighter ───────────────────────────────
  function getFav()  { try { return JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); } catch { return null; } }
  function setFav(name) {
    if (!name || !name.trim()) {
      localStorage.removeItem(FAV_KEY);
    } else {
      const n = name.trim();
      localStorage.setItem(FAV_KEY, JSON.stringify({ name: n, slug: slugify(n) }));
    }
    // Clear old fight notifications so we re-scan for new fighter
    const notifs = getNotifs().filter(n => n.type === 'new_event');
    saveNotifs(notifs);
    const seen = getSeen();
    [...seen].filter(id => id.includes('_fight')).forEach(id => seen.delete(id));
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {}
  }

  // ── Public API ────────────────────────────────
  const MMANotif = {
    getFav,
    setFav(name) { setFav(name); this.updateBadge(); renderSidebarWidget(); },

    getUnread() { return getNotifs().filter(n => !n.read).length; },

    markAllRead() {
      const a = getNotifs(); a.forEach(n => n.read = true); saveNotifs(a);
      this.updateBadge();
    },

    markRead(id) {
      const a = getNotifs(); const n = a.find(x => x.id === id);
      if (n) { n.read = true; saveNotifs(a); } this.updateBadge();
    },

    updateBadge() {
      const badge = document.getElementById('notifBadge');
      const btn   = document.getElementById('notifBellBtn');
      if (!badge || !btn) return;
      const count = this.getUnread();
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
      btn.classList.toggle('has-notifs', count > 0);
    },

    // ── Scan events — only upcoming, only real ──
    checkEvents(events) {
      window._cachedEvents = events;
      const now    = new Date();
      const seen   = getSeen();
      const arr    = getNotifs();
      const fav    = getFav();
      let changed  = false;

      // Only truly future events (upcoming status + date not passed)
      const upcoming = events.filter(ev => {
        if (ev.status !== 'upcoming' || !ev.isoDate) return false;
        return new Date(ev.isoDate) >= now;
      });

      // ── 1. New event announcements (everyone) ──
      const knownIds  = getKnownEvents();
      const allIds    = new Set(events.map(e => e.id || slugify(e.name || '')).filter(Boolean));
      const isFirst   = knownIds.size === 0; // first ever load → don't spam
      upcoming.forEach(ev => {
        const evId = ev.id || slugify(ev.name || '');
        if (!evId) return;
        if (!knownIds.has(evId) && !isFirst) {
          // Newly added event
          const notifId = `new_event_${evId}`;
          if (!seen.has(notifId)) {
            const main = ev.mainCard?.[0];
            const headline = main ? `${main.a} vs ${main.b}` : '';
            arr.unshift({
              id: notifId, type: 'new_event', read: false,
              title: `New event announced: ${ev.name}`,
              body: [headline, ev.date, ev.location].filter(Boolean).join(' · '),
              eventId: evId,
              eventDate: ev.isoDate,
              href: `events.html#ev-${evId}`,
              timestamp: now.toISOString()
            });
            addSeen(notifId);
            changed = true;
          }
        }
      });
      // Update known events set
      allIds.forEach(id => knownIds.add(id));
      saveKnownEvents(knownIds);

      // ── 2. Fav fighter upcoming fight ──────────
      if (fav) {
        upcoming.forEach(ev => {
          const evId = ev.id || slugify(ev.name || '');
          if (!evId) return;

          // Find fighter in any section
          let opponent = null;
          for (const sec of ['mainCard', 'prelims', 'earlyPrelims']) {
            for (const f of (ev[sec] || [])) {
              if (slugify(f.a) === fav.slug) { opponent = f.b; break; }
              if (slugify(f.b) === fav.slug) { opponent = f.a; break; }
            }
            if (opponent !== null) break;
          }
          if (opponent === null) return; // fav fighter not on this card

          const days = daysUntil(ev.isoDate);
          if (days === null || days < 0) return;

          // One notification per fighter+event, with dynamic content stored as metadata
          // We use tiered IDs so we can generate a "day-of" update on top of the initial one
          const baseId = `${fav.slug}_${evId}_fight`;
          const dayId  = `${fav.slug}_${evId}_dayof`;

          // Day-of notification (≤1 day, separate high-priority notification)
          if (days <= 1 && !seen.has(dayId)) {
            arr.unshift({
              id: dayId, type: 'fight_day', read: false,
              fighter: fav.name, opponent, eventId: evId,
              title: `${fav.name} fights ${days === 0 ? 'TODAY' : 'TOMORROW'}!`,
              body: `vs ${opponent} · ${ev.name}${ev.venue ? ' · ' + ev.venue : ''}`,
              href: `events.html#ev-${evId}`,
              eventDate: ev.isoDate,
              timestamp: now.toISOString()
            });
            addSeen(dayId);
            // Also mark base as seen so we don't double up
            addSeen(baseId);
            changed = true;
          } else if (!seen.has(baseId)) {
            const venue = ev.venue || ev.location || '';
            arr.unshift({
              id: baseId, type: 'fight_upcoming', read: false,
              fighter: fav.name, opponent, eventId: evId,
              title: `${fav.name} is fighting in ${days} day${days !== 1 ? 's' : ''}!`,
              body: `vs ${opponent} · ${ev.name}${venue ? ' · ' + venue : ''}`,
              href: `events.html#ev-${evId}`,
              eventDate: ev.isoDate,
              timestamp: now.toISOString()
            });
            addSeen(baseId);
            changed = true;
          }
        });
      }

      if (changed) saveNotifs(arr);
      this.updateBadge();
    },

    // ── Bell mount ────────────────────────────
    init() {
      const mount = document.getElementById('notifBellMount');
      if (!mount) return;

      mount.innerHTML = `
        <div class="notif-wrap" id="notifWrap">
          <button class="notif-bell-btn" id="notifBellBtn" aria-label="Notifications">
            <svg class="notif-bell-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="notif-badge" id="notifBadge" style="display:none">0</span>
          </button>
          <div class="notif-dropdown" id="notifDropdown" aria-hidden="true">
            <div class="notif-drop-head">
              <span class="notif-drop-title">Notifications</span>
              <button class="notif-mark-all-btn" id="notifMarkAll">Mark all read</button>
            </div>
            <div class="notif-list" id="notifList"></div>
            <div class="notif-drop-footer" id="notifDropFooter"></div>
          </div>
        </div>`;

      const bellBtn  = document.getElementById('notifBellBtn');
      const dropdown = document.getElementById('notifDropdown');

      bellBtn.addEventListener('click', e => {
        e.stopPropagation();
        const willOpen = !dropdown.classList.contains('open');
        dropdown.classList.toggle('open', willOpen);
        dropdown.setAttribute('aria-hidden', String(!willOpen));
        if (willOpen) {
          this._renderList();
          this.markAllRead();
        }
      });
      document.addEventListener('click', () => {
        dropdown.classList.remove('open');
        dropdown.setAttribute('aria-hidden', 'true');
      });
      dropdown.addEventListener('click', e => e.stopPropagation());

      this.updateBadge();
    },

    _renderList() {
      const listEl   = document.getElementById('notifList');
      const footerEl = document.getElementById('notifDropFooter');
      const markBtn  = document.getElementById('notifMarkAll');
      if (!listEl) return;

      const notifs = getNotifs();
      const fav    = getFav();

      if (!notifs.length) {
        listEl.innerHTML = `
          <div class="notif-empty">
            <div class="notif-empty-icon">🔔</div>
            <div>No notifications yet</div>
          </div>`;
      } else {
        const icon = { fight_upcoming: '🥊', fight_day: '⚡', new_event: '📣' };
        listEl.innerHTML = notifs.slice(0, 12).map(n => {
          // Compute live days-until for fight notifications
          let title = esc(n.title);
          if ((n.type === 'fight_upcoming') && n.eventDate) {
            const d = daysUntil(n.eventDate);
            if (d !== null && d >= 0) {
              title = esc(`${n.fighter} is fighting in ${d} day${d !== 1 ? 's' : ''}!`);
            }
          }
          return `
            <a class="notif-item${n.read ? ' read' : ''}" href="${esc(n.href || '#')}" data-id="${esc(n.id)}">
              <span class="notif-item-icon">${icon[n.type] || '🔔'}</span>
              <div class="notif-item-body">
                <div class="notif-item-title">${title}</div>
                <div class="notif-item-sub">${esc(n.body)}</div>
              </div>
              ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
            </a>`;
        }).join('');
        listEl.querySelectorAll('.notif-item[data-id]').forEach(el => {
          el.addEventListener('click', () => this.markRead(el.dataset.id));
        });
      }

      // Footer: fav fighter chip (not a search box, just a link to open the modal)
      if (footerEl) {
        footerEl.innerHTML = fav
          ? `<button class="notif-fav-chip" id="notifFavChip">⭐ ${esc(fav.name)} <span class="notif-fav-change">change</span></button>`
          : `<button class="notif-fav-chip notif-fav-chip-empty" id="notifFavChip">⭐ Set favorite fighter</button>`;
        document.getElementById('notifFavChip')?.addEventListener('click', () => {
          dropdown.classList.remove('open');
          this.openModal();
        });
      }

      markBtn?.addEventListener('click', () => {
        this.markAllRead();
        listEl.querySelectorAll('.notif-item').forEach(el => el.classList.add('read'));
        listEl.querySelectorAll('.notif-unread-dot').forEach(el => el.remove());
      });
    },

    // ── Fav Fighter Modal ─────────────────────
    openModal() {
      const bg = document.getElementById('favModalBg');
      if (!bg) return;
      bg.style.display = 'flex';
      setTimeout(() => bg.classList.add('open'), 10);
      _renderModal();
      document.getElementById('favModalInput')?.focus();
    },

    closeModal() {
      const bg = document.getElementById('favModalBg');
      if (!bg) return;
      bg.classList.remove('open');
      setTimeout(() => { bg.style.display = 'none'; }, 250);
    }
  };

  // ── Modal renderer ────────────────────────────
  function _renderModal() {
    const input   = document.getElementById('favModalInput');
    const saveBtn = document.getElementById('favModalSave');
    const sugg    = document.getElementById('favModalSugg');
    const current = document.getElementById('favModalCurrent');
    const removeBtn = document.getElementById('favModalRemove');
    if (!input) return;

    const fav = getFav();
    input.value = fav ? fav.name : '';

    if (current) {
      current.innerHTML = fav
        ? `<span class="fav-modal-current-label">Current: <strong>${esc(fav.name)}</strong></span>`
        : '';
    }
    if (removeBtn) {
      removeBtn.style.display = fav ? 'inline-flex' : 'none';
      removeBtn.onclick = () => {
        MMANotif.setFav(null);
        input.value = '';
        if (current) current.innerHTML = '';
        removeBtn.style.display = 'none';
        sugg.innerHTML = '';
      };
    }

    let fighters = [];
    fetch('data/fighters.json').then(r => r.ok ? r.json() : []).then(d => { fighters = d; }).catch(() => {});

    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      if (!q || q.length < 2) { sugg.innerHTML = ''; return; }
      const hits = fighters.filter(f => f.name?.toLowerCase().includes(q)).slice(0, 6);
      sugg.innerHTML = hits.map(f =>
        `<button class="fav-sugg-item" data-name="${esc(f.name)}">${esc(f.name)}</button>`
      ).join('');
      sugg.querySelectorAll('.fav-sugg-item').forEach(btn => {
        btn.addEventListener('click', () => {
          input.value = btn.dataset.name;
          sugg.innerHTML = '';
          input.focus();
        });
      });
    };

    const save = () => {
      const name = input.value.trim();
      if (!name) return;
      MMANotif.setFav(name);
      if (window._cachedEvents) MMANotif.checkEvents(window._cachedEvents);
      MMANotif.closeModal();
      renderSidebarWidget();
    };

    if (saveBtn) { saveBtn.onclick = null; saveBtn.addEventListener('click', save); }
    input.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') MMANotif.closeModal(); };
  }

  // ── Sidebar widget ────────────────────────────
  function renderSidebarWidget() {
    const el = document.getElementById('favFighterWidget');
    if (!el) return;
    const fav = getFav();
    el.innerHTML = fav
      ? `<div class="fav-widget-set">
           <div class="fav-widget-label">⭐ Your Fighter</div>
           <div class="fav-widget-name">${esc(fav.name)}</div>
           <button class="fav-widget-change" onclick="MMANotif.openModal()">Change →</button>
         </div>`
      : `<div class="fav-widget-empty">
           <div class="fav-widget-label">⭐ Favorite Fighter</div>
           <div class="fav-widget-hint">Get notified about your fighter's upcoming bouts</div>
           <button class="fav-widget-set-btn" onclick="MMANotif.openModal()">Set Fighter →</button>
         </div>`;
  }

  window.MMANotif = MMANotif;

  document.addEventListener('DOMContentLoaded', () => {
    MMANotif.init();
    renderSidebarWidget();

    // Modal close on backdrop click
    document.getElementById('favModalBg')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) MMANotif.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') MMANotif.closeModal();
    });
  });
})();
