/**
 * instagram-token-refresh.js — keeps the 60-day Instagram access token
 * alive by asking the backend to exchange it for a fresh one (the backend
 * stores it in Supabase app_config; see the Backend repo's
 * marketing_poster.py). Run weekly by instagram-token-refresh.yml.
 *
 * Env: ADMIN_PASSWORD (same as Render).
 */
const API_BASE = process.env.API_BASE || 'https://mmabridge-backend.onrender.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Render free tier cold-starts, so retry the first call.
async function adminToken() {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
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

async function main() {
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not set');
  const token = await adminToken();
  const res = await fetch(`${API_BASE}/api/admin/marketing/refresh-instagram-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  console.log(`✅ Instagram token refreshed, valid for ${data.expires_in_days} more days.`);
}

main().catch(e => {
  console.error('Instagram token refresh failed:', e.message);
  process.exit(1);
});
