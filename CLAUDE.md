# MMA Bridge — Claude Context File

## Project Overview
MMA Bridge (mmabridge.com) is a UFC pick'em fan site. Vanilla JS frontend (no framework), single `style.css`, Supabase for all DB/auth. Users pick fight winners before events lock, earn accuracy-based tier rankings, join private groups for season-long leagues.

## Tech Stack
- **Frontend**: Vanilla JS, HTML, CSS — no build step, no framework
- **Database/Auth**: Supabase (client-side SDK via `window._sb`)
- **Backend API**: `https://mmabridge-backend.onrender.com/api` — Render free tier, cold-starts ~30s
- **Fighter News API**: `https://mmabridge.onrender.com/api/news/fighter?name=...`
- **Hosting**: GitHub Pages or similar static host at mmabridge.com

## Key Files
| File | Purpose |
|---|---|
| `events.html` | Main events page users actually see — card grid + overlay. Has inline `<script>` with `buildCard()`, `openOverlay()`, `loadHypeBadges()` |
| `events.js` | OLD accordion events system — separate page, mostly legacy |
| `picks.html` / `picks.js` | Pick'em game UI — hype widget, fight cards, pick submission |
| `leaderboard.html` / `leaderboard.js` | Community + group leaderboard, H2H challenges, group management |
| `profile.html` / `profile.js` | User profiles — fav fighters, stats, recent picks |
| `style.css` | All styles — single file |
| `fighters.json` / `data/fighters.json` | Fighter data including headshot URLs |
| `events.json` / `data/events.json` | Event data (fights, dates, etc.) |
| `auth.html` / `auth.js` | Login/signup |
| `admin.html` | Admin panel for entering fight results, plus "Marketing Buddy" tab for daily social content review/posting |
| `config.js` | Supabase keys, `window._sb` init |
| `scripts/social-post-daily.js` | Daily social pipeline (news/event countdown/recap posters) — see `SOCIAL_PIPELINE.md` |

## Supabase Tables (Key Columns)
### `profiles`
- `id` UUID (= auth user id)
- `display_name TEXT`
- `avatar_url TEXT`
- `fav_fighters JSONB` — array of fighter IDs
- `group_code TEXT` — which group the user is in
- `group_name TEXT` — group display name
- `group_is_owner BOOLEAN DEFAULT FALSE` — true for group creator/commissioner
- `group_season_start TEXT` — ISO date string for season start (set by commissioner)
- `email_opt_out BOOLEAN` — gates ALL email types (weekly digest, pick/review reminders, rankings update, favorite-fighter alerts), not just the digest
- `walkout_song TEXT` — user-set "Song — Artist" string shown on their own profile hero (replaced the old tier badge/progress bar)

### `picks`
- `user_id UUID`
- `event_id TEXT`
- `fight_id TEXT`
- `pick TEXT` — fighter name picked
- `is_correct BOOLEAN` (null until result entered)
- `created_at TIMESTAMPTZ`

### `event_ratings` (hype ratings)
- `user_id UUID`
- `event_id TEXT`
- `rating INTEGER` (1–10)

## Critical Patterns

### Pick Locking
```javascript
const isLocked = !isCompleted && !!event.start_time && new Date() >= new Date(event.start_time);
```
Picks lock when current time >= event start_time. Completed events are always read-only.

### Season Filtering
`buildStatsMap(picks, cutoff, allowedEventIds)` in leaderboard.js filters picks by date.
- `cutoff` = ISO date string from `group_season_start`
- Pass `null` for no cutoff (all-time)

### Group/League System
- Commissioner = user with `group_is_owner: true`
- Invite link: `mmabridge.com/leaderboard.html?join=CODE`
- Auto-join modal opens if `?join=CODE` is in URL and user has no group
- Commissioner can: remove members, set season start date
- Season start filters all group leaderboard stats to picks after that date

### Hype Ratings (1–10)
- `events.html`: `loadHypeBadges()` fetches after cards render; `openOverlay()` fetches for overlay panel
- `picks.js`: `loadEventExtras()` with 3s retry on Render cold-start
- `HYPE_LABELS = ['', 'MEH', 'SLEEPER', 'LOW KEY', 'BUILDING', 'DECENT', 'SOLID', 'HYPED', 'VERY HYPED', 'ELITE', 'MUST-SEE']`

### Favorite Fighters (profile.js)
Use `upsert()` not `update()` — `update()` silently fails if no row exists:
```javascript
sb.from('profiles').upsert({ id: user.id, fav_fighters: ids }).catch(() => {});
```

### Special Event Styling
`SPECIAL_EVENTS` in events.html maps event IDs to accent colors (overlay hero only, NOT cards):
```javascript
const SPECIAL_EVENTS = {
  'ufc-fight-night-song-vs-figueiredo': { accent:'#00ff88', glowColor:'rgba(0,255,136,.22)' }
};
```

## Tier System
Ranks users by accuracy (% correct of judged picks):
- Rookie → Candidate → Iron → Bronze → Silver → Gold → Platinum → Diamond → Legend
- Needs ≥10 judged picks to leave Candidate

## SQL Migrations Required (run in Supabase SQL editor)
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_is_owner BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_season_start TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS walkout_song TEXT;
```

## Common Gotchas
1. **events.html vs events.js** — Users see events.html. events.js is the old accordion page. Don't confuse them.
2. **Render cold-start** — Backend API at mmabridge-backend.onrender.com sleeps after inactivity. First request takes ~30s. picks.js has a 3s retry for hype ratings to handle this.
3. **fav_fighters type** — Can be JSONB array or stringified JSON depending on how it was saved. profile.js has a fallback parser for both.
4. **Group leaderboard** uses season cutoff; global leaderboard uses period tabs (All Time / Month / Week / Last 10). They are separate render paths.
5. **View Picks** on leaderboard requires `?event=EVENT_ID` in URL — the picks page Leaderboard button passes this automatically.
6. **upsert vs update** — Always use `upsert` for profile writes. `update` silently no-ops if no row exists for the user.

## Key URLs / Navigation Flow
- `/events.html` → click card → overlay with fight card, picks, hype, headshots
- `/picks.html?event=EVENT_ID` → pick submission page
- `/picks.html?event=EVENT_ID` has "Leaderboard" button → `/leaderboard.html?event=EVENT_ID`
- `/leaderboard.html?join=CODE` → auto-opens join group modal
- `/profile.html?id=USER_ID` → public profile view

## What's Still Needed for Full Year of Play
- **Results admin workflow**: admin.html needs a UI to enter `is_correct` for each pick after events conclude
- **Push notification reminders**: "Event locks in 24h" browser push or email
- **Season reset**: Commissioner can reset stats to start a new season (clears season start or sets new date)
- **Sponsor/export**: CSV export of member stats for sponsor reporting
- **Multiple groups**: Currently one group per user — no multi-group support
- **Tiebreaker**: When two users are tied on accuracy, ranking is arbitrary
- **Result verification**: No way to contest or audit incorrect result entries
- **Mobile PWA install prompt**: manifest.json exists but no install nudge in UI
