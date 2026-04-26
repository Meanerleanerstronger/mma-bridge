// ==============================================
// MMA BRIDGE — GLOBAL SEARCH
// ==============================================
(function () {
  const input   = document.getElementById('site-search');
  const form    = document.getElementById('site-search-form');
  if (!input || !form) return;

  let fighters  = null;
  let events    = null;
  let loadPromise = null;
  let activeIdx = -1;
  let dropEl    = null;

  // ── Helpers ──────────────────────────────────
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function isPast(ev) {
    return ev.isoDate && new Date(ev.isoDate) < new Date();
  }

  // ── Load data once ────────────────────────────
  async function loadData() {
    if (fighters && events) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const base = document.querySelector('base')?.href || location.origin + '/';
      try {
        const [fRes, eRes] = await Promise.all([
          fetch('data/fighters.json'),
          fetch('data/events.json'),
        ]);
        fighters = fRes.ok ? await fRes.json() : [];
        events   = eRes.ok ? await eRes.json() : [];
      } catch {
        fighters = fighters || [];
        events   = events   || [];
      }
    })();
    return loadPromise;
  }

  // ── Dropdown ──────────────────────────────────
  function getOrCreateDrop() {
    if (dropEl) return dropEl;
    dropEl = document.createElement('div');
    dropEl.id = 'search-dropdown';
    dropEl.className = 'search-dropdown';
    form.appendChild(dropEl);
    return dropEl;
  }

  function hideDrop() {
    if (dropEl) dropEl.style.display = 'none';
    activeIdx = -1;
  }

  function buildRow(html, onClick) {
    const el = document.createElement('div');
    el.className = 'sd-row';
    el.innerHTML = html;
    el.addEventListener('mousedown', e => { e.preventDefault(); onClick(); });
    return el;
  }

  function showDrop(fResults, eResults) {
    const drop = getOrCreateDrop();
    drop.innerHTML = '';

    const total = fResults.length + eResults.length;
    if (!total) {
      drop.innerHTML = '<div class="sd-empty">No results</div>';
      drop.style.display = 'block';
      activeIdx = -1;
      return;
    }

    // Fighters section
    if (fResults.length) {
      drop.appendChild(Object.assign(document.createElement('div'), { className: 'sd-section', textContent: 'Fighters' }));
      fResults.forEach(f => {
        const row = buildRow(`
          <img class="sd-avatar" src="${escHtml(f.img || '')}" alt="${escHtml(f.name)}" onerror="this.style.visibility='hidden'">
          <div class="sd-info">
            <span class="sd-name">${escHtml(f.name)}</span>
            <span class="sd-sub">${escHtml(f.weightClass)}${f.ranking ? ' · ' + f.ranking : ''}</span>
          </div>
        `, () => {
          input.value = '';
          hideDrop();
          window.location.href = `fighter.html?id=${encodeURIComponent(f.id)}`;
        });
        drop.appendChild(row);
      });
    }

    // Events section
    if (eResults.length) {
      drop.appendChild(Object.assign(document.createElement('div'), { className: 'sd-section', textContent: 'Events' }));
      eResults.forEach(ev => {
        const id   = ev.id || slugify(ev.name || ev.eventName || '');
        const name = ev.name || ev.eventName || 'Unknown Event';
        const dest = isPast(ev)
          ? `event-review.html?id=${encodeURIComponent(id)}`
          : `events.html?id=${encodeURIComponent(id)}`;

        const row = buildRow(`
          <div class="sd-event-icon">🥊</div>
          <div class="sd-info">
            <span class="sd-name">${escHtml(name)}</span>
            <span class="sd-sub">${fmtDate(ev.isoDate)}${ev.location ? ' · ' + ev.location : ''}</span>
          </div>
        `, () => {
          input.value = '';
          hideDrop();
          window.location.href = dest;
        });
        drop.appendChild(row);
      });
    }

    drop.style.display = 'block';
    activeIdx = -1;
  }

  // ── Keyboard nav ──────────────────────────────
  function getRows() {
    return dropEl ? Array.from(dropEl.querySelectorAll('.sd-row')) : [];
  }

  input.addEventListener('keydown', e => {
    const rows = getRows();
    if (!rows.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, rows.length - 1);
      rows.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      rows.forEach((r, i) => r.classList.toggle('active', i === activeIdx));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && rows[activeIdx]) {
        e.preventDefault();
        rows[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      }
    } else if (e.key === 'Escape') {
      hideDrop();
    }
  });

  // ── Input handler ─────────────────────────────
  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { hideDrop(); return; }

    debounce = setTimeout(async () => {
      await loadData();
      const fRes = (fighters || [])
        .filter(f => (f.name || '').toLowerCase().includes(q))
        .slice(0, 5);
      const eRes = (events || [])
        .filter(ev => (ev.name || ev.eventName || '').toLowerCase().includes(q))
        .sort((a, b) => new Date(b.isoDate || 0) - new Date(a.isoDate || 0))
        .slice(0, 5);
      showDrop(fRes, eRes);
    }, 120);
  });

  // ── Prevent form submit when dropdown open ─────
  form.addEventListener('submit', e => {
    if (dropEl && dropEl.style.display === 'block') {
      e.preventDefault();
    }
  });

  // ── Close on outside click ─────────────────────
  document.addEventListener('click', e => {
    if (!form.contains(e.target)) hideDrop();
  });
})();
