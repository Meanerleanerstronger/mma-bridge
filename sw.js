// MMA Bridge Service Worker — Push + Offline Cache
// v3 — JS/CSS always network-fresh, only images cached
const CACHE_NAME = 'mma-bridge-v3';
const STATIC_ASSETS = [
  '/mma-bridge/',
  '/mma-bridge/index.html',
  '/mma-bridge/events.html',
  '/mma-bridge/images/mma-bridge-logo.png',
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

  // JS and CSS always go to network — version strings handle cache busting
  const path = url.pathname;
  if (path.endsWith('.js') || path.endsWith('.css')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML always network-first so you never get a stale page shell
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/mma-bridge/index.html'))
    );
    return;
  }

  // Images and other static: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('/mma-bridge/index.html'));
    })
  );
});

// ── Push notification handler ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'MMA Bridge', {
      body: data.body || '',
      icon: '/mma-bridge/images/mma-bridge-logo.png',
      badge: '/mma-bridge/images/mma-bridge-logo.png',
      tag: data.tag || 'mma-bridge',
      requireInteraction: data.requireInteraction || false,
      data: { url: data.url || '/mma-bridge/events.html' }
    })
  );
});

// ── Notification click handler ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/mma-bridge/events.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('mma-bridge') && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
