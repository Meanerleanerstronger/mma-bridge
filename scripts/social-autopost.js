/**
 * social-autopost.js — posts the day's generated social content to
 * Instagram with no manual approval step.
 *
 * Runs several times a day from .github/workflows/social-autopost.yml and
 * publishes the next not-yet-posted item from social/latest.json (built by
 * social-post-daily.js), so posts are spread across the day instead of
 * landing all at once. Posting goes through the same backend endpoint the
 * admin.html "Post to Instagram" button uses (/api/admin/marketing/post),
 * so the Instagram credentials stay on Render.
 *
 * Dedupe rules (tracked in social/posted.json):
 *   - news            once per headline
 *   - event_countdown only at 7 / 3 / 1 / 0 days out, once each
 *   - event_recap     once per event (latest.json keeps the same recap
 *                     every day until the next event completes)
 *
 * Env:
 *   ADMIN_PASSWORD  required — same value as on Render
 *   MAX_PER_RUN     posts per run (default 1)
 *   DRY_RUN=1       log what would be posted, post nothing, write nothing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SOCIAL_DIR  = path.join(__dirname, '..', 'social');
const LATEST_PATH = path.join(SOCIAL_DIR, 'latest.json');
const POSTED_PATH = path.join(SOCIAL_DIR, 'posted.json');
const SITE_URL    = process.env.SITE_URL || 'https://mmabridge.com';
const API_BASE    = process.env.API_BASE || 'https://mmabridge-backend.onrender.com';
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 1);
const DRY_RUN     = process.env.DRY_RUN === '1';

const COUNTDOWN_DAYS = [7, 3, 1, 0];
const MAX_ATTEMPTS   = 2; // a post that fails twice is skipped so it can't block the queue forever
const TYPE_ORDER     = ['event_countdown', 'event_recap', 'news'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function dedupeKey(post) {
  return post.ref ? `${post.type}:${post.ref}` : `image:${post.image}`;
}

function isEligible(post) {
  if (post.type === 'event_countdown' && post.days !== undefined) {
    return COUNTDOWN_DAYS.includes(post.days);
  }
  return true;
}

// Don't push out stale content if the daily generation run failed.
function isFresh(dateKey) {
  const ageMs = Date.now() - new Date(dateKey + 'T00:00:00Z').getTime();
  return ageMs < 2 * 86400000;
}

// GitHub Pages takes a minute or two to deploy the image the generation
// run just committed — Instagram fetches image_url itself, so it has to be
// live first.
async function waitForImage(url) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (res.ok) return true;
    } catch {}
    await sleep(30000);
  }
  return false;
}

// Render free tier cold-starts (~30s+), so retry the first call generously.
async function getAdminToken(password) {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) return data.token;
      if (res.status === 401) throw new Error('ADMIN_PASSWORD rejected by backend');
      lastErr = new Error(data.error || `HTTP ${res.status}`);
    } catch (e) {
      if (e.message.includes('rejected')) throw e;
      lastErr = e;
    }
    await sleep(15000);
  }
  throw new Error(`Backend auth failed: ${lastErr?.message}`);
}

async function postToInstagram(token, caption, imageUrl) {
  const res = await fetch(`${API_BASE}/api/admin/marketing/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'instagram', content: caption, image_url: imageUrl }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.media_id || '';
}

async function main() {
  const latest = readJson(LATEST_PATH, null);
  if (!latest?.posts?.length) { console.log('No social/latest.json posts — nothing to do.'); return; }
  if (!isFresh(latest.date)) { console.log(`latest.json is from ${latest.date} — too old, not posting.`); return; }

  const log = readJson(POSTED_PATH, { posted: [], failed: {} });
  log.posted ||= []; log.failed ||= {};
  const done = new Set(log.posted.map(p => p.key));

  const queue = latest.posts
    .filter(isEligible)
    .filter(p => !done.has(dedupeKey(p)))
    .filter(p => (log.failed[dedupeKey(p)]?.attempts || 0) < MAX_ATTEMPTS)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  if (!queue.length) { console.log('Everything eligible from today is already posted.'); return; }
  const batch = queue.slice(0, MAX_PER_RUN);

  if (DRY_RUN) {
    batch.forEach(p => console.log(`[dry run] would post ${p.image}\n${p.caption}\n`));
    return;
  }

  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not set');
  const token = await getAdminToken(process.env.ADMIN_PASSWORD);

  let failures = 0;
  for (const post of batch) {
    const key = dedupeKey(post);
    const imageUrl = `${SITE_URL}/social/${post.image}`;
    try {
      if (!(await waitForImage(imageUrl))) throw new Error(`Image never went live: ${imageUrl}`);
      const mediaId = await postToInstagram(token, post.caption, imageUrl);
      log.posted.push({ key, type: post.type, image: post.image, media_id: mediaId, at: new Date().toISOString() });
      delete log.failed[key];
      console.log(`✅ Posted ${post.image} (media ${mediaId})`);
    } catch (e) {
      failures++;
      const prev = log.failed[key]?.attempts || 0;
      log.failed[key] = { attempts: prev + 1, error: e.message.slice(0, 300), at: new Date().toISOString() };
      console.error(`❌ ${post.image}: ${e.message}`);
    }
  }

  log.posted = log.posted.slice(-500); // keep the file small
  fs.writeFileSync(POSTED_PATH, JSON.stringify(log, null, 2));
  // Non-zero exit so a failed post shows up red in Actions (and emails you).
  if (failures) process.exit(1);
}

main().catch(e => {
  console.error('social-autopost failed:', e.message);
  process.exit(1);
});
