// MMA Bridge — Service Worker
// Handles browser push notifications and notification click routing

const CACHE_VERSION = 'mmabridge-sw-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── Receive push from server ──────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || 'MMA Bridge';
  const options = {
    body:             data.body    || '',
    icon:             data.icon    || '/images/icon-192.png',
    badge:            data.badge   || '/images/badge-72.png',
    data:             { url: data.url || '/events.html' },
    tag:              data.tag     || 'mmabridge',
    renotify:         !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    vibrate:          [180, 80, 180],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click → open the right page ─
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/events.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing window if possible
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
