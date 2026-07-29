#!/usr/bin/env node
/**
 * social-publish.js
 * Runs AFTER social-post-daily.js has generated social/<date>-<type>.png
 * and social/latest.json, AND after the workflow has committed + pushed
 * that image so GitHub Pages can serve it.
 *
 * 1. Polls the now-public image URL until it actually 200s (Pages deploys
 *    aren't instant — posting to Instagram with a URL that 404s fails the
 *    whole thing).
 * 2. Logs into the backend's admin API to get a token
 *    (POST /api/admin/auth — the existing password-based admin flow, same
 *    one the admin dashboard uses; there's no separate static-token path).
 * 3. Posts to Twitter (required — job fails if this fails) and Instagram
 *    (best-effort — Instagram credentials aren't set up on Render yet as
 *    of this being written, so a "not configured" response here is
 *    expected and shouldn't fail the job; a real posting failure still
 *    should be visible in the logs, just not fatal).
 *
 * If latest.json doesn't exist (today's content type isn't implemented
 * yet — see social-post-daily.js), this is a clean no-op.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR       = path.join(__dirname, '..', 'social');
const SIDECAR_PATH  = path.join(OUT_DIR, 'latest.json');

const SITE_URL     = process.env.SITE_URL || 'https://mmabridge.com';
const BACKEND_URL  = process.env.BACKEND_URL || 'https://mmabridge-backend.onrender.com/api';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilLive(url, { attempts = 20, delayMs = 15000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return true;
    } catch {}
    console.log(`  waiting for ${url} to go live... (${i}/${attempts})`);
    await sleep(delayMs);
  }
  return false;
}

async function getAdminToken() {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var not set — cannot authenticate to backend');
  const res = await fetch(`${BACKEND_URL}/admin/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(`Admin auth failed: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function postTo(platform, token, content, imageUrl) {
  const res = await fetch(`${BACKEND_URL}/admin/marketing/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform, content, image_url: imageUrl }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, ...data };
}

async function main() {
  if (!fs.existsSync(SIDECAR_PATH)) {
    console.log('No social/latest.json found — nothing to publish today.');
    return;
  }

  const sidecar = JSON.parse(fs.readFileSync(SIDECAR_PATH, 'utf8'));
  const imageUrl = `${SITE_URL}/social/${sidecar.image}`;
  console.log(`Publishing ${sidecar.type} post: "${sidecar.caption}"`);
  console.log(`Image URL: ${imageUrl}`);

  const live = await waitUntilLive(imageUrl);
  if (!live) {
    throw new Error(`Gave up waiting for ${imageUrl} to go live — GitHub Pages deploy may be stuck or the commit step failed`);
  }

  const token = await getAdminToken();

  const twitterResult = await postTo('twitter', token, sidecar.caption, imageUrl);
  if (!twitterResult.ok) {
    throw new Error(`Twitter post failed: ${twitterResult.error || JSON.stringify(twitterResult)}`);
  }
  console.log(`✅ Posted to Twitter: ${twitterResult.url || '(no url returned)'}`);

  const igResult = await postTo('instagram', token, sidecar.caption, imageUrl);
  if (igResult.ok) {
    console.log(`✅ Posted to Instagram: media_id ${igResult.media_id || '(unknown)'}`);
  } else {
    // Expected until INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID are set on
    // Render — log clearly but don't fail the job over it.
    console.log(`⚠️  Instagram post skipped/failed: ${igResult.error || JSON.stringify(igResult)}`);
  }
}

main().catch(e => {
  console.error('social-publish failed:', e.message);
  process.exit(1);
});
