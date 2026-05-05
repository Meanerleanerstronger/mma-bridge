// ==============================================
// MMA BRIDGE — EVENTS PAGE
// All collapsed by default. Click to expand.
// FOTN + Hype meter on upcoming only.
// ==============================================

import CONFIG, { debugLog } from './config.js';
import API from './api.js';
import { showLoading, showError } from './loading.js';

document.addEventListener('DOMContentLoaded', async () => {
  const wrap = document.getElementById('events-list');

  // ── Drawer ────────────────────────────────
  const drawer      = document.getElementById('fightDrawer');
  const drawerClose = document.getElementById('drawerClose');
  const drawerX     = document.getElementById('drawerX');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerContent = document.getElementById('drawerContent');

  function openDrawer(title, html) {
    drawerTitle.textContent = title;
    drawerContent.innerHTML = html;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }
  drawerClose?.addEventListener('click', closeDrawer);
  drawerX?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  // ── Helpers ───────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function slugify(s) {
    return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/['']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function isUpcoming(ev) {
    const iso = ev.isoDate || '';
    if (!iso) return true;
    return new Date(iso) >= new Date();
  }
  function getApiBase() {
    return (CONFIG?.API?.BASE_URL) || 'https://mmabridge-backend.onrender.com/api';
  }

  let fightersDB = {};

  // ── Fighter form ──────────────────────────
  function formCol(name) {
    const f = fightersDB[slugify(name)];
    const fights = f?.last5?.slice(0,5) || [];
    const iconM = m => {
      const u = (m||'').toUpperCase();
      if (u.includes('SUB')) return '<span class="form-m sub">Sub</span>';
      if (u.includes('KO') || u.includes('TKO')) return '<span class="form-m ko">KO</span>';
      if (u.includes('UD')||u.includes('SD')||u.includes('MD')) return '<span class="form-m dec">Dec</span>';
      return '<span class="form-m">—</span>';
    };
    return `
      <div class="form-col">
        <div class="form-head">
          <div class="form-name">${esc(f?.name || name)}</div>
          <div class="form-record">${esc(f?.record || '—')}</div>
        </div>
        <div class="form-list">
          ${fights.length
            ? fights.map(x=>`
                <div class="form-row">
                  <span class="form-badge ${x.result==='W'?'win':'loss'}">${esc(x.result)}</span>
                  <span class="form-icon">${iconM(x.method)}</span>
                  <span class="form-opp">vs ${esc(x.opponent)}</span>
                  <span class="form-date">${esc(x.date||'')}</span>
                </div>`).join('')
            : '<div class="hint">No recent fights listed</div>'
          }
        </div>
      </div>`;
  }

  // ── FOTN button (upcoming only) ───────────
  function fotnBtn(f, eventMeta) {
    return `<button
      class="fotn-btn"
      type="button"
      data-fotn="${esc(f.a+' vs '+f.b)}"
      data-event-id="${esc(eventMeta.eventId)}"
      data-event-name="${esc(eventMeta.name)}"
      onclick="event.stopPropagation();window.lockFotn(this)"
      title="Pick as Fight of the Night"
    >FOTN</button>`;
  }

  // ── Single fight row ──────────────────────
  function fightRow(f, eventMeta, upcoming) {
    const isMain   = f.slot === 'main';
    const isCoMain = f.slot === 'comain';

    const slotBadge = isMain
      ? '<span class="slot-badge main-badge">MAIN EVENT</span>'
      : isCoMain
        ? '<span class="slot-badge comain-badge">CO-MAIN</span>'
        : '';

    const icons = [
      f.titleFight ? '<span class="fight-ico fight-ico-title" title="Title fight">Title</span>' : '',
      f.ranked     ? '<span class="fight-ico fight-ico-ranked" title="Ranked">Ranked</span>'   : '',
    ].join('');

    const payload = esc(JSON.stringify({
      ...f,
      eventName: eventMeta.name,
      eventDate: eventMeta.date,
      eventLocation: eventMeta.location,
      eventVenue: eventMeta.venue
    }));

    return `
      <div class="fr-wrap ${isMain?'fr-main':isCoMain?'fr-comain':''}">
        <button class="fight-row" type="button" data-fight="${payload}">
          <div class="fr-left">
            ${slotBadge}
            <div class="fr-names">
              <span class="fr-a">${esc(f.a)}</span>
              <span class="fr-vs">vs</span>
              <span class="fr-b">${esc(f.b)}</span>
            </div>
            <div class="fr-pills">
              ${f.rounds ? `<span class="pill pill-dim">${esc(f.rounds)}</span>` : ''}
            </div>
          </div>
          <div class="fr-right">
            ${icons}
          </div>
        </button>
        ${upcoming ? fotnBtn(f, eventMeta) : ''}
      </div>`;
  }

  // ── Section dropdown ──────────────────────
  function section(label, fights, eventMeta, upcoming, open = false) {
    const count = fights?.length || 0;
    return `
      <details class="drop" ${open ? 'open' : ''}>
        <summary class="drop-sum">
          <span class="drop-label">${esc(label)}</span>
          <span class="drop-right">
            <span class="count">${count}</span>
            <span class="chev">▾</span>
          </span>
        </summary>
        <div class="drop-body">
          ${count
            ? fights.map(f => fightRow(f, eventMeta, upcoming)).join('')
            : '<div class="empty">Nothing listed yet.</div>'
          }
        </div>
      </details>`;
  }

  // ── Hype meter (upcoming only) ────────────
  function hypeMeter(ev) {
    const id   = esc(ev.id || slugify(ev.name||''));
    const name = esc(ev.name||'');
    return `
      <div class="hype-wrap" data-event-id="${id}" data-event-name="${name}">
        <div class="hype-header">
          <span class="hype-title">Hype Meter</span>
          <span class="hype-avg" id="havg-${id}"></span>
        </div>
        <div class="hype-desc">Rate how hyped you are for this event</div>
        <div class="hype-stars">
          ${[1,2,3,4,5].map(n=>`
            <button class="hype-star" data-val="${n}" type="button">★</button>
          `).join('')}
        </div>
        <div class="hype-lbl" id="hlbl-${id}">Tap a star to rate</div>
        <div class="hype-fotn-hint">Hover over any fight above and click to lock as your predicted Fight of the Night</div>
      </div>`;
  }

  // ── Full event accordion ──────────────────
  function eventCard(ev, idx) {
    const id       = ev.id || slugify(ev.name||'') || String(idx);
    const upcoming = isUpcoming(ev);
    const isPPV    = ev.type === 'PPV';
    const meta = { name: ev.name, date: ev.date, location: ev.location, venue: ev.venue, eventId: id };

    // Countdown
    let countdownHtml = '';
    if (upcoming && ev.isoDate) {
      const days = Math.ceil((new Date(ev.isoDate) - new Date()) / 86400000);
      let label = days <= 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `IN ${days} DAYS`;
      let cls   = days <= 7 ? 'soon' : 'upcoming';
      countdownHtml = `<span class="ev-countdown ${cls}">${label}</span>`;
    }

    // Calendar button (upcoming only)
    const calBtnHtml = upcoming && ev.isoDate
      ? `<div class="ev-cal-wrap" data-ev-id="${esc(id)}">
           <button class="ev-cal-btn" data-name="${esc(ev.name||'')}" data-iso="${esc(ev.isoDate)}" data-location="${esc((ev.venue ? ev.venue + ', ' : '') + (ev.location||''))}" title="Add to calendar">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
             Add to Calendar
           </button>
           <div class="ev-cal-drop" id="caldrop-${esc(id)}" style="display:none">
             <a class="ev-cal-opt" data-action="google" href="#">Google Calendar</a>
             <a class="ev-cal-opt" data-action="ics" href="#">Apple / iCal (.ics)</a>
           </div>
         </div>`
      : '';

    // Thumbnail
    const thumbHtml = ev.poster
      ? `<img class="ev-thumb" src="${esc(ev.poster)}" alt="" onerror="this.style.display='none'">`
      : `<div class="ev-thumb"></div>`;

    return `
      <details class="event-card ${isPPV ? 'is-ppv' : ''}" id="ev-${esc(id)}">
        <summary class="ev-summary">
          ${thumbHtml}
          <div class="ev-sum-left">
            <div class="ev-name-row">
              <span class="ev-name">${esc(ev.name||'')}</span>
              ${ev.type ? `<span class="ev-type-tag">${esc(ev.type)}</span>` : ''}
            </div>
            <div class="ev-meta">
              ${ev.date     ? `<span>${esc(ev.date)}</span>` : ''}
              ${ev.location ? `<span class="ev-dot">•</span><span>${esc(ev.location)}</span>` : ''}
              ${ev.venue    ? `<span class="ev-dot">•</span><span>${esc(ev.venue)}</span>` : ''}
            </div>
          </div>
          <div class="ev-sum-right">
            ${countdownHtml}
            ${upcoming ? `<span class="ev-hype-badge" id="ehype-${esc(id)}"></span>` : ''}
            <span class="view-chip">VIEW</span>
            <span class="ev-chev">▾</span>
          </div>
        </summary>

        <div class="ev-body">
          <div class="ev-body-header">
            <div class="ev-body-header-top">
              <div class="ev-body-title">${esc(ev.name||'')}</div>
              <div class="ev-header-right">
                <div class="ev-body-meta">${ev.date||''} &nbsp;·&nbsp; ${ev.location||''} &nbsp;·&nbsp; ${ev.venue||''}</div>
                <div class="ev-header-actions">
                  ${upcoming ? `<a class="ev-picks-btn" href="picks.html?id=${esc(id)}">Pick Fights →</a>` : ''}
                  ${calBtnHtml}
                </div>
              </div>
            </div>
          </div>
          <div class="ev-content">
            ${upcoming ? hypeMeter(ev) : ''}
            ${section('Main Card',     ev.mainCard,     meta, upcoming, true)}
            ${section('Prelims',       ev.prelims,      meta, upcoming, false)}
            ${section('Early Prelims', ev.earlyPrelims, meta, upcoming, false)}
          </div>
        </div>
      </details>`;
  }

  // ── Bind fight row clicks → drawer ────────
  function bindFightClicks() {
    wrap.querySelectorAll('[data-fight]').forEach(btn => {
      btn.addEventListener('click', () => {
        let f;
        try { f = JSON.parse(btn.dataset.fight); } catch { return; }

        const drawerHtml = `
          <div class="drawer-hero">
            <div class="drawer-fightline">
              <div class="drawer-a">${esc(f.a)}</div>
              <div class="drawer-vs">vs</div>
              <div class="drawer-b">${esc(f.b)}</div>
            </div>
            <div class="drawer-pills">
              ${f.weight    ? `<span class="pill">${esc(f.weight)}</span>`    : ''}
              ${f.rounds    ? `<span class="pill pill-dim">${esc(f.rounds)}</span>` : ''}
              ${f.titleFight? `<span class="pill">🏆 Title Fight</span>`      : ''}
              ${f.ranked    ? `<span class="pill">⭐ Ranked</span>`           : ''}
            </div>
            <div class="drawer-sub">
              <div class="drawer-event">${esc(f.eventName||'')}</div>
              <div class="drawer-meta">
                ${esc(f.eventDate||'TBA')}
                ${f.eventLocation ? ` · ${esc(f.eventLocation)}` : ''}
              </div>
            </div>
          </div>

          <div class="drawer-grid">
            <div class="drawer-card" id="drawerFighterStats">
              <div class="drawer-card-title">Fighter Info</div>
              <div class="form-split">${formCol(f.a)}${formCol(f.b)}</div>
            </div>

            <div class="drawer-card" id="drawerNews">
              <div class="drawer-card-title">📰 Related News</div>
              <div id="drawerNewsContent" style="color:rgba(255,255,255,0.3);font-size:0.8rem;font-family:'Inter',sans-serif">
                Loading news…
              </div>
            </div>
          </div>`;

        openDrawer(`${f.a} vs ${f.b}`, drawerHtml);

        // Fetch related news in background
        const query = `${f.a} ${f.b} UFC`;
        const base = getApiBase();
        fetch(`${base}/news/search?q=${encodeURIComponent(query)}`)
          .then(r => r.ok ? r.json() : [])
          .then(articles => {
            const el = document.getElementById('drawerNewsContent');
            if (!el) return;
            if (!articles.length) {
              el.textContent = 'No recent news found.';
              return;
            }
            el.innerHTML = articles.map(a => `
              <a href="${esc(a.url)}" target="_blank" rel="noopener" class="drawer-news-item">
                <div class="drawer-news-source">${esc(a.source)}</div>
                <div class="drawer-news-title">${esc(a.title)}</div>
              </a>`).join('');
          })
          .catch(() => {
            const el = document.getElementById('drawerNewsContent');
            if (el) el.textContent = '';
          });
      });
    });
  }

  // ── Hype meter logic ──────────────────────
  const HYPE_LABELS = ['','Meh','Mild','Solid','Hyped','Must Watch'];

  function bindHypeMeters() {
    const base = getApiBase();
    wrap.querySelectorAll('.hype-wrap').forEach(meter => {
      const eventId   = meter.dataset.eventId;
      const eventName = meter.dataset.eventName;
      const stars     = meter.querySelectorAll('.hype-star');
      const avgEl     = document.getElementById(`havg-${eventId}`);
      const lblEl     = document.getElementById(`hlbl-${eventId}`);
      let selected = 0;

      const summaryBadge = document.getElementById(`ehype-${eventId}`);
      fetch(`${base}/ratings/${encodeURIComponent(eventId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.avg_hype) {
            avgEl.textContent = `★ ${d.avg_hype} · ${d.total_ratings} vote${d.total_ratings!==1?'s':''}`;
            if (summaryBadge) summaryBadge.textContent = `${d.avg_hype} hype`;
          } else {
            avgEl.textContent = 'Be first to rate!';
            if (summaryBadge) summaryBadge.textContent = '';
          }
        }).catch(()=>{});

      function light(val) {
        stars.forEach(s => s.classList.toggle('hype-star-lit', +s.dataset.val <= val));
      }
      stars.forEach(s => {
        s.addEventListener('mouseenter', () => light(+s.dataset.val));
        s.addEventListener('mouseleave', () => light(selected));
        s.addEventListener('click', async () => {
          const val = +s.dataset.val;
          if (selected === val) return;
          selected = val;
          light(selected);
          lblEl.textContent = HYPE_LABELS[selected];
          try {
            await fetch(`${base}/ratings`, {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ event_id:eventId, event_name:eventName, hype_rating:selected, fotn_prediction:null })
            });
            const r2 = await fetch(`${base}/ratings/${encodeURIComponent(eventId)}`);
            if (r2.ok) {
              const d2 = await r2.json();
              if (d2?.avg_hype) avgEl.textContent = `★ ${d2.avg_hype} · ${d2.total_ratings} vote${d2.total_ratings!==1?'s':''}`;
            }
          } catch(e) { debugLog('Hype submit failed', e); }
        });
      });
    });
  }

  // ── FOTN lock ─────────────────────────────
  window.lockFotn = async function(btn) {
    const fight     = btn.dataset.fotn;
    const eventId   = btn.dataset.eventId;
    const eventName = btn.dataset.eventName;
    if (!fight || !eventId) return;

    const already = btn.classList.contains('fotn-locked');
    wrap.querySelectorAll(`.fotn-btn[data-event-id="${eventId}"]`).forEach(b => {
      b.classList.remove('fotn-locked');
      b.innerHTML = '🔒 FOTN?';
    });
    if (already) return;

    btn.classList.add('fotn-locked');
    btn.innerHTML = '✅ FOTN';

    // Toast
    let toast = document.getElementById('fotn-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fotn-toast';
      toast.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
        background:rgba(0,255,255,0.1);border:1px solid rgba(0,255,255,0.4);
        color:cyan;font-family:'Montserrat',sans-serif;font-weight:700;font-size:0.78rem;
        letter-spacing:0.06em;padding:10px 22px;border-radius:6px;z-index:9999;
        backdrop-filter:blur(8px);opacity:0;transition:opacity 0.2s;pointer-events:none;`;
      document.body.appendChild(toast);
    }
    toast.textContent = `🔒 FOTN locked: ${fight}`;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);

    try {
      const base = getApiBase();
      await fetch(`${base}/ratings`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ event_id:eventId, event_name:eventName, hype_rating:3, fotn_prediction:fight })
      });
    } catch(e) { debugLog('FOTN save failed', e); }
  };

  // ── Calendar button logic ─────────────────
  function bindCalendarButtons() {
    wrap.querySelectorAll('.ev-cal-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wrap2 = btn.closest('.ev-cal-wrap');
        const dropId = 'caldrop-' + wrap2.dataset.evId;
        const drop   = document.getElementById(dropId);
        if (!drop) return;
        const isOpen = drop.style.display !== 'none';
        document.querySelectorAll('.ev-cal-drop').forEach(d => { d.style.display = 'none'; });
        drop.style.display = isOpen ? 'none' : 'block';
      });
    });

    wrap.querySelectorAll('.ev-cal-opt').forEach(opt => {
      opt.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const btn  = opt.closest('.ev-cal-wrap').querySelector('.ev-cal-btn');
        const name = btn.dataset.name;
        const iso  = btn.dataset.iso;
        const loc  = btn.dataset.location;
        const action = opt.dataset.action;

        // Event runs at 10pm ET on the date — approximate start
        const dateStr = iso.replace(/-/g, '');
        const startDT = dateStr + 'T030000Z'; // 10pm ET = 3am UTC next day approx
        const endDT   = dateStr + 'T060000Z';

        if (action === 'google') {
          const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
            + `&text=${encodeURIComponent(name)}`
            + `&dates=${startDT}/${endDT}`
            + `&details=${encodeURIComponent('Watch live on ESPN+ / PPV\nmmabridge.com')}`
            + `&location=${encodeURIComponent(loc)}`;
          window.open(url, '_blank');
        } else {
          const ics = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MMA Bridge//EN',
            'BEGIN:VEVENT',
            `DTSTART:${startDT}`,
            `DTEND:${endDT}`,
            `SUMMARY:${name}`,
            `LOCATION:${loc}`,
            `DESCRIPTION:Watch live on ESPN+ / PPV\\nmmabridge.com`,
            `STATUS:CONFIRMED`,
            'END:VEVENT', 'END:VCALENDAR'
          ].join('\r\n');
          const blob = new Blob([ics], { type: 'text/calendar' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name.replace(/[^a-z0-9]+/gi, '-') + '.ics';
          a.click();
          URL.revokeObjectURL(a.href);
        }

        opt.closest('.ev-cal-drop').style.display = 'none';
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.ev-cal-drop').forEach(d => { d.style.display = 'none'; });
    }, { capture: true });
  }

  // ── Load ──────────────────────────────────
  try {
    showLoading(wrap, 'Loading events...');

    try {
      fightersDB = await API.getFighters();
    } catch { fightersDB = {}; }

    const allEvs = await API.getUpcomingEvents();
    // Upcoming Events page = future only. Past events live on Reviews page.
    const events = allEvs.filter(ev => {
      const iso = ev.isoDate || '';
      if (!iso) return true;
      return new Date(iso) >= new Date();
    });

    if (!Array.isArray(events) || !events.length) {
      wrap.innerHTML = `<div class="empty big">No upcoming events found.</div>`;
      return;
    }

    wrap.innerHTML = events.map(eventCard).join('');
    bindFightClicks();
    bindHypeMeters();
    bindCalendarButtons();

    // Auto-open event if URL has a hash like #ev-ufc-327-prochazka-vs-ulberg
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) {
        target.open = true;
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }

  } catch (err) {
    console.error('Events load error:', err);
    showError(wrap, 'Unable to load events right now. Please try again.');
  }
});
