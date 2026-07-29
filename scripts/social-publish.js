#!/usr/bin/env node
/**
 * social-publish.js
 * Runs AFTER social-post-daily.js has generated social/<date>-<type>.png
 * and social/latest.json, AND after the workflow has committed + pushed
 * that image so GitHub Pages can serve it.
 *
 * Twitter is NOT auto-posted here anymore: X moved posting behind a
 * pay-per-use credits wall on this app, and posting manually was chosen
 * instead — review + copy the caption + download the image from the
 * "Today's Auto-Generated Post" card in admin.html's Marketing Buddy tab,
 * then post it yourself. That page reads social/latest.json directly, so
 * this script's only remaining jobs are:
 *
 * 1. Poll the now-public image URL until it actually 200s (Pages deploys
 *    aren't instant), so the admin page + Instagram both see a working URL.
 * 2. Best-effort post to Instagram, if INSTAGRAM_ACCESS_TOKEN and
 *    INSTAGRAM_ACCOUNT_ID are set on Render (Instagram's Graph API has no
 *    per-post cost, unlike Twitter's current API) — a "not configured"
 *    response is expected and normal until those are set up, and never
 *    fails the job either way.
 *
 * Never exits with a failure code — a publish hiccup shouldn't block the
 * daily image from being generated and available for manual posting.
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
    console.log(`⚠️  Gave up waiting for ${imageUrl} to go live — GitHub Pages deploy may be stuck. The image/caption are still committed, just not confirmed reachable yet; the admin page will still show them once Pages catches up.`);
    return;
  }
  console.log(`Image is live.`);

  let token;
  try {
    token = await getAdminToken();
  } catch (e) {
    console.log(`⚠️  Could not authenticate to backend, skipping Instagram post: ${e.message}`);
    return;
  }

  const igResult = await postTo('instagram', token, sidecar.caption, imageUrl);
  if (igResult.ok) {
    console.log(`✅ Posted to Instagram: media_id ${igResult.media_id || '(unknown)'}`);
  } else {
    // Expected until INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID are set on
    // Render — log clearly but don't fail the job over it.
    console.log(`⚠️  Instagram post skipped/failed: ${igResult.error || JSON.stringify(igResult)}`);
  }
  console.log(`Reminder: Twitter is manual now — copy the caption + image from admin.html's Marketing Buddy tab and post it yourself.`);
}

main().catch(e => {
  // Never fail the job over a publish hiccup — the image/caption are
  // already generated and committed regardless.
  console.log(`⚠️  social-publish encountered an error (non-fatal): ${e.message}`);
});
