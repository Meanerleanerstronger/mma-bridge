# Daily Social Media Pipeline

Automated content generation for Twitter/Instagram, built to adapt an
existing manual "Marketing Buddy" prototype into a daily pipeline. This
doc covers the frontend half (generation + review). See the Backend
repo's `MARKETING_SETUP.md` for the posting/API-credentials half.

## On-demand generators (not part of the daily run)

Three admin.html tools let you assemble a graphic yourself instead of
waiting for the daily pipeline, all sharing the same fighter search
(`data/fighters.json`, typo/accent-tolerant):

- **Dream H2H Poster** — pick any two fighters (booked or not), style
  (wide Banner or fight-card-style Classic), theme (dark/light). "Open
  Poster" previews in a new tab. "Generate for Instagram" actually
  renders it server-side via `generate-h2h-poster.yml` (workflow_dispatch,
  triggered by the backend's `/api/admin/marketing/generate-h2h-poster`)
  and appends it to `social/manual-queue.json` — polled from admin.html
  and shown as a normal review card once ready (~60-90s).
- **Fight Card Builder** — add multiple bouts, tag each with a section
  (Main Card/Co-Main/Prelims/Early Prelims), preview a full event-card
  graphic via `fightcard.html?mode=card`.
- **Next Fight to Make** — stack a few dream matchups into a listicle-
  style graphic via `fightcard.html?mode=next`, e.g. for a "what should
  get booked next" post.

Card Builder and Next Fight to Make currently only support the "Open
Preview" (new tab, screenshot-yourself) flow, not the server-side
Generate-for-Instagram automation Dream H2H has — that would need
`scripts/generate-h2h-poster.js` generalized to target `fightcard.html`
with an arbitrary bout list instead of a single named matchup.

Both `fightcard.html` and the poster-mode/classic-mode URLs on
`matchup.html` accept `?theme=light|dark` so a script can pick the theme
without a click — needed since these are also driven headlessly by the
generation script, not just browsed manually.

## What it does

Every day, `.github/workflows/social-post-daily.yml` runs
`scripts/social-post-daily.js`, which builds **all** of these (high
volume — this used to rotate one type per day, it doesn't anymore):

| Type | Count/day | Source | What it screenshots |
|---|---|---|---|
| `news` | up to 3 | index.html's "Trending Today" section | `#news-card-0/1/2 .card-image` (just the photo, not the whole card) |
| `event_countdown` | 1 | next upcoming event in `data/events.json` | `#ovHero` on `events.html?id=...` |
| `event_recap` | 1 | most recently completed event in `data/events.json` | `.er-hero` on `event-review.html?id=...` |
| data cards | 0-6 | see next-but-one section | rendered templates |

All three navigate a real headless Chrome to the **live site** and
screenshot the actual rendered element — never guessed selectors,
never fabricated captions. Captions for the event types are built from
`data/events.json` directly (matchup, date, result), not scraped page
text, since that data is already verified.

**News caption** is read straight off the rendered card's own DOM text
(`.nc-title-N` / `.nc-source-N`) rather than a separate GNews API call,
so it always matches exactly what's in the screenshot.

## Content style rules (explicit user requirement)

- **No em dashes** in any caption. Use a period, comma, or plain hyphen.
  Enforced automatically by `cleanCaption()` (scripts/social-shared.js),
  applied at generation and again right before posting, since scraped
  news headlines are full of them. Also strips emojis.
- **No emojis** — the pipeline's own captions and the AI "Generate
  Content" feature (backend `/api/admin/marketing/generate`) both
  enforce this. The AI path also has a server-side strip as a backstop
  since LLMs reach for em dashes constantly regardless of prompt
  instructions telling them not to.

## Known gotchas already hit and fixed (don't re-introduce)

0. **Any image added to `social/latest.json` for "Post to Instagram" must
   be between 4:5 and 1.91:1 aspect ratio** — Instagram's Graph API
   rejects anything outside that with a 400 "aspect ratio is not
   supported" error (code 36003). `matchup.html`'s poster-view hero is a
   wide banner (~3.2:1 raw) — screenshotting it straight into
   `social/` without compositing (like the news/event types do via
   `finalizePoster`/`finalizePosterBlurredBackdrop`) will pass this exact
   error at post time, not at generation time, so it looks fine in the
   admin review card until someone actually clicks Post. Composite it
   down to a compliant ratio first — for this wide a source, padding to
   1080x565 (1.91:1) with a solid color sampled from a corner pixel wastes
   far less space than forcing it into a 4:5 portrait frame.
1. **Floating widgets bleed into screenshots.** `#lw-widget`/`#lw-tab`
   (the "Live on MMA Bridge" activity widget) and `#lw-btn`/`#lw-window`
   (Lucas chat launcher) are `position:fixed`. Puppeteer's element
   screenshot auto-scrolls to bring the target into view, and a fixed
   widget stays pinned through that scroll — it can land right on top
   of the capture depending on where the target ends up. Always call
   `hideFloatingWidgets(page)` before screenshotting.
2. **The events.html overlay's own nav buttons** (Pick Fights / Calendar
   / Close — `.ov-topbar`) sit inside `#ovHero` and get captured too if
   not hidden. Hide `.ov-topbar` before screenshotting event pages.
3. **News: screenshot the photo only, not the whole card.** The full
   `.medium-card` is roughly 2:1 (photo + text block), nowhere near the
   4:5 target — cover-cropping the whole thing chopped the headline off
   mid-sentence. The headline/source go out as the *caption*, not baked
   into the image, so there's no need to keep them legible in the photo.
4. **Event hero screenshots are landscape; the target is portrait
   (4:5).** Plain cover-cropping either zoomed hard into one fighter's
   face or cut the other one out. Fixed with a blurred-backdrop +
   fully-visible-foreground composite (`finalizePosterBlurredBackdrop`)
   instead — nothing gets cropped out, still looks full-bleed.
5. **Only 3 news cards really exist in the DOM** (`#news-card-0/1/2`).
   Extra articles beyond that live in `window._newsQueue` (script.js)
   and only ever swap in if one of the 3 visible images breaks — they
   are not additional visible cards. Don't try to pull a 4th.

## Review + posting flow (admin.html, "Marketing Buddy" tab)

- Reads `social/latest.json` directly (same-origin static fetch, no
  backend call needed) and renders one card per post, each tagged with
  its type (News / Event Countdown / Event Recap).
- Each card: **Copy Caption** (textarea is editable — always copies/
  posts whatever's currently typed, not the original generated text),
  **Change Image** (swap in a local file for preview/download only —
  Instagram posting still uses the original auto-generated image since
  a locally-picked file has no public URL for Instagram's API to
  fetch), **Download Image** (fetches as a blob + object URL, not the
  `<a download>` attribute — Safari routinely ignores that attribute
  for images and just opens them in a new tab instead), **Post to
  Instagram** (calls the existing `/api/admin/marketing/post` endpoint
  directly).
- **Twitter is manual only** — X's API now charges per post
  (pay-per-use credits) on this app, so there's no auto-post button for
  it. Copy the caption + download the image and post it yourself.
- The generation workflow itself only generates + commits. Instagram
  posting is automatic (next section); clicking "Post to Instagram" here
  on something the bot already posted will post it a second time.

## Data-driven card posts (`scripts/social-data-posts.js`)

Rendered from HTML templates in `scripts/social-cards.js` (1080x1350,
dark, site accent + Barlow Condensed, logo top-left), not screenshotted
off a live page. Each type decides itself whether today applies:

| Type | When | Data |
|---|---|---|
| `tale_of_tape` | 2 days before an event | main event ufcstats numbers from fighters.json; skipped if either fighter has no `stats` |
| `picks_lock` | last daily run 3-27h before `start_time` | event poster bg, lock time in ET; `expiresAt` = lock so it never posts late |
| `pick_split` | same window as picks_lock | community pick % on main event |
| `upset` | within 4 days after an event | lowest-picked winner (must be under 50%) + main event crowd verdict in caption |
| `dream_matchup` | Wednesdays (UTC) | two of champion/top 5 in a division, not in each other's last 10 fights, not booked; rotates division weekly |
| `on_this_day` | when a completed event in events.json has today's month-day in an earlier year | main event result |

- **Community pick numbers stay private until they're flattering.**
  Picks come from the backend's public `/api/leaderboard?period=all`
  (anon Supabase key can't read others' picks). `pick_split` and the
  picks_lock "N fans locked in" line need 30+ picks on the main event,
  `upset` needs 20+ on the fight. At launch volume (~5 picks per main
  event) they stay silent and switch on by themselves as usage grows.
- Names use billing surnames: suffixes kept ("Rosas Jr."), Chinese
  names family-name-first ("Wang Cong" -> "Wang").
- Preview any type locally: `FORCE_TYPE=tale_of_tape node scripts/social-post-daily.js`
  (FORCE relaxes day gates and pick minimums, so previews may show data
  that wouldn't post for real).
- Fighter photos are sized by height (`img{height:100%}`), not
  max-height: the cutouts are small and max-* never scales up.

## Instagram auto-posting (no approval step)

`.github/workflows/social-autopost.yml` runs `scripts/social-autopost.js`
5x a day (18:30, 20:30, 22:30, 00:30, 02:30 UTC = 11:30am-7:30pm PT) and
posts the **next** unposted item from `social/latest.json`, one per run,
through the backend's `/api/admin/marketing/post` endpoint (same one the
admin button uses; Instagram credentials stay on Render). Logs in with
the `ADMIN_PASSWORD` GitHub secret, which must match Render's.

- Priority per run: picks_lock, upset, pick_split, event_countdown,
  tale_of_tape, event_recap, dream_matchup, on_this_day, news.
- Dedupe log: `social/posted.json` (committed by the workflow).
  - news: once per headline
  - event_countdown: only at 7 / 3 / 1 days out (fight day = picks_lock)
  - data card types: once per event / matchup
  - posts with `expiresAt` are dropped once it passes
  - event_recap: once per event (latest.json repeats the same recap daily
    until the next event completes)
- Waits for the image to be live on mmabridge.com (Pages deploy lag)
  before posting, since Instagram fetches `image_url` itself.
- A post that fails twice is skipped. Failures turn the Actions run red.
- **Minimum 3 posts/day.** Two layers:
  1. Generation tops the day up to 5 new postable items (one per slot)
     with filler dream matchups (`buildFillerPosts`, marked `filler: true`)
     that haven't been posted before. 100+ pairings in the pool.
  2. Autopost catch-up: if skipped/failed slots mean the day can't reach
     `MIN_DAILY` (3) with the slots left, the current run posts extra.
     `SLOT_HOURS` in social-autopost.js must match the workflow cron.
- Won't post if `latest.json` is 2+ days old (generation run failed).
- Manual test: Actions tab > Social Auto-Post > Run workflow > dry run.
- **Instagram tokens expire after 60 days.** If runs start failing with an
  auth/token error, generate a new long-lived token and replace
  `INSTAGRAM_ACCESS_TOKEN` on Render. Token/account errors are not counted
  as post attempts, so everything queued posts once the token is fixed.
  (Expired 2026-09-27; no auto-refresh yet.)

## Caption rule: always credit MMA Bridge

Every caption ends with a line naming the exact MMA Bridge page the image
was screenshotted from (Trending Today feed / event page / event review),
then `Link in bio: mmabridge.com`, since Instagram captions don't make
URLs clickable. Built by `withSourceLine()` in social-post-daily.js; any
new content type must use it too.

## Testing locally

```
FORCE_TYPE=news node scripts/social-post-daily.js
FORCE_TYPE=event_countdown node scripts/social-post-daily.js
FORCE_TYPE=event_recap node scripts/social-post-daily.js
# omit FORCE_TYPE to build everything, same as the real daily run
node scripts/social-post-daily.js
```

Needs `puppeteer` + `sharp` (already in `package.json`) and network
access to `mmabridge.com` (set `SITE_URL` env var to point elsewhere,
e.g. localhost, if needed).

## If a new content type ever needs adding

Same rule as everything else in this repo: **check the real page/
selector before writing scraping logic.** Don't guess. Every content
type above was built by first reading the actual rendered HTML/CSS,
then verified by actually looking at the generated image before
shipping — every single "obviously fine" first attempt this session
needed at least one visual fix once actually screenshotted.
