// ==============================================
// MMA BRIDGE — USER PROFILE PAGE
// ==============================================

(async function () {

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const diff  = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    if (mins < 2)    return 'just now';
    if (mins < 60)   return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days < 30)   return `${days}d ago`;
    if (months < 12) return `${months}mo ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  function memberSince(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const root = document.getElementById('profileRoot');

  // ── Check for ?user= URL param (viewing another user's profile) ─────────
  const urlParams = new URLSearchParams(location.search);
  const viewedUserId = urlParams.get('user');

  // ── Wait for auth to be ready ─────────────────
  function waitForAuth(timeout = 4000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const auth = window.MMABridgeAuth;
        const user = auth?.getUser?.();
        if (user || Date.now() - start > timeout) {
          resolve(user || null);
        } else {
          setTimeout(check, 80);
        }
      };
      check();
    });
  }

  const loggedInUser = await waitForAuth();

  // Determine if viewing own profile or another user's
  const isOwnProfile = !viewedUserId || (loggedInUser && viewedUserId === loggedInUser.id);

  // For own profile, require login
  if (isOwnProfile && !loggedInUser) {
    root.innerHTML = `
      <div class="pr-sign-in-prompt">
        <div class="pr-icon"></div>
        <h2>Sign in to see your profile</h2>
        <p>Track your ratings, predict Fight of the Night, and build your fighter favourites list.</p>
        <a href="auth.html" class="pr-sign-in-btn">Sign In / Sign Up</a>
      </div>`;
    return;
  }

  const sb = window._sb;
  const API_BASE = 'https://mmabridge.onrender.com';

  // ── VIEWING ANOTHER USER'S PROFILE ────────────
  if (!isOwnProfile) {
    // Load other user's public data
    let profileData = null;
    try {
      const { data } = await sb.from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', viewedUserId)
        .single();
      profileData = data;
    } catch {}

    if (!profileData) {
      root.innerHTML = `
        <div class="pr-sign-in-prompt">
          <div class="pr-icon"></div>
          <h2>Profile not found</h2>
          <p>This user's profile doesn't exist or is not public.</p>
          <a href="javascript:history.back()" class="pr-sign-in-btn">Go Back</a>
        </div>`;
      return;
    }

    // Load their ratings, picks, favs, events, and fight_results in parallel (public)
    const [ratingsResult, eventsResult, fightersResult, picksResult, profileExtResult, resultsResult] = await Promise.all([
      sb.from('ratings').select('id, event_id, event_name, hype_rating, review_text, created_at').eq('user_id', viewedUserId).order('created_at', { ascending: false }),
      fetch('./events.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('./data/fighters.json').then(r => r.ok ? r.json() : []).catch(() => []),
      sb.from('picks').select('event_id, fight_key, pick').eq('user_id', viewedUserId).neq('fight_key', 'fotn'),
      sb.from('profiles').select('fav_fighters').eq('id', viewedUserId).single(),
      sb.from('fight_results').select('event_id, fight_key, winner').neq('fight_key', '__fotn__'),
    ]);

    const ratings = ratingsResult.data || [];
    const events  = Array.isArray(eventsResult) ? eventsResult : [];
    const fighters = Array.isArray(fightersResult) ? fightersResult : [];
    const favFighterIds = profileExtResult.data?.fav_fighters || [];
    const eventMap = {};
    events.forEach(ev => {
      const id = ev.id || slugify(ev.name || '');
      eventMap[id] = ev;
    });

    // Build winner lookup (fight_results DB rows + events.json completed fights)
    const winnerMap = {};
    (resultsResult.data || []).forEach(r => {
      if (r.winner) winnerMap[`${r.event_id}:${r.fight_key}`] = r.winner.toLowerCase();
    });
    events.forEach(ev => {
      const evId = ev.id || slugify(ev.name || '');
      [['main', ev.mainCard || []], ['prelims', ev.prelims || []], ['early', ev.earlyPrelims || []]].forEach(([key, fights]) => {
        fights.forEach((f, i) => {
          if (f.winner) winnerMap[`${evId}:${key}-${i}`] = f.winner.toLowerCase();
        });
      });
    });

    const picks = picksResult.data || [];
    let correctPicks = 0, scoredPicks = 0;
    const pickEventSet = new Set();
    picks.forEach(p => {
      pickEventSet.add(p.event_id);
      const actual = winnerMap[`${p.event_id}:${p.fight_key}`];
      if (actual) {
        scoredPicks++;
        if (p.pick && p.pick.toLowerCase() === actual) correctPicks++;
      }
    });
    const totalPicks = picks.length;
    const eventsPickedCount = pickEventSet.size;
    const accuracy = scoredPicks > 0 ? Math.round((correctPicks / scoredPicks) * 100) : null;

    const totalRatings = ratings.length;
    const avgRating = totalRatings
      ? (ratings.reduce((s, r) => s + Number(r.hype_rating), 0) / totalRatings).toFixed(1)
      : '—';

    // Build fav fighters HTML
    let favsHtml = '';
    if (favFighterIds.length) {
      const favCards = favFighterIds.map(fid => {
        const f = fighters.find(x => x.id === fid);
        if (!f) return '';
        const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const record = f.record ? `${f.record.wins||0}-${f.record.losses||0}` : '';
        return `
          <a class="pr-fav-card" href="fighter.html?id=${encodeURIComponent(f.id)}">
            <div class="pr-fav-photo-wrap">
              ${f.img ? `<img class="pr-fav-photo" src="${esc(f.img)}" alt="${esc(f.name)}">` : ''}
              <div class="pr-fav-initial-lg" style="${f.img ? 'display:none' : ''}">${esc(initials)}</div>
              <div class="pr-fav-photo-grad"></div>
            </div>
            <div class="pr-fav-body">
              <div class="pr-fav-name">${esc(f.name)}</div>
              <div class="pr-fav-meta">${record ? `<span class="pr-fav-record">${esc(record)}</span>` : ''}${f.flag ? `<span>${esc(f.flag)}</span>` : ''}</div>
            </div>
          </a>`;
      }).filter(Boolean).join('');

      if (favCards) {
        favsHtml = `
          <div class="pr-section" style="animation-delay:0.15s">
            <div class="pr-section-title">Their Corner</div>
            <div class="pr-favs-grid">${favCards}</div>
          </div>`;
      }
    }

    // Build other-user profile UI
    const initials = (profileData.display_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarHtml = profileData.avatar_url
      ? `<img class="pr-avatar-img" src="${esc(profileData.avatar_url)}" alt="${esc(profileData.display_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="pr-avatar-initials" style="display:none">${esc(initials)}</div>`
      : `<div class="pr-avatar-initials">${esc(initials)}</div>`;

    root.innerHTML = `
      <div class="pr-hero">
        <div class="pr-hero-bg"></div>
        <a href="javascript:history.back()" class="pr-back">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><polyline points="6,1 1,6 6,11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </a>
        <div class="pr-hero-inner">
          <div class="pr-avatar-wrap">
            <div class="pr-avatar-ring">${avatarHtml}</div>
          </div>
          <div class="pr-info">
            <div class="pr-label">Fighter Profile</div>
            <h1 class="pr-name">${esc(profileData.display_name || 'Fighter')}</h1>
            <div class="pr-meta-row">
              <span class="pr-meta-item">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Member since ${memberSince(profileData.created_at)}
              </span>
            </div>
            <div class="profile-follow-row" id="profileFollowRow" style="display:none">
              <div class="profile-follow-counts">
                <span><strong id="profileFollowersCount">0</strong> followers</span>
                <span><strong id="profileFollowingCount">0</strong> following</span>
              </div>
              ${loggedInUser
                ? `<button class="profile-follow-btn" id="profileFollowBtn">Follow</button>`
                : `<a class="profile-follow-btn" href="auth.html">Sign in to Follow</a>`
              }
            </div>
            ${loggedInUser && loggedInUser.id !== viewedUserId
              ? `<button class="pr-challenge-btn" id="prChallengeBtn" data-uid="${esc(viewedUserId)}" data-uname="${esc(profileData.display_name || 'Fighter')}">Challenge</button>`
              : ''}
          </div>
        </div>
      </div>

      <div class="pr-stats">
        <div class="pr-stats-inner">
          <div class="pr-stat">
            <div class="pr-stat-num">${eventsPickedCount || '—'}</div>
            <div class="pr-stat-lbl">Events Picked</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num">${accuracy !== null ? accuracy + '%' : '—'}</div>
            <div class="pr-stat-lbl">Pick Accuracy</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num">${totalRatings || '—'}</div>
            <div class="pr-stat-lbl">Events Rated</div>
          </div>
        </div>
      </div>

      <div class="pr-body">
        ${buildOtherPickHistorySection(picks, pickEventSet, winnerMap, eventMap)}
        ${buildOtherRatingsSection(ratings, eventMap)}
        ${favsHtml}
      </div>
    `;

    // Wire challenge button
    document.getElementById('prChallengeBtn')?.addEventListener('click', () => {
      window.openChallengeModal?.(viewedUserId, profileData.display_name || 'Fighter');
    });

    // Load follow data
    loadOtherUserFollowData(viewedUserId, loggedInUser);
    return;
  }

  // ── OWN PROFILE ───────────────────────────────
  const user = loggedInUser;

  // ── Load data in parallel ─────────────────────
  const [ratingsResult, eventsResult, fightersResult, picksResult] = await Promise.all([
    sb.from('ratings')
      .select('id, event_id, event_name, hype_rating, review_text, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    fetch('./events.json').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json').then(r => r.ok ? r.json() : []).catch(() => []),
    sb.from('picks')
      .select('event_id, fight_key, pick, method, round')
      .eq('user_id', user.id)
      .neq('fight_key', 'fotn'),
  ]);

  const ratings  = ratingsResult.data || [];
  const events   = Array.isArray(eventsResult) ? eventsResult : [];
  const fighters = Array.isArray(fightersResult) ? fightersResult : [];
  const allPicks = picksResult.data || [];

  // ── Build event lookup by id ──────────────────
  const eventMap = {};
  events.forEach(ev => {
    const id = ev.id || slugify(ev.name || ev.eventName || '');
    eventMap[id] = ev;
  });

  // ── Compute Pick History ──────────────────────
  // Group user's picks by event_id
  const picksByEvent = {};
  allPicks.forEach(p => {
    if (!picksByEvent[p.event_id]) picksByEvent[p.event_id] = [];
    picksByEvent[p.event_id].push(p);
  });

  const pickHistory = [];
  // Total picks across ALL events (for Pick Master badge)
  const totalPicksAll = allPicks.length;

  Object.keys(picksByEvent).forEach(evId => {
    const ev = eventMap[evId];
    if (!ev || ev.status !== 'completed') return;

    const userPicksForEv = picksByEvent[evId];

    // Build a map: fight_key → winner
    // fight_key format matches picks.js: "main-0", "main-1", "prelims-0", "early-0"
    const winnerMap = {};
    const sections = [
      { key: 'main',    fights: ev.mainCard || [] },
      { key: 'prelims', fights: ev.prelims || [] },
      { key: 'early',   fights: ev.earlyPrelims || [] },
    ];
    sections.forEach(({ key, fights }) => {
      fights.forEach((f, i) => {
        if (f.winner) {
          winnerMap[`${key}-${i}`] = (f.winner || '').toLowerCase();
        }
      });
    });

    let correct = 0;
    let total = 0;
    userPicksForEv.forEach(p => {
      const winner = winnerMap[p.fight_key];
      if (!winner) return; // fight not yet decided
      total++;
      if ((p.pick || '').toLowerCase() === winner) correct++;
    });

    if (total === 0) return;

    const pct = Math.round((correct / total) * 100);

    const evDate = ev.isoDate
      ? new Date(ev.isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : ev.date || '';

    let verdict = 'Rough Night';
    if (pct >= 70) verdict = 'Sharp';
    else if (pct >= 50) verdict = 'Solid';

    pickHistory.push({
      eventId: evId,
      name: ev.name || evId,
      date: evDate,
      correct,
      total,
      pct,
      verdict,
    });
  });

  // Sort by event date descending
  pickHistory.sort((a, b) => {
    const ea = eventMap[a.eventId];
    const eb = eventMap[b.eventId];
    const da = ea?.isoDate ? new Date(ea.isoDate) : 0;
    const db = eb?.isoDate ? new Date(eb.isoDate) : 0;
    return db - da;
  });

  // ── Favourite fighters (localStorage) ─────────
  const FAVS_KEY = 'mmab_favs';
  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY)) || []; } catch { return []; }
  }

  const fighterById = {};
  fighters.forEach(f => { if (f.id) fighterById[f.id] = f; });

  function saveFavs(ids) {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(ids)); } catch {}
    window.MMABridgePush?.updateFavFighters(ids, fighterById).catch?.(() => {});
    if (sb && user?.id) {
      sb.from('profiles').update({ fav_fighters: ids }).eq('id', user.id).then(() => {}).catch(() => {});
    }
  }

  // ── Compute stats ─────────────────────────────
  const totalRatings = ratings.length;
  const avgRating = totalRatings
    ? (ratings.reduce((s, r) => s + Number(r.hype_rating), 0) / totalRatings).toFixed(1)
    : '—';

  // ── Compute badges ────────────────────────────
  const BADGES = [
    { id: 'sharp',   icon: 'S', name: 'Sharp',        desc: '70%+ accuracy on any event',       check: () => pickHistory.some(e => e.pct >= 70) },
    { id: 'perfect', icon: 'P', name: 'Perfect Card', desc: '100% correct on an event',          check: () => pickHistory.some(e => e.pct === 100) },
    { id: 'veteran', icon: 'V', name: 'Veteran',      desc: 'Picked 5+ events',                  check: () => pickHistory.length >= 5 },
    { id: 'rater',   icon: 'C', name: 'Critic',       desc: 'Rated 5+ events',                   check: () => ratings.length >= 5 },
    { id: 'dayone',  icon: 'D', name: 'Day One',      desc: 'Early adopter (joined before 2026)', check: () => new Date(user.created_at) < new Date('2026-01-01') },
    { id: 'picker',  icon: 'M', name: 'Pick Master',  desc: '30+ total picks across all events', check: () => totalPicksAll >= 30 },
  ];
  const earnedBadges = BADGES.filter(b => b.check());

  // ── Stars HTML ────────────────────────────────
  function starsHtml(rating) {
    return [1, 2, 3, 4, 5].map(n =>
      `<span class="pr-star${rating >= n ? ' lit' : ''}">★</span>`
    ).join('');
  }

  // ── Render ────────────────────────────────────
  renderProfile();

  function renderProfile() {
    const initials = (user.display_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarHtml = user.avatar_url
      ? `<img class="pr-avatar-img" src="${esc(user.avatar_url)}" alt="${esc(user.display_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="pr-avatar-initials" style="display:none">${esc(initials)}</div>`
      : `<div class="pr-avatar-initials">${esc(initials)}</div>`;

    root.innerHTML = `
      <!-- HERO -->
      <div class="pr-hero">
        <div class="pr-hero-bg"></div>
        <a href="javascript:history.back()" class="pr-back">
          <svg width="8" height="12" viewBox="0 0 8 12" fill="none"><polyline points="6,1 1,6 6,11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </a>
        <div class="pr-hero-inner">
          <div class="pr-avatar-wrap">
            <div class="pr-avatar-ring">${avatarHtml}</div>
          </div>
          <div class="pr-info">
            <div class="pr-label">Fighter Profile</div>
            <h1 class="pr-name">${esc(user.display_name || 'Fighter')}</h1>
            <div class="pr-meta-row">
              <span class="pr-meta-item">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Member since ${memberSince(user.created_at || new Date().toISOString())}
              </span>
            </div>
            ${buildFollowRow()}
          </div>
        </div>
      </div>

      <!-- STATS -->
      <div class="pr-stats">
        <div class="pr-stats-inner">
          <div class="pr-stat">
            <div class="pr-stat-num" id="statRatings">0</div>
            <div class="pr-stat-lbl">Events Rated</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num" id="statAvg">—</div>
            <div class="pr-stat-lbl">Avg Rating</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num" id="statPicks">0</div>
            <div class="pr-stat-lbl">Picks Made</div>
          </div>
        </div>
      </div>

      <!-- BODY -->
      <div class="pr-body">
        ${buildBadgesSection()}
        ${buildRatingsSection()}
        ${buildPickHistorySection()}
        ${buildFavsSection()}
        ${buildNotifPrefsCard()}
        ${buildDangerZone()}
      </div>

      ${buildModal()}
    `;

    animateStats();
    attachEvents();
  }

  // ── Build sections ────────────────────────────

  function buildRatingsSection() {
    if (!ratings.length) {
      return `
        <div class="pr-section" style="animation-delay:0.1s">
          <div class="pr-section-title">My Reviews</div>
          <div class="pr-empty-premium">
            <div class="pr-empty-title">No Reviews Yet</div>
            <div class="pr-empty-sub">Go rate an event on the <a href="reviews.html">Reviews page</a></div>
          </div>
        </div>`;
    }

    const cards = ratings.map(r => {
      const ev = eventMap[r.event_id];
      const name   = r.event_name || ev?.name || 'Unknown Event';
      const poster  = ev?.poster || '';
      const eventId = r.event_id || slugify(name);

      return `
        <a class="pr-rating-card" href="event-review.html?id=${encodeURIComponent(eventId)}">
          <div class="pr-rc-poster-wrap">
            ${poster
              ? `<img class="pr-rc-poster" src="${esc(poster)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none'">
                 <div class="pr-rc-grad"></div>`
              : `<div class="pr-rc-placeholder"></div>`}
            <div class="pr-rc-stars">${starsHtml(r.hype_rating)}</div>
          </div>
          <div class="pr-rc-body">
            <div class="pr-rc-name">${esc(name)}</div>
            <div class="pr-rc-meta">
              <span>${timeAgo(r.created_at)}</span>
            </div>
            ${r.review_text ? `<div class="pr-rc-text">${esc(r.review_text)}</div>` : ''}
          </div>
        </a>`;
    }).join('');

    return `
      <div class="pr-section" style="animation-delay:0.1s">
        <div class="pr-section-title">
          My Reviews
          <span class="pr-section-count">${ratings.length}</span>
        </div>
        <div class="pr-ratings-grid">${cards}</div>
      </div>`;
  }

  function buildPickHistorySection() {
    if (!pickHistory.length) {
      return `
        <div class="pr-section" id="prPickHistory" style="animation-delay:0.15s">
          <div class="pr-section-title">Pick History</div>
          <div class="pr-empty-premium">
            <div class="pr-empty-title">No Completed Picks Yet</div>
            <div class="pr-empty-sub">Make your fight picks on the <a href="events.html">Events page</a></div>
          </div>
        </div>`;
    }

    const allCorrect = pickHistory.reduce((s, e) => s + e.correct, 0);
    const allTotal   = pickHistory.reduce((s, e) => s + e.total, 0);
    const allPct     = allTotal ? Math.round((allCorrect / allTotal) * 100) : 0;

    const rows = pickHistory.map(e => {
      const verdictClass = e.verdict === 'Sharp' ? 'sharp' : e.verdict === 'Solid' ? 'solid' : 'rough';
      return `
        <div class="pr-ph-row">
          <div class="pr-ph-event">${esc(e.name)}</div>
          <div class="pr-ph-date">${esc(e.date)}</div>
          <div class="pr-ph-score">${e.correct}<span>/${e.total}</span></div>
          <div class="pr-ph-pct">${e.pct}%</div>
          <div class="pr-ph-bar"><div class="pr-ph-fill" style="width:${e.pct}%"></div></div>
          <div class="pr-ph-verdict ${verdictClass}">${esc(e.verdict)}</div>
        </div>`;
    }).join('');

    return `
      <div class="pr-section" id="prPickHistory" style="animation-delay:0.15s">
        <div class="pr-section-title">
          Pick History
          <span class="pr-section-count">${pickHistory.length}</span>
        </div>
        <div class="pr-ph-list">
          ${rows}
        </div>
        <div class="pr-ph-summary">
          <span>All-time: <strong>${allCorrect}/${allTotal} picks</strong> · <strong>${allPct}%</strong></span>
        </div>
      </div>`;
  }

  function buildBadgesSection() {
    const badgesHtml = earnedBadges.length
      ? earnedBadges.map(b => `
          <div class="pr-badge-chip earned" title="${esc(b.desc)}">
            <span class="pr-badge-icon">${b.icon}</span>
            <span class="pr-badge-name">${esc(b.name)}</span>
            <div class="pr-badge-tooltip">${esc(b.desc)}</div>
          </div>`).join('')
      : `<div class="pr-badge-empty">Keep picking and rating to earn badges!</div>`;

    return `
      <div class="pr-section" style="animation-delay:0.05s">
        <div class="pr-section-title">Badges</div>
        <div class="pr-badges-row">
          ${badgesHtml}
        </div>
      </div>`;
  }

  function buildFavsSection() {
    return `
      <div class="pr-section" style="animation-delay:0.2s" id="favsSection">
        <div class="pr-section-title">Your Corner <span class="pr-section-sub">(Your Favourite Fighters)</span></div>
        <div class="pr-favs-grid" id="favsGrid"></div>
      </div>`;
  }

  function buildNotifPrefsCard() {
    return `
      <div class="pr-section" style="animation-delay:0.25s">
        <div class="profile-card notif-prefs-card">
          <div class="profile-card-title">Notification Preferences</div>
          <div class="notif-pref-list">
            <label class="notif-pref-row">
              <div class="notif-pref-info">
                <span class="notif-pref-label">New event announcements</span>
                <span class="notif-pref-hint">When a new UFC event is added</span>
              </div>
              <input type="checkbox" class="notif-pref-toggle" data-pref="new_event" checked>
            </label>
            <label class="notif-pref-row">
              <div class="notif-pref-info">
                <span class="notif-pref-label">Favorite fighter alerts</span>
                <span class="notif-pref-hint">When your favorite fighter is announced</span>
              </div>
              <input type="checkbox" class="notif-pref-toggle" data-pref="fight_upcoming" checked>
            </label>
            <label class="notif-pref-row">
              <div class="notif-pref-info">
                <span class="notif-pref-label">Starred event reminders</span>
                <span class="notif-pref-hint">1 week and 1 day before starred events</span>
              </div>
              <input type="checkbox" class="notif-pref-toggle" data-pref="starred_events" checked>
            </label>
            <label class="notif-pref-row" id="emailDigestRow">
              <div class="notif-pref-info">
                <span class="notif-pref-label">Weekly email digest</span>
                <span class="notif-pref-hint">Upcoming events and your stats, every Monday</span>
              </div>
              <input type="checkbox" class="notif-pref-toggle" id="emailOptOutToggle" checked>
            </label>
          </div>
        </div>
      </div>`;
  }

  async function initEmailOptOut() {
    try {
      const { data } = await sb.from('profiles').select('email_opt_out').eq('id', user.id).single();
      const toggle = document.getElementById('emailOptOutToggle');
      if (!toggle) return;
      toggle.checked = !(data?.email_opt_out);
      toggle.addEventListener('change', async () => {
        const optOut = !toggle.checked;
        try {
          await sb.from('profiles').update({ email_opt_out: optOut }).eq('id', user.id);
        } catch {
          toggle.checked = !optOut;
        }
      });
    } catch {}
  }

  function buildFollowRow() {
    return `
      <div class="profile-follow-row" id="profileFollowRow" style="display:none">
        <div class="profile-follow-counts">
          <span><strong id="profileFollowersCount">0</strong> followers</span>
          <span><strong id="profileFollowingCount">0</strong> following</span>
        </div>
      </div>`
  }

  function buildDangerZone() {
    return `
      <div class="pr-section" style="animation-delay:0.3s">
        <div class="pr-section-title">Account</div>
        <div class="pr-danger-zone">
          <div class="pr-danger-title">Danger Zone</div>
          <p class="pr-danger-desc">Permanently delete your account and all associated data — picks, ratings, and profile. This cannot be undone.</p>
          <button class="pr-delete-btn" id="deleteAccountBtn">Delete My Account</button>
        </div>
      </div>`;
  }

  function buildModal() {
    return `
      <div class="pr-modal-backdrop" id="fighterPickerModal" style="display:none">
        <div class="pr-modal">
          <div class="pr-modal-header">
            <div class="pr-modal-title">Add Favourite Fighters</div>
            <button class="pr-modal-close" id="modalClose">✕</button>
          </div>
          <div class="pr-modal-search">
            <input type="text" id="modalSearch" placeholder="Search fighters…" autocomplete="off" />
          </div>
          <div class="pr-modal-list" id="modalList"></div>
          <div class="pr-modal-done"><button id="modalDone">Done</button></div>
        </div>
      </div>`;
  }

  function renderFavs() {
    const favIds = getFavs();
    const grid   = document.getElementById('favsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const now = Date.now();

    favIds.forEach((fid, idx) => {
      const f = fighters.find(x => x.id === fid);
      if (!f) return;
      const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      // Find next upcoming event this fighter appears in
      let nextEvent = null;
      for (const ev of events) {
        if (ev.isoDate && new Date(ev.isoDate).getTime() > now) {
          const allFights = [...(ev.mainCard || []), ...(ev.prelims || []), ...(ev.earlyPrelims || [])];
          const inEvent = allFights.some(fight =>
            (fight.a || '').toLowerCase().includes(f.name.toLowerCase()) ||
            (fight.b || '').toLowerCase().includes(f.name.toLowerCase())
          );
          if (inEvent) { nextEvent = ev; break; }
        }
      }

      const record = f.record
        ? `${f.record.wins || 0}-${f.record.losses || 0}${f.record.draws ? `-${f.record.draws}` : ''}`
        : null;

      const card = document.createElement('a');
      card.className = 'pr-fav-card';
      card.href = `fighter.html?id=${encodeURIComponent(f.id)}`;
      card.style.animationDelay = `${idx * 0.06}s`;
      card.innerHTML = `
        <div class="pr-fav-photo-wrap">
          ${f.img
            ? `<img class="pr-fav-photo" src="${esc(f.img)}" alt="${esc(f.name)}" onerror="this.closest('.pr-fav-photo-wrap').querySelector('.pr-fav-initial-lg').style.display='flex';this.style.display='none'">`
            : ''}
          <div class="pr-fav-initial-lg" style="${f.img ? 'display:none' : ''}">${esc(initials)}</div>
          <div class="pr-fav-photo-grad"></div>
          ${nextEvent ? `<div class="pr-fav-next-badge">NEXT FIGHT</div>` : ''}
        </div>
        <div class="pr-fav-body">
          <div class="pr-fav-name">${esc(f.name)}</div>
          <div class="pr-fav-meta">
            ${record ? `<span class="pr-fav-record">${esc(record)}</span>` : ''}
            ${f.flag ? `<span>${esc(f.flag)}</span>` : ''}
            ${f.weightClass ? `<span>${esc(f.weightClass)}</span>` : ''}
          </div>
        </div>
        <button class="pr-fav-remove" data-id="${esc(f.id)}" title="Remove">✕</button>`;
      grid.appendChild(card);
    });

    // Add button
    const addBtn = document.createElement('div');
    addBtn.className = 'pr-fav-add';
    addBtn.id = 'favsAddBtn';
    addBtn.innerHTML = `
      <div class="pr-fav-add-icon">+</div>
      <div class="pr-fav-add-label">Add fighter</div>`;
    grid.appendChild(addBtn);
  }

  // ── Animate stats counters ────────────────────
  function animateStats() {
    const ratingEl = document.getElementById('statRatings');
    const avgEl    = document.getElementById('statAvg');
    const picksEl  = document.getElementById('statPicks');

    if (ratingEl) {
      let cur = 0;
      const target = totalRatings;
      if (target === 0) { ratingEl.textContent = '0'; }
      else {
        const step = () => {
          cur = Math.min(cur + Math.ceil(target / 20), target);
          ratingEl.textContent = cur;
          if (cur < target) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }

    if (avgEl) { avgEl.textContent = avgRating; }

    if (picksEl) { picksEl.textContent = totalPicksAll; }
  }

  // ── Notification preferences ──────────────────
  function loadNotifPrefs() {
    try {
      const prefs = JSON.parse(localStorage.getItem('mma_notif_prefs') || '{}');
      document.querySelectorAll('.notif-pref-toggle').forEach(toggle => {
        const key = toggle.dataset.pref;
        toggle.checked = prefs[key] !== false;
        toggle.addEventListener('change', () => {
          const current = JSON.parse(localStorage.getItem('mma_notif_prefs') || '{}');
          current[toggle.dataset.pref] = toggle.checked;
          localStorage.setItem('mma_notif_prefs', JSON.stringify(current));
        });
      });
    } catch {}
  }

  // ── Follow system (own profile — show counts only) ─────────────────────────
  async function loadFollowData() {
    const followRow = document.getElementById('profileFollowRow');
    if (!followRow) return;
    try {
      const res = await fetch(`${API_BASE}/api/follow/counts/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        const followersEl = document.getElementById('profileFollowersCount');
        const followingEl = document.getElementById('profileFollowingCount');
        if (followersEl) followersEl.textContent = data.followers ?? 0;
        if (followingEl) followingEl.textContent = data.following ?? 0;
        followRow.style.display = 'flex';
      }
    } catch {}
  }

  // ── Events ────────────────────────────────────
  function attachEvents() {
    renderFavs();
    loadNotifPrefs();
    loadFollowData();
    initEmailOptOut();

    // Remove fav
    document.getElementById('favsGrid')?.addEventListener('click', e => {
      const removeBtn = e.target.closest('.pr-fav-remove');
      if (removeBtn) {
        e.preventDefault(); e.stopPropagation();
        const id = removeBtn.dataset.id;
        const favs = getFavs().filter(x => x !== id);
        saveFavs(favs);
        renderFavs();
        return;
      }
    });

    // Open modal
    document.addEventListener('click', e => {
      if (e.target.closest('#favsAddBtn')) openModal();
    });

    // Modal close
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('fighterPickerModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('fighterPickerModal')) closeModal();
    });
    document.getElementById('modalDone')?.addEventListener('click', closeModal);

    // Modal search
    document.getElementById('modalSearch')?.addEventListener('input', e => {
      renderModalList(e.target.value.toLowerCase());
    });

    // Delete account
    document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Are you sure you want to permanently delete your account?\n\nThis will erase all your picks, ratings, and profile data. This cannot be undone.'
      );
      if (!confirmed) return;

      const btn = document.getElementById('deleteAccountBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }

      try {
        const session = await sb.auth.getSession();
        const accessToken = session?.data?.session?.access_token;
        if (!accessToken) throw new Error('No session');

        const res = await fetch(`${API_BASE}/api/account/delete`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');

        await sb.auth.signOut();
        window.location.href = 'index.html';
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Delete My Account'; }
        alert('Failed to delete account: ' + err.message);
      }
    });
  }

  let modalOpen = false;

  function openModal() {
    const modal = document.getElementById('fighterPickerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    modalOpen = true;
    document.getElementById('modalSearch').value = '';
    renderModalList('');
    setTimeout(() => document.getElementById('modalSearch')?.focus(), 50);
  }

  function closeModal() {
    const modal = document.getElementById('fighterPickerModal');
    if (modal) modal.style.display = 'none';
    modalOpen = false;
    renderFavs();
  }

  function renderModalList(q) {
    const list   = document.getElementById('modalList');
    const favIds = getFavs();
    if (!list) return;

    const filtered = fighters
      .filter(f => !q || f.name.toLowerCase().includes(q))
      .slice(0, 80);

    list.innerHTML = filtered.map(f => {
      const isFav = favIds.includes(f.id);
      const initials = f.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
        <div class="pr-modal-row${isFav ? ' selected' : ''}" data-id="${esc(f.id)}">
          ${f.img
            ? `<img src="${esc(f.img)}" alt="${esc(f.name)}" onerror="this.style.display='none'">`
            : `<div style="width:38px;height:38px;border-radius:50%;background:#1c1c1c;display:flex;align-items:center;justify-content:center;font-family:Montserrat,sans-serif;font-weight:800;font-size:0.85rem;color:rgba(0,229,255,0.5)">${esc(initials)}</div>`}
          <div class="pr-modal-row-info">
            <div class="pr-modal-row-name">${esc(f.name)}</div>
            <div class="pr-modal-row-meta">${esc(f.weightClass || '')}${f.ranking ? ' · ' + f.ranking : ''}</div>
          </div>
          <div class="pr-modal-row-check">${isFav ? '✓' : ''}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.pr-modal-row').forEach(row => {
      row.addEventListener('click', () => {
        const id   = row.dataset.id;
        let favs   = getFavs();
        const isSelected = row.classList.contains('selected');
        if (isSelected) {
          favs = favs.filter(x => x !== id);
        } else {
          if (!favs.includes(id)) favs.push(id);
        }
        saveFavs(favs);
        row.classList.toggle('selected', !isSelected);
        row.querySelector('.pr-modal-row-check').textContent = isSelected ? '' : '✓';
      });
    });
  }

  // ── Helpers for OTHER user profile ───────────────────────────────────────

  function buildOtherPickHistorySection(picks, pickEventSet, winnerMap, eventMap) {
    if (!picks.length) {
      return `
        <div class="pr-section" style="animation-delay:0.08s">
          <div class="pr-section-title">Pick History</div>
          <div class="pr-empty-premium">
            <div class="pr-empty-title">No Picks Yet</div>
            <div class="pr-empty-sub">This user hasn't made any fight picks</div>
          </div>
        </div>`;
    }

    // Group picks by event and compute per-event accuracy
    const evStats = {};
    picks.forEach(p => {
      if (!evStats[p.event_id]) evStats[p.event_id] = { total: 0, correct: 0, scored: 0 };
      evStats[p.event_id].total++;
      const actual = winnerMap[`${p.event_id}:${p.fight_key}`];
      if (actual) {
        evStats[p.event_id].scored++;
        if (p.pick && p.pick.toLowerCase() === actual) evStats[p.event_id].correct++;
      }
    });

    // Sort events by date descending
    const evIds = [...pickEventSet].sort((a, b) => {
      const da = eventMap[a]?.isoDate || '0';
      const db = eventMap[b]?.isoDate || '0';
      return db.localeCompare(da);
    });

    const rows = evIds.map(evId => {
      const ev = eventMap[evId];
      const name = ev?.name || evId;
      const s = evStats[evId];
      const pct = s.scored > 0 ? Math.round((s.correct / s.scored) * 100) : null;
      const verdict = pct === null ? 'Pending' : pct >= 75 ? 'Sharp' : pct >= 50 ? 'Solid' : 'Rough';
      const verdictClass = pct === null ? '' : pct >= 75 ? 'sharp' : pct >= 50 ? 'solid' : 'rough';
      return `
        <div class="pr-ph-row">
          <div class="pr-ph-event">${esc(name)}</div>
          <div class="pr-ph-score">${s.correct}<span>/${s.scored || s.total}</span></div>
          <div class="pr-ph-pct">${pct !== null ? pct + '%' : '—'}</div>
          <div class="pr-ph-bar"><div class="pr-ph-fill" style="width:${pct ?? 0}%"></div></div>
          <div class="pr-ph-verdict ${verdictClass}">${verdict}</div>
        </div>`;
    }).join('');

    return `
      <div class="pr-section" style="animation-delay:0.08s">
        <div class="pr-section-title">Pick History <span class="pr-section-count">${evIds.length}</span></div>
        <div class="pr-ph-table">${rows}</div>
      </div>`;
  }

  function buildOtherRatingsSection(ratings, eventMap) {
    if (!ratings.length) {
      return `
        <div class="pr-section" style="animation-delay:0.1s">
          <div class="pr-section-title">Reviews</div>
          <div class="pr-empty"><strong>No reviews yet</strong></div>
        </div>`;
    }

    const cards = ratings.map(r => {
      const ev = eventMap[r.event_id];
      const name   = r.event_name || ev?.name || 'Unknown Event';
      const poster  = ev?.poster || '';
      const eventId = r.event_id || slugify(name);
      return `
        <a class="pr-rating-card" href="event-review.html?id=${encodeURIComponent(eventId)}">
          <div class="pr-rc-poster-wrap">
            ${poster
              ? `<img class="pr-rc-poster" src="${esc(poster)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none'">
                 <div class="pr-rc-grad"></div>`
              : `<div class="pr-rc-placeholder"></div>`}
            <div class="pr-rc-stars">${[1,2,3,4,5].map(n=>`<span class="pr-star${r.hype_rating>=n?' lit':''}">★</span>`).join('')}</div>
          </div>
          <div class="pr-rc-body">
            <div class="pr-rc-name">${esc(name)}</div>
            <div class="pr-rc-meta"><span>${timeAgo(r.created_at)}</span></div>
            ${r.review_text ? `<div class="pr-rc-text">${esc(r.review_text)}</div>` : ''}
          </div>
        </a>`;
    }).join('');

    return `
      <div class="pr-section" style="animation-delay:0.1s">
        <div class="pr-section-title">Reviews <span class="pr-section-count">${ratings.length}</span></div>
        <div class="pr-ratings-grid">${cards}</div>
      </div>`;
  }

  async function loadOtherUserFollowData(targetId, currentUser) {
    const followRow = document.getElementById('profileFollowRow');
    if (!followRow) return;

    // Load follower/following counts
    try {
      const res = await fetch(`${API_BASE}/api/follow/counts/${targetId}`);
      if (res.ok) {
        const data = await res.json();
        const followersEl = document.getElementById('profileFollowersCount');
        const followingEl = document.getElementById('profileFollowingCount');
        if (followersEl) followersEl.textContent = data.followers ?? 0;
        if (followingEl) followingEl.textContent = data.following ?? 0;
        followRow.style.display = 'flex';
      }
    } catch {}

    if (!currentUser) return;

    // Check if current user is already following
    const btn = document.getElementById('profileFollowBtn');
    if (!btn) return;

    let isFollowing = false;
    try {
      const session = await window._sb.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) return;

      const statusRes = await fetch(`${API_BASE}/api/follow/status/${targetId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        isFollowing = statusData.is_following === true;
      }

      btn.textContent = isFollowing ? 'Following ✓' : 'Follow';
      btn.classList.toggle('following', isFollowing);

      btn.addEventListener('click', async () => {
        const session2 = await window._sb.auth.getSession();
        const tok = session2?.data?.session?.access_token;
        if (!tok) return;

        try {
          const method = isFollowing ? 'DELETE' : 'POST';
          const r = await fetch(`${API_BASE}/api/follow/${targetId}`, {
            method,
            headers: { 'Authorization': `Bearer ${tok}` }
          });
          if (r.ok) {
            isFollowing = !isFollowing;
            btn.textContent = isFollowing ? 'Following ✓' : 'Follow';
            btn.classList.toggle('following', isFollowing);

            // Optimistic count update
            const followersEl = document.getElementById('profileFollowersCount');
            if (followersEl) {
              const current = parseInt(followersEl.textContent) || 0;
              followersEl.textContent = isFollowing ? current + 1 : Math.max(0, current - 1);
            }
          }
        } catch {}
      });
    } catch {}
  }

})();
