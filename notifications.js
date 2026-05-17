// ==============================================
// MMA BRIDGE — NOTIFICATION SYSTEM v2.1
// Clean YouTube-style bell. SVG icons. Push toggle.
// ==============================================
(function () {
  'use strict';

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

  // ── SVG icon set (no emojis) ──────────────────
  const SVG = {
    fight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    dayof: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    event: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    bell:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    star:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  };

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

    checkEvents(events) {
      window._cachedEvents = events;
      const now    = new Date();
      const seen   = getSeen();
      const arr    = getNotifs();
      const fav    = getFav();
      let changed  = false;

      const upcoming = events.filter(ev => {
        if (ev.status !== 'upcoming' || !ev.isoDate) return false;
        return new Date(ev.isoDate) >= now;
      });

      const knownIds  = getKnownEvents();
      const allIds    = new Set(events.map(e => e.id || slugify(e.name || '')).filter(Boolean));
      const isFirst   = knownIds.size === 0;
      upcoming.forEach(ev => {
        const evId = ev.id || slugify(ev.name || '');
        if (!evId) return;
        if (!knownIds.has(evId) && !isFirst) {
          const notifId = `new_event_${evId}`;
          if (!seen.has(notifId)) {
            const main = ev.mainCard?.[0];
            const headline = main ? `${main.a} vs ${main.b}` : '';
            arr.unshift({
              id: notifId, type: 'new_event', read: false,
              title: `New event announced: ${ev.name}`,
              body: [headline, ev.date, ev.location].filter(Boolean).join(' · '),
              eventId: evId, eventDate: ev.isoDate,
              href: `events.html#ev-${evId}`,
              timestamp: now.toISOString()
            });
            addSeen(notifId);
            changed = true;
          }
        }
      });
      allIds.forEach(id => knownIds.add(id));
      saveKnownEvents(knownIds);

      if (fav) {
        upcoming.forEach(ev => {
          const evId = ev.id || slugify(ev.name || '');
          if (!evId) return;
          let opponent = null;
          for (const sec of ['mainCard', 'prelims', 'earlyPrelims']) {
            for (const f of (ev[sec] || [])) {
              if (slugify(f.a) === fav.slug) { opponent = f.b; break; }
              if (slugify(f.b) === fav.slug) { opponent = f.a; break; }
            }
            if (opponent !== null) break;
          }
          if (opponent === null) return;
          const days = daysUntil(ev.isoDate);
          if (days === null || days < 0) return;
          const baseId = `${fav.slug}_${evId}_fight`;
          const dayId  = `${fav.slug}_${evId}_dayof`;
          if (days <= 1 && !seen.has(dayId)) {
            arr.unshift({
              id: dayId, type: 'fight_day', read: false,
              fighter: fav.name, opponent, eventId: evId,
              title: `${fav.name} fights ${days === 0 ? 'TODAY' : 'TOMORROW'}!`,
              body: `vs ${opponent} · ${ev.name}${ev.venue ? ' · ' + ev.venue : ''}`,
              href: `events.html#ev-${evId}`,
              eventDate: ev.isoDate, timestamp: now.toISOString()
            });
            addSeen(dayId); addSeen(baseId); changed = true;
          } else if (!seen.has(baseId)) {
            arr.unshift({
              id: baseId, type: 'fight_upcoming', read: false,
              fighter: fav.name, opponent, eventId: evId,
              title: `${fav.name} is fighting in ${days} day${days !== 1 ? 's' : ''}!`,
              body: `vs ${opponent} · ${ev.name}${ev.venue ? ' · ' + ev.venue : ''}`,
              href: `events.html#ev-${evId}`,
              eventDate: ev.isoDate, timestamp: now.toISOString()
            });
            addSeen(baseId); changed = true;
          }
        });
      }

      if (changed) saveNotifs(arr);
      this.updateBadge();
    },

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
        if (willOpen) { this._renderList(); this.markAllRead(); }
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
            <div class="notif-empty-icon">${SVG.bell}</div>
            <div>No notifications yet</div>
            <div class="notif-empty-hint">Star events or set a favorite fighter to get alerts</div>
          </div>`;
      } else {
        const iconMap = { fight_upcoming: SVG.fight, fight_day: SVG.dayof, new_event: SVG.event };
        listEl.innerHTML = notifs.slice(0, 12).map(n => {
          let title = esc(n.title);
          if (n.type === 'fight_upcoming' && n.eventDate) {
            const d = daysUntil(n.eventDate);
            if (d !== null && d >= 0) title = esc(`${n.fighter} is fighting in ${d} day${d !== 1 ? 's' : ''}!`);
          }
          const icon = iconMap[n.type] || SVG.bell;
          return `
            <a class="notif-item${n.read ? ' read' : ''}" href="${esc(n.href || '#')}" data-id="${esc(n.id)}">
              <span class="notif-item-icon">${icon}</span>
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

      if (footerEl) {
        const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
        if (pushSupported) {
          footerEl.innerHTML = `
            <button class="notif-push-row" id="notifPushToggle">
              <span class="notif-push-icon">${SVG.bell}</span>
              <span class="notif-push-text">${_getPushLabel()}</span>
              <span class="notif-push-status" id="notifPushStatus"></span>
            </button>`;
          _updatePushStatus();
          document.getElementById('notifPushToggle')?.addEventListener('click', async () => {
            if (!window.MMABridgePush) return;
            if (Notification.permission === 'denied') {
              alert('Push notifications are blocked. Enable them in your browser settings, then try again.');
              return;
            }
            await window.MMABridgePush.subscribeToPush();
            _updatePushStatus();
            const t = document.querySelector('#notifPushToggle .notif-push-text');
            if (t) t.textContent = _getPushLabel();
          });
        } else {
          footerEl.innerHTML = '';
        }
      }

      markBtn?.addEventListener('click', () => {
        this.markAllRead();
        listEl.querySelectorAll('.notif-item').forEach(el => el.classList.add('read'));
        listEl.querySelectorAll('.notif-unread-dot').forEach(el => el.remove());
      });
    },

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

  function _getPushLabel() {
    const perm = Notification.permission;
    if (perm === 'granted') return 'Push alerts on';
    if (perm === 'denied') return 'Push blocked in browser';
    return 'Enable push alerts';
  }

  function _updatePushStatus() {
    const el = document.getElementById('notifPushStatus');
    if (!el) return;
    const perm = Notification.permission;
    el.className = 'notif-push-status ' + (perm === 'granted' ? 'on' : perm === 'denied' ? 'blocked' : '');
    el.textContent = perm === 'granted' ? 'ON' : perm === 'denied' ? 'Blocked' : '';
  }

  function _renderModal() {
    const input     = document.getElementById('favModalInput');
    const saveBtn   = document.getElementById('favModalSave');
    const sugg      = document.getElementById('favModalSugg');
    const current   = document.getElementById('favModalCurrent');
    const removeBtn = document.getElementById('favModalRemove');
    if (!input) return;

    const fav = getFav();
    input.value = fav ? fav.name : '';

    if (current) {
      current.innerHTML = fav
        ? `<span class="fav-modal-current-label">Current: <strong>${esc(fav.name)}</strong></span>` : '';
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
          input.value = btn.dataset.name; sugg.innerHTML = ''; input.focus();
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

  function renderSidebarWidget() {
    const el = document.getElementById('favFighterWidget');
    if (!el) return;
    const fav = getFav();
    el.innerHTML = fav
      ? `<div class="fav-widget-set">
           <div class="fav-widget-label">${SVG.star} Your Fighter</div>
           <div class="fav-widget-name">${esc(fav.name)}</div>
           <button class="fav-widget-change" onclick="MMANotif.openModal()">Change →</button>
         </div>`
      : `<div class="fav-widget-empty">
           <div class="fav-widget-label">${SVG.star} Favorite Fighter</div>
           <div class="fav-widget-hint">Get notified about your fighter's upcoming bouts</div>
           <button class="fav-widget-set-btn" onclick="MMANotif.openModal()">Set Fighter →</button>
         </div>`;
  }

  window.MMANotif = MMANotif;

  document.addEventListener('DOMContentLoaded', () => {
    MMANotif.init();
    renderSidebarWidget();
    document.getElementById('favModalBg')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) MMANotif.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') MMANotif.closeModal();
    });
  });
})();
