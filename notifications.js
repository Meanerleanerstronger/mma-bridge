// ==============================================
// MMA BRIDGE — FAVORITE FIGHTER NOTIFICATION SYSTEM
// ==============================================
(function () {
  'use strict';

  const NOTIF_KEY  = 'mma_notifications';
  const FAV_KEY    = 'mma_fav_fighter';
  const SEEN_KEY   = 'mma_notif_seen_ids';
  const MAX_NOTIFS = 30;

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Storage ──────────────────────────────────
  function getNotifs()  { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; } }
  function saveNotifs(a){ try { localStorage.setItem(NOTIF_KEY, JSON.stringify(a.slice(0, MAX_NOTIFS))); } catch {} }
  function getSeenSet() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } }
  function addSeen(id)  {
    const s = getSeenSet(); s.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch {}
  }

  // ── Core API ─────────────────────────────────
  const MMANotif = {

    getFav() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); } catch { return null; } },

    setFav(name) {
      if (!name || !name.trim()) {
        localStorage.removeItem(FAV_KEY);
      } else {
        const n = name.trim();
        localStorage.setItem(FAV_KEY, JSON.stringify({ name: n, slug: slugify(n) }));
      }
      saveNotifs([]); // reset notifications for new fighter
      this.updateBadge();
    },

    getUnread() { return getNotifs().filter(n => !n.read).length; },

    markAllRead() {
      const a = getNotifs(); a.forEach(n => n.read = true); saveNotifs(a);
      this.updateBadge();
    },

    markRead(id) {
      const a = getNotifs(); const n = a.find(x => x.id === id);
      if (n) { n.read = true; saveNotifs(a); }
      this.updateBadge();
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

    // ── Scan events & generate notifications ──
    checkEvents(events) {
      const fav = this.getFav();
      window._cachedEvents = events;
      if (!fav) return;

      const now  = new Date();
      const seen = getSeenSet();
      const arr  = getNotifs();
      let changed = false;

      function findFighter(ev) {
        for (const sec of ['mainCard', 'prelims', 'earlyPrelims']) {
          const fights = ev[sec] || [];
          for (let i = 0; i < fights.length; i++) {
            const f = fights[i];
            if (slugify(f.a) === fav.slug || slugify(f.b) === fav.slug) {
              return {
                fight: f,
                opponent: slugify(f.a) === fav.slug ? f.b : f.a
              };
            }
          }
        }
        return null;
      }

      function push(notif) {
        if (seen.has(notif.id)) return;
        arr.unshift(notif);
        addSeen(notif.id);
        changed = true;
      }

      events.forEach(ev => {
        const hit = findFighter(ev);
        if (!hit) return;
        const { fight, opponent } = hit;
        const evId   = ev.id || slugify(ev.name || '');
        const evName = ev.name || 'an event';

        if (ev.status === 'upcoming' && ev.isoDate) {
          const t = ev.startTime || '22:00';
          const start = new Date(`${ev.isoDate}T${t}:00-04:00`);
          const hrs = (start - now) / 3600000;

          // Announced (any future fight = generate once)
          push({
            id: `${fav.slug}_${evId}_announced`, type: 'announced', read: false,
            title: `${fav.name} is booked!`,
            body: `${fav.name} vs ${opponent} — ${evName}`,
            href: `events.html?id=${encodeURIComponent(evId)}`,
            timestamp: now.toISOString()
          });

          // Week-of (≤168h, >24h from now)
          if (hrs > 24 && hrs <= 168) {
            push({
              id: `${fav.slug}_${evId}_week`, type: 'week', read: false,
              title: `${fav.name} fights this week!`,
              body: `${fav.name} vs ${opponent} at ${evName} · ${ev.date || ''}`,
              href: `events.html?id=${encodeURIComponent(evId)}`,
              timestamp: now.toISOString()
            });
          }

          // Day-of (≤24h, >0h)
          if (hrs > 0 && hrs <= 24) {
            push({
              id: `${fav.slug}_${evId}_day`, type: 'day', read: false,
              title: `${fav.name} fights TONIGHT!`,
              body: `${fav.name} vs ${opponent} — make your picks before it starts`,
              href: `picks.html?id=${encodeURIComponent(evId)}`,
              timestamp: now.toISOString()
            });
          }
        }

        if (ev.status === 'completed' && fight.winner) {
          const isWin = fight.winner === fight.a
            ? slugify(fight.a) === fav.slug
            : slugify(fight.b) === fav.slug;
          const methStr  = fight.method ? ` by ${fight.method}` : '';
          const roundStr = fight.round  ? ` R${fight.round}`    : '';
          push({
            id: `${fav.slug}_${evId}_result`, type: 'result', win: isWin, read: false,
            title: isWin
              ? `🥊 ${fav.name} WON at ${evName}!`
              : `${fav.name} lost at ${evName}`,
            body: isWin
              ? `${fav.name} def. ${opponent}${methStr}${roundStr} — check the full card`
              : `${fav.name} lost to ${opponent}${methStr}${roundStr} — check the full card`,
            href: `event-review.html?id=${encodeURIComponent(evId)}`,
            timestamp: now.toISOString()
          });
        }
      });

      if (changed) saveNotifs(arr);
      this.updateBadge();
    },

    // ── Mount bell into navbar ────────────────
    init() {
      const mount = document.getElementById('notifBellMount');
      if (!mount) return;

      mount.innerHTML = `
        <div class="notif-wrap" id="notifWrap">
          <button class="notif-bell-btn" id="notifBellBtn" aria-label="Notifications" title="Notifications">
            <svg class="notif-bell-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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
            <div class="notif-fav-zone" id="notifFavZone"></div>
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
          this._renderDropdown();
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

    _renderDropdown() {
      const listEl  = document.getElementById('notifList');
      const favEl   = document.getElementById('notifFavZone');
      const markBtn = document.getElementById('notifMarkAll');
      if (!listEl || !favEl) return;

      const notifs = getNotifs();
      const typeIcon = { announced: '📣', week: '📅', day: '⚡' };

      if (!notifs.length) {
        listEl.innerHTML = `
          <div class="notif-empty">
            <div class="notif-empty-icon">🔕</div>
            <div>No notifications yet</div>
            <div class="notif-empty-sub">Set your favorite fighter below</div>
          </div>`;
      } else {
        listEl.innerHTML = notifs.slice(0, 10).map(n => {
          const icon = n.type === 'result' ? (n.win ? '🏆' : '💔') : (typeIcon[n.type] || '🔔');
          return `
            <a class="notif-item${n.read ? ' read' : ''}" href="${esc(n.href || '#')}" data-id="${esc(n.id)}">
              <span class="notif-item-icon">${icon}</span>
              <div class="notif-item-body">
                <div class="notif-item-title">${esc(n.title)}</div>
                <div class="notif-item-sub">${esc(n.body)}</div>
              </div>
              ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
            </a>`;
        }).join('');
        listEl.querySelectorAll('.notif-item[data-id]').forEach(el => {
          el.addEventListener('click', () => this.markRead(el.dataset.id));
        });
      }

      markBtn?.addEventListener('click', () => {
        this.markAllRead();
        listEl.querySelectorAll('.notif-item').forEach(el => el.classList.add('read'));
        listEl.querySelectorAll('.notif-unread-dot').forEach(el => el.remove());
      });

      this._renderFavZone(favEl);
    },

    _renderFavZone(favEl) {
      const fav = this.getFav();
      if (fav) {
        favEl.innerHTML = `
          <div class="notif-fav-head">⭐ Favorite Fighter</div>
          <div class="notif-fav-row">
            <span class="notif-fav-name">${esc(fav.name)}</span>
            <button class="notif-fav-change-btn" id="notifChangeFav">Change</button>
          </div>`;
        document.getElementById('notifChangeFav')?.addEventListener('click', () => {
          this.setFav(null);
          this._renderFavZone(favEl);
        });
      } else {
        favEl.innerHTML = `
          <div class="notif-fav-head">⭐ Favorite Fighter</div>
          <div class="notif-fav-desc">Get notified when they're announced, fight week, day-of, and after results</div>
          <div class="notif-fav-input-row">
            <input class="notif-fav-input" id="notifFavInput" placeholder="Fighter name…" autocomplete="off" spellcheck="false">
            <button class="notif-fav-save-btn" id="notifFavSave">Save</button>
          </div>
          <div class="notif-fav-sugg" id="notifFavSugg"></div>`;
        this._wireInput(favEl);
      }
    },

    _wireInput(favEl) {
      const input   = document.getElementById('notifFavInput');
      const saveBtn = document.getElementById('notifFavSave');
      const sugg    = document.getElementById('notifFavSugg');
      if (!input || !saveBtn) return;

      let fighters = [];
      fetch('data/fighters.json').then(r => r.ok ? r.json() : []).then(d => { fighters = d; }).catch(() => {});

      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q || q.length < 2) { sugg.innerHTML = ''; return; }
        const matches = fighters.filter(f => f.name?.toLowerCase().includes(q)).slice(0, 6);
        sugg.innerHTML = matches.map(f =>
          `<button class="notif-sugg-item" data-name="${esc(f.name)}">${esc(f.name)}</button>`
        ).join('');
        sugg.querySelectorAll('.notif-sugg-item').forEach(btn => {
          btn.addEventListener('click', () => { input.value = btn.dataset.name; sugg.innerHTML = ''; input.focus(); });
        });
      });

      const save = () => {
        const name = input.value.trim();
        if (!name) return;
        this.setFav(name);
        this._renderFavZone(favEl);
        const listEl = document.getElementById('notifList');
        if (listEl) listEl.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">✅</div><div>Saved! Checking events…</div></div>`;
        if (window._cachedEvents) {
          this.checkEvents(window._cachedEvents);
          setTimeout(() => this._renderDropdown(), 400);
        }
      };

      saveBtn.addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
      setTimeout(() => input.focus(), 50);
    }
  };

  window.MMANotif = MMANotif;
  document.addEventListener('DOMContentLoaded', () => MMANotif.init());
})();
