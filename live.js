/**
 * MMA Bridge — Live Fight Results
 * Polls ESPN every 90s on fight nights, fires 'mmabridgelive' on document.
 *
 * Usage (both events.html and picks.html include this):
 *   window.MMALive.start(isoDate)  — call when opening a live/today event
 *   window.MMALive.stop()          — call when closing overlay or leaving page
 *   window.MMALive.data            — latest parsed result (or null)
 *
 * Event fired: document.dispatchEvent(new CustomEvent('mmabridgelive', { detail: data }))
 * data = {
 *   espnId, name, isLive, isCompleted,
 *   fights: [{ a, b, status:'scheduled'|'live'|'final', winner, method, round, clock }]
 * }
 */

(function () {
  'use strict';

  const ESPN  = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
  const POLL  = 90_000; // 90 seconds

  let _timer  = null;
  let _isoDate = null;

  // ── Name normalisation ────────────────────────────────────────────────────

  function norm(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }

  function namesMatch(a, b) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const len = Math.min(na.length, nb.length, 7);
    if (len >= 5 && na.slice(0, len) === nb.slice(0, len)) return true;
    if (na.includes(nb.slice(0, 6)) || nb.includes(na.slice(0, 6))) return true;
    return false;
  }

  // ── Method from ESPN details ──────────────────────────────────────────────

  function parseMethod(comp) {
    for (const d of (comp.details || [])) {
      const t = (d.type?.text || '').toLowerCase();
      if (!t.includes('unofficial winner')) continue;
      if (t.includes('kotko'))       return 'KO/TKO';
      if (t.includes('submission'))  return 'SUB';
      if (t.includes('decision'))    return 'DEC';
      if (t.includes('nc') || t.includes('no contest')) return 'NC';
      if (t.includes('dq'))          return 'DQ';
    }
    return '';
  }

  // ── Fetch + parse ESPN ────────────────────────────────────────────────────

  async function fetchLive(isoDate) {
    const ds = isoDate.replace(/-/g, '');
    let data;
    try {
      const res = await fetch(`${ESPN}?dates=${ds}`, {
        headers: { 'User-Agent': 'MMABridge-Live/1.0' },
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      data = await res.json();
    } catch { return null; }

    const ev = (data.events || [])[0];
    if (!ev) return null;

    const isCompleted = ev.status?.type?.completed === true;
    const state       = ev.status?.type?.state || 'pre';
    const isLive      = state === 'in' || state === 'live';

    const fights = (ev.competitions || []).map(comp => {
      const compState     = comp.status?.type?.state || 'pre';
      const compCompleted = comp.status?.type?.completed === true;
      const period        = comp.status?.period || null;
      const clock         = comp.status?.displayClock || '';

      const sorted  = [...(comp.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
      const fighterA = sorted[0]?.athlete?.displayName || sorted[0]?.displayName || '';
      const fighterB = sorted[1]?.athlete?.displayName || sorted[1]?.displayName || '';
      const winComp  = comp.competitors?.find(c => c.winner);
      const winner   = winComp?.athlete?.displayName || winComp?.displayName || null;
      const method   = compCompleted ? parseMethod(comp) : '';

      let status = 'scheduled';
      if (compCompleted)                    status = 'final';
      else if (compState === 'in')          status = 'live';

      return { a: fighterA, b: fighterB, status, winner, method,
               round: method === 'DEC' ? null : period, clock };
    }).reverse(); // ESPN lists prelims first — flip so main event is [0]

    return { espnId: ev.id, name: ev.name || '', isLive, isCompleted, fights };
  }

  // ── Apply to events.html overlay ──────────────────────────────────────────

  function applyToOverlay(data) {
    const col = document.getElementById('ovFightCol');
    if (!col) return;

    const rows = col.querySelectorAll('.ov-fight[data-fighter-a]');
    rows.forEach(row => {
      const fa = row.dataset.fighterA || '';
      const fb = row.dataset.fighterB || '';

      const hit = data.fights.find(f =>
        (namesMatch(f.a, fa) || namesMatch(f.b, fa)) &&
        (namesMatch(f.a, fb) || namesMatch(f.b, fb))
      );
      if (!hit) return;

      // Remove stale live classes
      row.classList.remove('lv-live', 'lv-final');

      if (hit.status === 'final' && hit.winner) {
        row.classList.add('lv-final');
        const aWon = namesMatch(hit.winner, fa);

        // Fighter name elements
        const nameEls = row.querySelectorAll('.ov-fighter');
        nameEls.forEach(el => {
          el.classList.remove('won', 'lost', 'lv-live-name');
          const isRight = el.classList.contains('right');
          const thisWon = isRight ? !aWon : aWon;
          el.classList.add(thisWon ? 'won' : 'lost');
        });

        // Mid column — inject or update result
        const mid = row.querySelector('.ov-fight-mid');
        if (mid) {
          // Remove any existing live indicator
          mid.querySelector('.lv-tag')?.remove();
          mid.querySelector('.ov-result-method')?.remove();
          mid.querySelector('.ov-result-detail')?.remove();

          const methodColors = { 'KO/TKO': '#e53935', 'SUB': '#8b5cf6', 'DEC': 'rgba(240,180,41,.75)', 'NC': 'rgba(255,255,255,.3)' };
          const col = methodColors[hit.method] || 'rgba(255,255,255,.45)';

          if (hit.method) {
            const mEl = document.createElement('div');
            mEl.className = 'ov-result-method';
            mEl.style.color = col;
            mEl.textContent = hit.method;
            mid.appendChild(mEl);
          }
          if (hit.round && hit.method !== 'DEC') {
            const dEl = document.createElement('div');
            dEl.className = 'ov-result-detail';
            dEl.textContent = `Rd ${hit.round}${hit.clock ? ' · ' + hit.clock : ''}`;
            mid.appendChild(dEl);
          }
        }

      } else if (hit.status === 'live') {
        row.classList.add('lv-live');
        const mid = row.querySelector('.ov-fight-mid');
        if (mid && !mid.querySelector('.lv-tag')) {
          const tag = document.createElement('div');
          tag.className = 'lv-tag';
          tag.innerHTML = '<span class="lv-dot"></span>LIVE';
          mid.prepend(tag);
        }
      }
    });

    // Animate the TONIGHT badge if event is live
    const liveDot = document.getElementById('ovLiveDot');
    if (liveDot) {
      liveDot.style.display = (data.isLive || !data.isCompleted) ? '' : 'none';
    }
  }

  // ── Apply to picks.html fight cards ──────────────────────────────────────

  function applyToPicks(data) {
    const root = document.getElementById('pkRoot');
    if (!root) return;

    data.fights.forEach(hit => {
      if (hit.status !== 'final' && hit.status !== 'live') return;

      // Find the fight card by fighter names via data-fa / data-fb attributes
      const sides = root.querySelectorAll('.sb-side[data-fa]');
      sides.forEach(side => {
        const fa = side.dataset.fa || '';
        const fb = side.dataset.fb || '';
        if (!(namesMatch(fa, hit.a) || namesMatch(fa, hit.b))) return;

        const card = side.closest('.sb-fight');
        if (!card) return;

        if (hit.status === 'live') {
          if (!card.querySelector('.lv-tag')) {
            const tag = document.createElement('div');
            tag.className = 'lv-tag lv-tag-card';
            tag.innerHTML = '<span class="lv-dot"></span>LIVE NOW';
            card.querySelector('.fc-vs-col')?.appendChild(tag);
          }
          return;
        }

        // Final — apply result-win / result-loss
        card.classList.add('lv-has-result');
        card.querySelectorAll('.lv-tag').forEach(t => t.remove());

        const allSides = card.querySelectorAll('.sb-side');
        allSides.forEach(s => {
          const pick = s.dataset.pick || '';
          s.classList.remove('result-win', 'result-loss');
          if (!hit.winner) return;
          s.classList.add(namesMatch(pick, hit.winner) ? 'result-win' : 'result-loss');
        });

        // Update center column method/round if not already there
        const vsCol = card.querySelector('.fc-vs-col');
        if (vsCol && !vsCol.querySelector('.lv-result-method')) {
          if (hit.method) {
            const mEl = document.createElement('div');
            mEl.className = 'lv-result-method fc-result-method-big';
            mEl.textContent = hit.method + (hit.round && hit.method !== 'DEC' ? ` · R${hit.round}` : '');
            vsCol.appendChild(mEl);
          }
        }
      });
    });
  }

  // ── Poll loop ─────────────────────────────────────────────────────────────

  async function poll() {
    if (!_isoDate) return;
    const data = await fetchLive(_isoDate);
    if (!data) return;

    window.MMALive.data = data;
    document.dispatchEvent(new CustomEvent('mmabridgelive', { detail: data }));

    applyToOverlay(data);
    applyToPicks(data);

    // Stop polling once event is fully completed
    if (data.isCompleted) {
      console.log('[MMALive] Event completed — stopping live poll');
      window.MMALive.stop();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.MMALive = {
    data: null,

    start(isoDate) {
      if (_isoDate === isoDate && _timer) return; // already running for this date
      this.stop();
      _isoDate = isoDate;
      console.log(`[MMALive] Starting live poll for ${isoDate}`);
      poll(); // immediate first fetch
      _timer = setInterval(poll, POLL);
    },

    stop() {
      if (_timer) { clearInterval(_timer); _timer = null; }
      _isoDate = null;
    },
  };

})();
