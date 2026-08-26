// MMA Bridge Service Worker — Push + Offline Cache
// v3 — JS/CSS always network-fresh, only images cached
const CACHE_NAME = 'mma-bridge-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/events.html',
  '/images/mma-bridge-logo.png',
];

// ── Install: cache static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate: nuke ALL old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.hostname === 'mmabridge-backend.onrender.com') return;

  const path = url.pathname;

  // HTML, JS, CSS — always fetch fresh from network, never serve stale
  if (
    path.endsWith('.js') || path.endsWith('.css') ||
    path.endsWith('.html') || path === '/' ||
    event.request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Images only: cache-first (they rarely change)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 404 }));
    })
  );
});

// ── Push notification handler ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'MMA Bridge', {
      body: data.body || '',
      icon: '/images/mma-bridge-logo.png',
      badge: '/images/mma-bridge-logo.png',
      tag: data.tag || 'mma-bridge',
      requireInteraction: data.requireInteraction || false,
      data: { url: data.url || '/events.html' }
    })
  );
});

// ── Periodic card-change ping to all open clients (every 10 min) ──
function pingClients() {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    clients.forEach(c => c.postMessage({ type: 'CHECK_EVENTS' }));
  });
}
setInterval(pingClients, 10 * 60 * 1000);

// ── Notification click handler ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/events.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('mmabridge.com') && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
