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
      fetch('./events.json?_='+Date.now(),{cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('./data/fighters.json?_='+Date.now(),{cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []),
      sb.from('picks').select('event_id, fight_key, pick').eq('user_id', viewedUserId).neq('fight_key', 'fotn'),
      sb.from('profiles').select('fav_fighters').eq('id', viewedUserId).single(),
      sb.from('fight_results').select('event_id, fight_key, winner').neq('fight_key', '__fotn__'),
    ]);

    const ratings = ratingsResult.data || [];
    const events  = Array.isArray(eventsResult) ? eventsResult : [];
    const fighters = Array.isArray(fightersResult) ? fightersResult : [];
    const _rawFavs = profileExtResult.data?.fav_fighters;
    const favFighterIds = Array.isArray(_rawFavs) ? _rawFavs
      : (typeof _rawFavs === 'string' ? (() => { try { return JSON.parse(_rawFavs); } catch { return []; } })() : []);
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

    // ── Streak computation for other user ────────────────────
    // Build per-event pct array sorted newest-first
    const otherEvStats = {};
    picks.forEach(p => {
      if (!otherEvStats[p.event_id]) otherEvStats[p.event_id] = { correct: 0, scored: 0 };
      const actual = winnerMap[`${p.event_id}:${p.fight_key}`];
      if (actual) {
        otherEvStats[p.event_id].scored++;
        if (p.pick && p.pick.toLowerCase() === actual) otherEvStats[p.event_id].correct++;
      }
    });
    const otherEvList = Object.keys(otherEvStats)
      .filter(evId => otherEvStats[evId].scored > 0)
      .sort((a, b) => {
        const da = eventMap[a]?.isoDate || '0';
        const db = eventMap[b]?.isoDate || '0';
        return db.localeCompare(da); // newest first
      })
      .map(evId => {
        const s = otherEvStats[evId];
        return Math.round((s.correct / s.scored) * 100);
      });

    let otherCurrentStreak = 0;
    for (const pct of otherEvList) {
      if (pct >= 50) otherCurrentStreak++;
      else break;
    }
    let otherBestStreak = 0, otherRunning = 0;
    for (const pct of [...otherEvList].reverse()) {
      if (pct >= 50) { otherRunning++; otherBestStreak = Math.max(otherBestStreak, otherRunning); }
      else otherRunning = 0;
    }

    // ── Dark horse + upsets for other user ───────────────────
    let otherHasDarkHorse = false;
    let otherUpsetCount = 0;
    picks.forEach(p => {
      const ev = eventMap[p.event_id];
      if (!ev) return;
      [['main', ev.mainCard||[]], ['prelims', ev.prelims||[]], ['early', ev.earlyPrelims||[]]].forEach(([key, fights]) => {
        fights.forEach((f, i) => {
          if (`${key}-${i}` !== p.fight_key) return;
          if (!f.winner) return;
          const isCorrect = p.pick?.toLowerCase() === (f.winner||'').toLowerCase();
          const pickedB = p.pick?.toLowerCase() === (f.b||'').toLowerCase();
          if (isCorrect && pickedB) { otherHasDarkHorse = true; otherUpsetCount++; }
        });
      });
    });

    // ── Perfect card check for other user ────────────────────
    const otherHasPerfectCard = Object.values(otherEvStats).some(s => s.scored >= 3 && s.correct === s.scored);

    const _SVG_ZAP    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const _SVG_TREND  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
    const _SVG_STAR   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const _SVG_CHECK  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    const _SVG_TARGET = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    const _SVG_SHIELD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

    const otherBadges = [];
    if (otherHasDarkHorse)            otherBadges.push({ icon: _SVG_ZAP,    name: 'Dark Horse',   desc: 'Called an underdog win' });
    if (otherBestStreak >= 3)         otherBadges.push({ icon: _SVG_TREND,  name: 'On a Run',     desc: `${otherBestStreak}-event best streak` });
    if (otherCurrentStreak >= 5)      otherBadges.push({ icon: _SVG_TREND,  name: 'Hot Hand',     desc: `${otherCurrentStreak}-event current streak` });
    if (otherUpsetCount >= 3)         otherBadges.push({ icon: _SVG_STAR,   name: 'Upset King',   desc: `Called ${otherUpsetCount} upsets` });
    if (otherHasPerfectCard)          otherBadges.push({ icon: _SVG_CHECK,  name: 'Perfect Card', desc: 'Got all picks right in an event' });
    if (picks.length >= 30)           otherBadges.push({ icon: _SVG_TARGET, name: 'Pick Master',  desc: '30+ total picks' });
    if (Object.keys(otherEvStats).length >= 5) otherBadges.push({ icon: _SVG_SHIELD, name: 'Veteran', desc: 'Picked 5+ events' });

    // H2H challenge record for viewed user
    let chWins = 0, chLosses = 0, chTies = 0;
    try {
      const { data: chRows } = await sb.from('challenges')
        .select('id, challenger_id, opponent_id, winner_id, status, event_id')
        .or(`challenger_id.eq.${viewedUserId},opponent_id.eq.${viewedUserId}`);

      const pendingResolvable = (chRows || []).filter(c =>
        c.status !== 'completed' && eventMap[c.event_id]?.status === 'completed'
      );

      let oppPicksByEvKey = {};
      if (pendingResolvable.length) {
        const oppIds = [...new Set(pendingResolvable.map(c => c.challenger_id === viewedUserId ? c.opponent_id : c.challenger_id))];
        const evIds  = [...new Set(pendingResolvable.map(c => c.event_id))];
        const { data: oppP } = await sb.from('picks').select('user_id, event_id, fight_key, pick')
          .in('user_id', oppIds).in('event_id', evIds).neq('fight_key', '__dd__').neq('fight_key', 'fotn');
        (oppP || []).forEach(p => {
          const k = `${p.user_id}:${p.event_id}`;
          (oppPicksByEvKey[k] = oppPicksByEvKey[k] || []).push(p);
        });
      }

      const toComplete = [];
      (chRows || []).forEach(c => {
        if (c.status === 'completed') {
          if (!c.winner_id) chTies++;
          else if (c.winner_id === viewedUserId) chWins++;
          else chLosses++;
          return;
        }
        if (!eventMap[c.event_id] || eventMap[c.event_id].status !== 'completed') return;
        const oppId = c.challenger_id === viewedUserId ? c.opponent_id : c.challenger_id;
        const vPicks = picks.filter(p => p.event_id === c.event_id && p.fight_key !== '__dd__' && p.fight_key !== 'fotn');
        const vPts = vPicks.filter(p => {
          const w = winnerMap[`${p.event_id}:${p.fight_key}`];
          return w && p.pick?.toLowerCase() === w;
        }).length;
        const oppEvPicks = oppPicksByEvKey[`${oppId}:${c.event_id}`] || [];
        if (!vPicks.length && !oppEvPicks.length) return;
        const oPts = oppEvPicks.filter(p => {
          const w = winnerMap[`${p.event_id}:${p.fight_key}`];
          return w && p.pick?.toLowerCase() === w;
        }).length;
        if (vPts > oPts) chWins++;
        else if (oPts > vPts) chLosses++;
        else chTies++;
        const winner_id = vPts > oPts ? viewedUserId : oPts > vPts ? oppId : null;
        toComplete.push({ id: c.id, winner_id });
      });
      toComplete.forEach(({ id, winner_id }) => {
        sb.from('challenges').update({ status: 'completed', winner_id }).eq('id', id).then(() => {}).catch(() => {});
      });
    } catch {}
    const chTotal = chWins + chLosses + chTies;

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
            <div class="pr-fav-card-inner">
              <div class="pr-fav-photo-wrap">
                ${f.img ? `<img class="pr-fav-photo" src="${esc(f.img)}" alt="${esc(f.name)}">` : ''}
                <div class="pr-fav-initial-lg" style="${f.img ? 'display:none' : ''}">${esc(initials)}</div>
                <div class="pr-fav-photo-grad"></div>
              </div>
              <div class="pr-fav-body">
                <div class="pr-fav-name">${esc(f.name)}</div>
                <div class="pr-fav-meta">${record ? `<span class="pr-fav-record">${esc(record)}</span>` : ''}${f.flag ? `<span>${esc(f.flag)}</span>` : ''}${f.weightClass ? `<span>${esc(f.weightClass)}</span>` : ''}</div>
                ${f.stats ? `<div class="pr-fav-stats">
                  ${f.stats.slpm ? `<span class="pr-fav-stat"><span class="pr-fav-stat-val">${f.stats.slpm}</span><span class="pr-fav-stat-lbl">SLpM</span></span>` : ''}
                  ${f.stats.strAcc ? `<span class="pr-fav-stat"><span class="pr-fav-stat-val">${f.stats.strAcc}</span><span class="pr-fav-stat-lbl">Str Acc</span></span>` : ''}
                  ${f.stats.tdAvg ? `<span class="pr-fav-stat"><span class="pr-fav-stat-val">${f.stats.tdAvg}</span><span class="pr-fav-stat-lbl">TD/15m</span></span>` : ''}
                  ${f.stats.subAvg ? `<span class="pr-fav-stat"><span class="pr-fav-stat-val">${f.stats.subAvg}</span><span class="pr-fav-stat-lbl">Sub/15m</span></span>` : ''}
                </div>` : ''}
              </div>
            </div>
          </a>`;
      }).filter(Boolean).join('');

      favsHtml = `
        <div class="pr-section" style="animation-delay:0.15s">
          <div class="pr-section-title">Their Corner</div>
          ${favCards
            ? `<div class="pr-favs-grid">${favCards}</div>`
            : `<div style="font-family:Inter,sans-serif;font-size:.8rem;color:rgba(255,255,255,.25);padding:8px 0">No favourite fighters added yet.</div>`}
        </div>`;
    }

    // Dynamic page title
    if (profileData.display_name) {
      document.title = `${profileData.display_name} | MMA Bridge`;
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
            <button class="pr-share-btn" id="prShareBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share Profile
            </button>
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
          <div class="pr-stat">
            <div class="pr-stat-num">${otherCurrentStreak}${otherCurrentStreak >= 3 ? '<span class="pr-streak-badge">HOT</span>' : ''}</div>
            <div class="pr-stat-lbl">Current Streak</div>
          </div>
          ${chTotal > 0 ? `<div class="pr-stat">
            <div class="pr-stat-num pr-stat-h2h">${chWins}<span class="pr-stat-h2h-sep">-</span>${chLosses}${chTies > 0 ? `<span class="pr-stat-h2h-sep">-</span>${chTies}` : ''}</div>
            <div class="pr-stat-lbl">H2H Record</div>
          </div>` : ''}
        </div>
      </div>

      <div class="pr-body">
        ${otherBadges.length ? `
          <div class="pr-section" style="animation-delay:0.05s">
            <div class="pr-section-title">Badges</div>
            <div class="pr-badges-row">
              ${otherBadges.map(b => `
                <div class="pr-badge-chip earned" title="${esc(b.desc)}">
                  <span class="pr-badge-icon">${b.icon}</span>
                  <span class="pr-badge-name">${esc(b.name)}</span>
                  <div class="pr-badge-tooltip">${esc(b.desc)}</div>
                </div>`).join('')}
            </div>
          </div>` : ''}
        ${otherEvList.length >= 3 ? buildSparkline(otherEvList) : ''}
        ${buildOtherPickHistorySection(picks, pickEventSet, winnerMap, eventMap)}
        ${buildOtherRatingsSection(ratings, eventMap)}
        ${favsHtml}
      </div>
    `;

    // Wire challenge button
    document.getElementById('prChallengeBtn')?.addEventListener('click', () => {
      window.openChallengeModal?.(viewedUserId, profileData.display_name || 'Fighter');
    });

    // Wire share button
    const otherShareBtn = document.getElementById('prShareBtn');
    if (otherShareBtn) {
      otherShareBtn.addEventListener('click', async () => {
        const profileUrl = location.href;
        const shareData = {
          title: 'MMA Bridge Profile',
          text: `Check out ${profileData.display_name || 'this fighter'}'s UFC picks on MMA Bridge!`,
          url: profileUrl,
        };
        if (navigator.share && navigator.canShare?.(shareData)) {
          try { await navigator.share(shareData); } catch {}
        } else {
          try {
            await navigator.clipboard.writeText(profileUrl);
            otherShareBtn.textContent = '✓ Copied!';
            otherShareBtn.classList.add('copied');
            setTimeout(() => {
              otherShareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share Profile`;
              otherShareBtn.classList.remove('copied');
            }, 2000);
          } catch {}
        }
      });
    }

    // Load follow data
    loadOtherUserFollowData(viewedUserId, loggedInUser);
    return;
  }

  // ── OWN PROFILE ───────────────────────────────
  const user = loggedInUser;

  // ── Load data in parallel ─────────────────────
  const [ratingsResult, eventsResult, fightersResult, picksResult, profileResult] = await Promise.all([
    sb.from('ratings')
      .select('id, event_id, event_name, hype_rating, review_text, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    fetch('./events.json?_='+Date.now(),{cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('./data/fighters.json?_='+Date.now(),{cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []),
    sb.from('picks')
      .select('event_id, fight_key, pick, method, round')
      .eq('user_id', user.id)
      .neq('fight_key', 'fotn'),
    sb.from('profiles').select('avatar_url, display_name').eq('id', user.id).single(),
  ]);

  const profileAvatarUrl = profileResult.data?.avatar_url || user.avatar_url || null;

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

  // ── Streak computation (event-level: pct >= 50%) ──────────
  // pickHistory is already sorted newest-first
  let currentStreak = 0;
  for (const ev of pickHistory) {
    if (ev.pct >= 50) currentStreak++;
    else break;
  }
  let bestStreak = 0, runningStreak = 0;
  for (const ev of [...pickHistory].reverse()) { // oldest first for best streak
    if (ev.pct >= 50) { runningStreak++; bestStreak = Math.max(bestStreak, runningStreak); }
    else runningStreak = 0;
  }

  // ── Overall accuracy across all completed events ──────────
  let totalJudged = 0, totalCorrect = 0;
  pickHistory.forEach(ev => { totalJudged += ev.total; totalCorrect += ev.correct; });
  const overallAccuracy = totalJudged > 0 ? Math.round((totalCorrect / totalJudged) * 100) : null;

  // ── H2H challenge record (own profile) ───────────────────
  let myChWins = 0, myChLosses = 0, myChTies = 0;
  try {
    const { data: myChRows } = await sb.from('challenges')
      .select('id, challenger_id, opponent_id, winner_id, status, event_id')
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`);

    const pendingResolvable = (myChRows || []).filter(c =>
      c.status !== 'completed' && eventMap[c.event_id]?.status === 'completed'
    );

    let oppPicksByEvKey = {};
    if (pendingResolvable.length) {
      const oppIds = [...new Set(pendingResolvable.map(c => c.challenger_id === user.id ? c.opponent_id : c.challenger_id))];
      const evIds  = [...new Set(pendingResolvable.map(c => c.event_id))];
      const { data: oppP } = await sb.from('picks').select('user_id, event_id, fight_key, pick')
        .in('user_id', oppIds).in('event_id', evIds).neq('fight_key', '__dd__').neq('fight_key', 'fotn');
      (oppP || []).forEach(p => {
        const k = `${p.user_id}:${p.event_id}`;
        (oppPicksByEvKey[k] = oppPicksByEvKey[k] || []).push(p);
      });
    }

    const toComplete = [];
    (myChRows || []).forEach(c => {
      if (c.status === 'completed') {
        if (!c.winner_id) myChTies++;
        else if (c.winner_id === user.id) myChWins++;
        else myChLosses++;
        return;
      }
      const ev = eventMap[c.event_id];
      if (!ev || ev.status !== 'completed') return;
      const oppId = c.challenger_id === user.id ? c.opponent_id : c.challenger_id;

      // Build winnerMap for this event
      const wMap = {};
      [['main', ev.mainCard || []], ['prelims', ev.prelims || []], ['early', ev.earlyPrelims || []]].forEach(([key, fights]) => {
        fights.forEach((f, i) => { if (f.winner) wMap[`${key}-${i}`] = f.winner.toLowerCase(); });
      });

      const myEvPicks = allPicks.filter(p => p.event_id === c.event_id && p.fight_key !== '__dd__' && p.fight_key !== 'fotn');
      const myPts = myEvPicks.filter(p => wMap[p.fight_key] && p.pick?.toLowerCase() === wMap[p.fight_key]).length;
      const oppEvPicks = oppPicksByEvKey[`${oppId}:${c.event_id}`] || [];
      if (!myEvPicks.length && !oppEvPicks.length) return;
      const oPts = oppEvPicks.filter(p => wMap[p.fight_key] && p.pick?.toLowerCase() === wMap[p.fight_key]).length;

      if (myPts > oPts) myChWins++;
      else if (oPts > myPts) myChLosses++;
      else myChTies++;

      const winner_id = myPts > oPts ? user.id : oPts > myPts ? oppId : null;
      toComplete.push({ id: c.id, winner_id });
    });
    toComplete.forEach(({ id, winner_id }) => {
      sb.from('challenges').update({ status: 'completed', winner_id }).eq('id', id).then(() => {}).catch(() => {});
    });
  } catch {}
  const myChTotal = myChWins + myChLosses + myChTies;

  // ── Tier computation ──────────────────────────────────────
  function computeTier(judgedPicks, accuracy) {
    if (judgedPicks === 0) return 'Walkout';
    if (judgedPicks < 10)  return 'Prospect';
    if (accuracy === null || accuracy < 40) return 'Ranked';
    if (accuracy < 50) return 'Contender';
    if (accuracy < 55) return 'Main Event';
    if (accuracy < 60) return 'Headliner';
    if (accuracy < 65 || judgedPicks < 30) return 'Champion';
    if (accuracy < 70 || judgedPicks < 60) return 'P4P';
    return 'GOAT';
  }

  function buildTierProgress(judgedPicks, accuracy) {
    const TIER_STEPS = [
      { name: 'Walkout',    minJudged: 0,  minAcc: 0  },
      { name: 'Prospect',   minJudged: 1,  minAcc: 0  },
      { name: 'Ranked',     minJudged: 10, minAcc: 0  },
      { name: 'Contender',  minJudged: 10, minAcc: 40 },
      { name: 'Main Event', minJudged: 10, minAcc: 50 },
      { name: 'Headliner',  minJudged: 10, minAcc: 55 },
      { name: 'Champion',   minJudged: 30, minAcc: 60 },
      { name: 'P4P',        minJudged: 60, minAcc: 65 },
      { name: 'GOAT',       minJudged: 60, minAcc: 70 },
    ];
    const current = computeTier(judgedPicks, accuracy);
    const currentIdx = TIER_STEPS.findIndex(t => t.name === current);
    if (current === 'GOAT') {
      return `<div class="pr-tier-progress"><div class="pr-tier-progress-label"><span>MAX TIER</span><span>GOAT</span></div><div class="pr-tier-bar-track"><div class="pr-tier-bar-fill" style="width:100%"></div></div></div>`;
    }
    const next = TIER_STEPS[currentIdx + 1];
    const acc = accuracy || 0;
    const judgePct = next.minJudged > 0 ? Math.min(100, Math.round((judgedPicks / next.minJudged) * 100)) : 100;
    const accPct   = next.minAcc > 0 ? Math.min(100, Math.round((acc / next.minAcc) * 100)) : 100;
    const pct = Math.round((judgePct + accPct) / 2);
    const needs = [];
    if (judgedPicks < next.minJudged) needs.push(`${next.minJudged - judgedPicks} more judged picks`);
    if (acc < next.minAcc) needs.push(`${next.minAcc}%+ accuracy`);
    const hint = needs.length ? needs.join(' · ') : 'Almost there!';
    return `<div class="pr-tier-progress">
      <div class="pr-tier-progress-label"><span>→ ${next.name}</span><span>${hint}</span></div>
      <div class="pr-tier-bar-track"><div class="pr-tier-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  // ── Favourite fighters (localStorage + Supabase) ─────────
  const FAVS_KEY = 'mmab_favs';
  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY)) || []; } catch { return []; }
  }

  // Sync fav_fighters from Supabase into localStorage (handles cross-device)
  if (sb && user?.id) {
    sb.from('profiles').select('fav_fighters').eq('id', user.id).single().then(({ data }) => {
      if (data?.fav_fighters?.length) {
        const local = getFavs();
        // Merge: union of Supabase + local; always use Supabase if local is empty
        const merged = local.length
          ? [...new Set([...local, ...data.fav_fighters])]
          : data.fav_fighters;
        try { localStorage.setItem(FAVS_KEY, JSON.stringify(merged)); } catch {}
      } else if (getFavs().length) {
        // Local has data but Supabase doesn't — upsert so missing profile rows get created too
        sb.from('profiles').upsert({ id: user.id, fav_fighters: getFavs() }).catch(() => {});
      }
      // Always re-render after Supabase check so cross-device data appears
      const grid = document.getElementById('favsGrid');
      if (grid) renderFavs();
    }).catch(() => {});
  }

  const fighterById = {};
  fighters.forEach(f => { if (f.id) fighterById[f.id] = f; });

  function saveFavs(ids) {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(ids)); } catch {}
    window.MMABridgePush?.updateFavFighters(ids, fighterById).catch?.(() => {});
    if (sb && user?.id) {
      sb.from('profiles').upsert({ id: user.id, fav_fighters: ids }).catch(() => {});
    }
  }

  // ── Compute stats ─────────────────────────────
  const totalRatings = ratings.length;
  const avgRating = totalRatings
    ? (ratings.reduce((s, r) => s + Number(r.hype_rating), 0) / totalRatings).toFixed(1)
    : '—';

  // ── Dark horse + upset count: correctly picked the "b" fighter ──
  let hasDarkHorse = false;
  let upsetCount = 0;
  allPicks.forEach(p => {
    const ev = eventMap[p.event_id];
    if (!ev) return;
    const sections = [['main', ev.mainCard||[]], ['prelims', ev.prelims||[]], ['early', ev.earlyPrelims||[]]];
    sections.forEach(([key, fights]) => {
      fights.forEach((f, i) => {
        if (`${key}-${i}` !== p.fight_key) return;
        if (!f.winner) return;
        const isCorrect = p.pick?.toLowerCase() === (f.winner||'').toLowerCase();
        const pickedB = p.pick?.toLowerCase() === (f.b||'').toLowerCase();
        if (isCorrect && pickedB) { hasDarkHorse = true; upsetCount++; }
      });
    });
  });

  // ── Weight class accuracy ─────────────────────
  const wcStats = {};
  allPicks.forEach(p => {
    const ev = eventMap[p.event_id];
    if (!ev) return;
    [['main', ev.mainCard||[]], ['prelims', ev.prelims||[]], ['early', ev.earlyPrelims||[]]].forEach(([key, fights]) => {
      fights.forEach((f, i) => {
        if (`${key}-${i}` !== p.fight_key) return;
        const wc = f.weight || 'Unknown';
        if (!wcStats[wc]) wcStats[wc] = { correct: 0, total: 0 };
        wcStats[wc].total++;
        const winner = (f.winner||'').toLowerCase();
        if (winner && p.pick?.toLowerCase() === winner) wcStats[wc].correct++;
      });
    });
  });
  const wcList = Object.entries(wcStats)
    .filter(([,v]) => v.total >= 3)
    .map(([wc, v]) => ({ wc, pct: Math.round(v.correct/v.total*100), total: v.total }))
    .sort((a,b) => b.pct - a.pct);

  // ── Compute badges ────────────────────────────
  const _B = {
    zap:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    trend:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    star:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    check:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    target: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    shield: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    eye:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    clock:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  const BADGES = [
    { id: 'sharp',     icon: _B.zap,    name: 'Sharp',        desc: '70%+ accuracy on any event',        check: () => pickHistory.some(e => e.pct >= 70) },
    { id: 'perfect',   icon: _B.check,  name: 'Perfect Card', desc: '100% correct on an event',           check: () => pickHistory.some(e => e.pct === 100 && e.total >= 3) },
    { id: 'veteran',   icon: _B.shield, name: 'Veteran',      desc: 'Picked 5+ events',                   check: () => pickHistory.length >= 5 },
    { id: 'rater',     icon: _B.star,   name: 'Critic',       desc: 'Rated 5+ events',                    check: () => ratings.length >= 5 },
    { id: 'dayone',    icon: _B.clock,  name: 'Day One',      desc: 'Early adopter (joined before 2026)',  check: () => new Date(user.created_at) < new Date('2026-01-01') },
    { id: 'picker',    icon: _B.target, name: 'Pick Master',  desc: '30+ total picks across all events',  check: () => totalPicksAll >= 30 },
    { id: 'darkhorse', icon: _B.zap,    name: 'Dark Horse',   desc: 'Correctly called an underdog win',   check: () => hasDarkHorse },
    { id: 'hothand',   icon: _B.trend,  name: 'Hot Hand',     desc: '5-event winning streak',             check: () => currentStreak >= 5 },
    { id: 'upsetking', icon: _B.star,   name: 'Upset King',   desc: 'Called 3+ upsets across all events', check: () => upsetCount >= 3 },
    { id: 'eyes',      icon: _B.eye,    name: 'Analyst',      desc: 'Viewed results after every event',   check: () => pickHistory.length >= 3 },
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
    const avatarHtml = profileAvatarUrl
      ? `<img class="pr-avatar-img" src="${esc(profileAvatarUrl)}" alt="${esc(user.display_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
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
            <button class="pr-avatar-upload-btn" id="prAvatarUploadBtn" title="Change photo">📷</button>
            <input type="file" id="prAvatarInput" accept="image/*" style="display:none">
          </div>
          <div class="pr-info">
            <div class="pr-label">Fighter Profile</div>
            <h1 class="pr-name">${esc(user.display_name || 'Fighter')}</h1>
            <span class="pr-tier-badge">${computeTier(totalJudged, overallAccuracy)}</span>
            ${buildTierProgress(totalJudged, overallAccuracy)}
            <div class="pr-meta-row">
              <span class="pr-meta-item">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Member since ${memberSince(user.created_at || new Date().toISOString())}
              </span>
            </div>
            ${buildFollowRow()}
            <div class="pr-action-row">
              <button class="pr-challenge-btn pr-challenge-find-btn" id="prFindChallengeBtn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>
                Challenge Someone
              </button>
              <button class="pr-share-btn" id="prShareBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share Profile
              </button>
            </div>
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
          <div class="pr-stat">
            <div class="pr-stat-num" id="statStreak">${currentStreak}${currentStreak >= 3 ? '<span class="pr-streak-badge">HOT</span>' : ''}</div>
            <div class="pr-stat-lbl">Current Streak</div>
          </div>
          <div class="pr-stat">
            <div class="pr-stat-num" id="statBestStreak">${bestStreak}</div>
            <div class="pr-stat-lbl">Best Streak</div>
          </div>
          ${myChTotal > 0 ? `<div class="pr-stat">
            <div class="pr-stat-num pr-stat-h2h">${myChWins}<span class="pr-stat-h2h-sep">-</span>${myChLosses}${myChTies > 0 ? `<span class="pr-stat-h2h-sep">-</span>${myChTies}` : ''}</div>
            <div class="pr-stat-lbl">H2H Record</div>
          </div>` : ''}
        </div>
      </div>

      <!-- BODY -->
      <div class="pr-body">
        ${buildBadgesSection()}
        ${buildRatingsSection()}
        ${buildPickHistorySection()}
        ${buildWcSection()}
        ${buildFavsSection()}
        ${buildNotifPrefsCard()}
        ${buildDangerZone()}
      </div>

      ${buildModal()}
    `;

    animateStats();
    attachEvents();

    const avatarBtn = document.getElementById('prAvatarUploadBtn');
    const avatarInput = document.getElementById('prAvatarInput');
    if (avatarBtn && avatarInput && sb && user?.id) {
      avatarBtn.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
        avatarBtn.textContent = '⏳';
        avatarBtn.disabled = true;
        try {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `${user.id}/avatar.${ext}`;
          const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path);
          await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
          const img = document.querySelector('.pr-avatar-img');
          if (img) { img.src = publicUrl; img.style.display = 'block'; }
          const initEl = document.querySelector('.pr-avatar-initials');
          if (initEl) initEl.style.display = 'none';
          avatarBtn.textContent = '✓';
          setTimeout(() => { avatarBtn.textContent = '📷'; avatarBtn.disabled = false; }, 2000);
        } catch(e) {
          console.error(e);
          avatarBtn.textContent = '📷';
          avatarBtn.disabled = false;
          alert('Upload failed. Make sure the avatars storage bucket exists in Supabase.');
        }
      });
    }
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

  function buildWcSection() {
    if (wcList.length < 2) return '';
    return `
      <div class="pr-section" style="animation-delay:0.2s">
        <div class="pr-section-title">Accuracy by Weight Class</div>
        <div class="pr-wc-list">
          ${wcList.slice(0, 5).map(({wc, pct, total}) => `
            <div class="pr-wc-row">
              <div class="pr-wc-name">${esc(wc)}</div>
              <div class="pr-wc-bar-wrap">
                <div class="pr-wc-bar" style="width:${pct}%"></div>
              </div>
              <div class="pr-wc-pct">${pct}%</div>
              <div class="pr-wc-total">${total} picks</div>
            </div>`).join('')}
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
      </div>

      <!-- Challenge user search overlay -->
      <div class="pr-modal-backdrop" id="challengeSearchModal" style="display:none">
        <div class="pr-modal pr-ch-search-modal">
          <div class="pr-modal-header">
            <div class="pr-modal-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;opacity:0.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>
              Challenge Someone
            </div>
            <button class="pr-modal-close" id="chSearchClose">✕</button>
          </div>
          <div class="pr-modal-search">
            <input type="text" id="chUserSearch" placeholder="Search by username…" autocomplete="off" />
          </div>
          <div class="pr-ch-search-hint">Or pick from top community pickers</div>
          <div class="pr-modal-list" id="chUserList">
            <div class="pr-ch-loading">Loading…</div>
          </div>
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
        <button class="pr-fav-remove" data-id="${esc(f.id)}" title="Remove">✕</button>
        <div class="pr-fav-card-inner">
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
        </div>`;
      grid.appendChild(card);
    });

    // Empty state hint
    if (favIds.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'width:100%;padding:0 0 10px;font-family:Inter,sans-serif;font-size:.78rem;color:rgba(255,255,255,.28);line-height:1.5';
      hint.textContent = 'Add your favourite fighters to track their next fights here.';
      grid.appendChild(hint);
    }

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

    if (picksEl && totalPicksAll > 0) {
      let cur = 0;
      const step = () => {
        cur = Math.min(cur + Math.ceil(totalPicksAll / 22), totalPicksAll);
        picksEl.textContent = cur;
        if (cur < totalPicksAll) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else if (picksEl) { picksEl.textContent = totalPicksAll; }
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
        const fighter = fighters.find(x => x.id === id);
        const name = fighter?.name || 'this fighter';
        showRemoveConfirm(name, () => {
          const favs = getFavs().filter(x => x !== id);
          saveFavs(favs);
          renderFavs();
        });
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

    // ── Challenge someone: user search overlay ──
    let allCommunityUsers = [];

    async function openChallengeSearch() {
      const modal = document.getElementById('challengeSearchModal');
      if (!modal) return;
      modal.style.display = 'flex';
      document.body.classList.add('no-scroll');
      document.getElementById('chUserSearch').value = '';

      if (!allCommunityUsers.length) {
        try {
          const sb = window._sb;
          const myId = user.id;
          const { data } = await sb.from('profiles')
            .select('id, display_name, avatar_url')
            .neq('id', myId)
            .limit(50);
          allCommunityUsers = (data || []).filter(u => u.display_name);
        } catch {}
      }
      renderChallengeUserList('');
    }

    function closeChallengeSearch() {
      const modal = document.getElementById('challengeSearchModal');
      if (modal) modal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }

    function renderChallengeUserList(query) {
      const list = document.getElementById('chUserList');
      if (!list) return;
      const filtered = query
        ? allCommunityUsers.filter(u => (u.display_name || '').toLowerCase().includes(query))
        : allCommunityUsers;

      if (!filtered.length) {
        list.innerHTML = `<div class="pr-ch-empty">No users found</div>`;
        return;
      }
      list.innerHTML = filtered.map(u => {
        const initials = (u.display_name || '?').slice(0, 2).toUpperCase();
        const avatarHtml = u.avatar_url
          ? `<img src="${esc(u.avatar_url)}" class="pr-ch-avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : '';
        return `
          <div class="pr-ch-user-row" data-uid="${esc(u.id)}" data-uname="${esc(u.display_name || 'Fighter')}">
            <div class="pr-ch-avatar-wrap">
              ${avatarHtml}
              <div class="pr-ch-avatar pr-ch-avatar-init" style="${u.avatar_url ? 'display:none' : ''}">${initials}</div>
            </div>
            <div class="pr-ch-user-name">${esc(u.display_name || 'Fighter')}</div>
            <button class="pr-ch-send-btn">Challenge</button>
          </div>`;
      }).join('');

      list.querySelectorAll('.pr-ch-user-row').forEach(row => {
        row.querySelector('.pr-ch-send-btn').addEventListener('click', e => {
          e.stopPropagation();
          const uid = row.dataset.uid;
          const uname = row.dataset.uname;
          closeChallengeSearch();
          window.openChallengeModal?.(uid, uname);
        });
      });
    }

    document.getElementById('prFindChallengeBtn')?.addEventListener('click', openChallengeSearch);
    document.getElementById('chSearchClose')?.addEventListener('click', closeChallengeSearch);
    document.getElementById('challengeSearchModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('challengeSearchModal')) closeChallengeSearch();
    });
    document.getElementById('chUserSearch')?.addEventListener('input', e => {
      renderChallengeUserList(e.target.value.toLowerCase().trim());
    });

    const shareBtn = document.getElementById('prShareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const profileUrl = `${location.origin}/profile.html?user=${encodeURIComponent(user.id)}`;
        const shareData = {
          title: 'MMA Bridge Profile',
          text: `Check out my UFC picks on MMA Bridge!`,
          url: profileUrl,
        };
        if (navigator.share && navigator.canShare?.(shareData)) {
          try { await navigator.share(shareData); } catch {}
        } else {
          try {
            await navigator.clipboard.writeText(profileUrl);
            shareBtn.textContent = '✓ Copied!';
            shareBtn.classList.add('copied');
            setTimeout(() => {
              shareBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share Profile`;
              shareBtn.classList.remove('copied');
            }, 2000);
          } catch {}
        }
      });
    }

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

  function showRemoveConfirm(name, onConfirm) {
    document.getElementById('pr-remove-confirm')?.remove();
    const el = document.createElement('div');
    el.id = 'pr-remove-confirm';
    el.className = 'pr-modal-backdrop';
    el.innerHTML = `
      <div class="pr-confirm-box">
        <div class="pr-confirm-title">Remove Fighter?</div>
        <div class="pr-confirm-body">Remove <strong>${esc(name)}</strong> from your corner?</div>
        <div class="pr-confirm-actions">
          <button class="pr-confirm-cancel">Keep</button>
          <button class="pr-confirm-yes">Remove</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.pr-confirm-yes').addEventListener('click', () => { el.remove(); onConfirm(); });
    el.querySelector('.pr-confirm-cancel').addEventListener('click', () => el.remove());
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  }

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

  // ── Accuracy sparkline ────────────────────────────────────────────────────
  function buildSparkline(evList) {
    const pts = evList.slice(0, 12).reverse(); // oldest → newest, max 12 events
    const W = 260, H = 56, PAD = 6;
    const xStep = pts.length > 1 ? (W - PAD * 2) / (pts.length - 1) : W;
    const yScale = (pct) => PAD + (H - PAD * 2) * (1 - pct / 100);

    const coords = pts.map((pct, i) => ({
      x: PAD + i * xStep,
      y: yScale(pct),
      pct
    }));

    const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath = `M${coords[0].x.toFixed(1)},${H} ` +
      coords.map(c => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
      ` L${coords[coords.length-1].x.toFixed(1)},${H} Z`;

    const midY = yScale(50).toFixed(1);
    const last = coords[coords.length - 1];
    const lastColor = last.pct >= 50 ? '#00e5ff' : '#ef4444';

    const dots = coords.map((c, i) => i === coords.length - 1
      ? `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${lastColor}" stroke="#111114" stroke-width="1.5"/>`
      : `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2" fill="rgba(0,229,255,0.4)"/>`
    ).join('');

    return `
      <div class="pr-sparkline-wrap pr-section" style="animation-delay:0.08s" data-reveal>
        <div class="pr-sparkline-label">Pick Accuracy — Last ${pts.length} Events</div>
        <svg class="pr-sparkline-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#00e5ff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line class="pr-sparkline-midline" x1="${PAD}" y1="${midY}" x2="${W - PAD}" y2="${midY}"/>
          <path class="pr-sparkline-area" d="${areaPath}"/>
          <polyline class="pr-sparkline-line" points="${polyline}"/>
          ${dots}
        </svg>
      </div>`;
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
