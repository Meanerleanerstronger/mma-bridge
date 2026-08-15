// ==============================================
// MMA BRIDGE — SHARED TIER SYSTEM
// Single source of truth for pick-accuracy tiers, used by
// leaderboard.js, profile.js, and recap.html so tier names/colors
// never diverge between pages.
// ==============================================
window.MMATiers = {
  getTier(judged, pct) {
    if (judged === 0) return { name: 'Walkout',    color: '#666',    rank: 0 };
    if (judged < 10)  return { name: 'Prospect',   color: '#888',    rank: 1 };
    if (pct === null || pct < 40) return { name: 'Ranked',    color: '#8a7560', rank: 2 };
    if (pct < 50)     return { name: 'Contender',  color: '#cd7f32', rank: 3 };
    if (pct < 55)     return { name: 'Main Event', color: '#aaa',    rank: 4 };
    if (pct < 60)     return { name: 'Headliner',  color: '#e06b1a', rank: 5 };
    if (pct < 65 || judged < 30) return { name: 'Champion',  color: '#ff8a3d', rank: 6 };
    if (pct < 70 || judged < 60) return { name: 'P4P',       color: '#ff9a4d', rank: 7 };
    return { name: 'GOAT',      color: '#e06b1a', rank: 8 };
  }
};
