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

All three navigate a real headless Chrome to the **live site** and
screenshot the actual rendered element — never guessed selectors,
never fabricated captions. Captions for the event types are built from
`data/events.json` directly (matchup, date, result), not scraped page
text, since that data is already verified.

**News caption** is read straight off the rendered card's own DOM text
(`.nc-title-N` / `.nc-source-N`) rather than a separate GNews API call,
so it always matches exactly what's in the screenshot.

## Content style rules (explicit user requirement)

- **No em dashes** in any caption — use a period, comma, or plain hyphen.
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

## Instagram auto-posting (no approval step)

`.github/workflows/social-autopost.yml` runs `scripts/social-autopost.js`
5x a day (18:30, 20:30, 22:30, 00:30, 02:30 UTC = 11:30am-7:30pm PT) and
posts the **next** unposted item from `social/latest.json`, one per run,
through the backend's `/api/admin/marketing/post` endpoint (same one the
admin button uses; Instagram credentials stay on Render). Logs in with
the `ADMIN_PASSWORD` GitHub secret, which must match Render's.

- Priority per run: event countdown, then event recap, then news.
- Dedupe log: `social/posted.json` (committed by the workflow).
  - news: once per headline
  - event_countdown: only at 7 / 3 / 1 / 0 days out, once each
  - event_recap: once per event (latest.json repeats the same recap daily
    until the next event completes)
- Waits for the image to be live on mmabridge.com (Pages deploy lag)
  before posting, since Instagram fetches `image_url` itself.
- A post that fails twice is skipped. Failures turn the Actions run red.
- Won't post if `latest.json` is 2+ days old (generation run failed).
- Manual test: Actions tab > Social Auto-Post > Run workflow > dry run.
- **Instagram tokens expire after 60 days.** If runs start failing with an
  auth/token error, refresh `INSTAGRAM_ACCESS_TOKEN` on Render.

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
