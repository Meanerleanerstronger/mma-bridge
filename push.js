// MMA Bridge — Browser Push Notification Manager
// Handles: SW registration, push subscriptions, starred events, fav fighter alerts

(function () {
  'use strict';

  // ── VAPID public key (matches private key on the backend) ──
  const VAPID_PUBLIC_KEY = 'BE2r4AU2Z-g48i3Bjg3CFIsFSBjtktzkR_rV2LQyv7hO2jJCLFrv2FBQ-M_oztS26G3Efrw6CMkpkgYo416Fwb4';
  const STARS_KEY        = 'mma_starred_events_v1';
  const BROWSER_ID_KEY   = 'mma_browser_id';

  // ── Persistent browser identity ──────────────
  function getBrowserId() {
    let id = localStorage.getItem(BROWSER_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(BROWSER_ID_KEY, id);
    }
    return id;
  }

  function urlBase64ToUint8Array(b64) {
    const padding = '='.repeat((4 - b64.length % 4) % 4);
    const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  // ── Service worker registration ──────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      return null;
    }
  }

  // ── Request permission + push subscription ───
  async function subscribeToPush() {
    if (!('PushManager' in window) || !('Notification' in window)) return null;
    const reg = await registerSW();
    if (!reg) return null;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;

    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) return existing;

      return await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      return null;
    }
  }

  // ── Get current Supabase user id ─────────────
  async function getUserId() {
    const sb = window._sb;
    if (!sb) return null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      return session?.user?.id || null;
    } catch { return null; }
  }

  // ── Persist subscription to Supabase ─────────
  async function saveSubscription(sub, extra = {}) {
    const sb = window._sb;
    if (!sb || !sub) return;

    const raw       = sub.toJSON ? sub.toJSON() : sub;
    const browserId = getBrowserId();
    const userId    = await getUserId();

    await sb.from('push_subscriptions').upsert({
      browser_id:  browserId,
      user_id:     userId,
      endpoint:    raw.endpoint,
      p256dh:      raw.keys?.p256dh,
      auth:        raw.keys?.auth,
      updated_at:  new Date().toISOString(),
      ...extra,
    }, { onConflict: 'browser_id' }).catch(() => {});
  }

  // ── Starred events (local + Supabase) ────────
  function getStarredLocal() {
    try { return JSON.parse(localStorage.getItem(STARS_KEY) || '[]'); } catch { return []; }
  }
  function saveStarredLocal(arr) {
    try { localStorage.setItem(STARS_KEY, JSON.stringify(arr)); } catch {}
  }

  function isStarred(eventId) {
    return getStarredLocal().some(s => s.event_id === eventId);
  }

  async function starEvent(ev) {
    if (isStarred(ev.id)) return 'already';

    const sub = await subscribeToPush();
    if (!sub) return 'denied';     // user denied browser permission

    await saveSubscription(sub);

    // Local
    const starred = getStarredLocal();
    starred.push({
      event_id:         ev.id,
      event_name:       ev.name        || '',
      event_iso_date:   ev.isoDate     || '',
      event_start_time: ev.start_time  || null,
    });
    saveStarredLocal(starred);

    // Supabase
    const sb = window._sb;
    if (sb) {
      const browserId = getBrowserId();
      const userId    = await getUserId();
      await sb.from('starred_events').upsert({
        browser_id:       browserId,
        user_id:          userId,
        event_id:         ev.id,
        event_name:       ev.name        || '',
        event_iso_date:   ev.isoDate     || '',
        event_start_time: ev.start_time  || null,
        notified_week:    false,
        notified_day:     false,
      }, { onConflict: 'browser_id,event_id' }).catch(() => {});
    }

    return 'ok';
  }

  async function unstarEvent(eventId) {
    const starred = getStarredLocal().filter(s => s.event_id !== eventId);
    saveStarredLocal(starred);

    const sb = window._sb;
    if (sb) {
      const browserId = getBrowserId();
      await sb.from('starred_events')
        .delete()
        .eq('browser_id', browserId)
        .eq('event_id',   eventId)
        .catch(() => {});
    }
  }

  // ── Fav fighter push subscription ────────────
  // Called by profile.js whenever the fav fighters list changes
  async function updateFavFighters(fighterIds, fighterMap) {
    if (!fighterIds?.length) {
      // No favs → clear from push record
      const sb = window._sb;
      if (!sb) return;
      const browserId = getBrowserId();
      await sb.from('push_subscriptions')
        .update({ fav_fighter_ids: null, updated_at: new Date().toISOString() })
        .eq('browser_id', browserId)
        .catch(() => {});
      return;
    }

    const sub = await subscribeToPush();
    if (!sub) return; // no permission — silent fail

    // Build name list for readability in backend logs
    const names = fighterIds
      .map(id => fighterMap?.[id]?.name || id)
      .filter(Boolean);

    await saveSubscription(sub, {
      fav_fighter_ids:   JSON.stringify(fighterIds),
      fav_fighter_names: JSON.stringify(names),
    });
  }

  // ── Sync starred events from server on login ──
  async function syncStarredFromServer() {
    const sb     = window._sb;
    const userId = await getUserId();
    if (!sb || !userId) return;

    const { data } = await sb
      .from('starred_events')
      .select('event_id, event_name, event_iso_date, event_start_time')
      .eq('user_id', userId)
      .catch(() => ({ data: null }));

    if (!data?.length) return;

    const local    = getStarredLocal();
    const localIds = new Set(local.map(s => s.event_id));
    data.forEach(s => {
      if (!localIds.has(s.event_id)) {
        local.push({
          event_id:         s.event_id,
          event_name:       s.event_name       || '',
          event_iso_date:   s.event_iso_date   || '',
          event_start_time: s.event_start_time || null,
        });
      }
    });
    saveStarredLocal(local);
  }

  // ── Public API ───────────────────────────────
  window.MMABridgePush = {
    registerSW,
    starEvent,
    unstarEvent,
    isStarred,
    updateFavFighters,
    syncStarredFromServer,
    getBrowserId,
  };

  // Silently register the SW in the background on every page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => registerSW());
  } else {
    registerSW();
  }

})();
