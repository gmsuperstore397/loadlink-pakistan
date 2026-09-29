// LoadLink Pakistan - Service Worker
// Strategy:
//  - App shell (HTML/CSS/JS/icons/manifest): cache-first, precached on install.
//  - Leaflet CDN assets: stale-while-revalidate.
//  - API GET requests: network-first, falling back to the last cached response.
//  - API write requests (POST/PATCH/PUT/DELETE): network-only, never cached.
//  - Navigation requests while offline: fall back to offline.html.

const VERSION = 'v8';
const SHELL_CACHE = `loadlink-shell-${VERSION}`;
const RUNTIME_CACHE = `loadlink-runtime-${VERSION}`;
const API_CACHE = `loadlink-api-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './offline.html',
  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-128.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-152.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'LoadLink Pakistan', body: 'Aapke account mein nayi update hai.' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-72.png',
    data: payload.data || {},
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (list.length) return list[0].focus();
    return clients.openWindow('./');
  }));
});

// Let the page trigger an immediate update (see app.js registration code).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}
function isLeafletCdn(url) {
  return url.hostname === 'unpkg.com' || url.hostname.endsWith('tile.openstreetmap.org');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    // Never cache writes; if the network is down, let the app's own
    // apiRequest() error handling show the "no connection" toast.
    return;
  }

  const url = new URL(request.url);

  // ---- API requests: never cache account data.
  // API GET responses can contain user-specific data, so serving a cached
  // response to another account/device state could expose stale private data.
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ success: false, message: 'Offline — live data is unavailable', errors: [] }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )),
    );
    return;
  }

  // ---- Leaflet / map tiles: stale-while-revalidate ----
  if (isLeafletCdn(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) => cache.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      })),
    );
    return;
  }

  // ---- Navigation: network-first so deployed HTML is picked up immediately ----
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./offline.html'))),
    );
    return;
  }

  // ---- App shell assets: network-first, cache fallback offline ----
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
