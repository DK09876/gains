/*
 * The app's service worker, and all it does: when a page cannot load - the
 * phone is offline, or Tailscale is off - show a page that says so with a
 * "Try again" button, rather than Safari's error, which a home-screen app has
 * no way out of. Nothing else is cached: workouts and logs always come fresh
 * from the server, so an update is never hidden behind an old copy.
 */

const CACHE = 'gains-offline-v1';
const OFFLINE = new URL('offline.html', self.registration.scope).href;
const ICON = new URL('icons/apple-touch-icon.png', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, ICON])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
  } else if (request.url === ICON) {
    event.respondWith(fetch(request).catch(() => caches.match(ICON)));
  }
});

/*
 * Notifications from the Pi. Every push is shown - iPhones withdraw permission
 * from a site that receives a push and shows nothing. Tapping one opens the
 * app (or focuses it) and tells the Pi it was seen, so Spot knows he is
 * being heard.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Gains';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag,
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    data: { id: data.id, url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { id, url } = event.notification.data || {};
  const target = new URL(url || '/', self.registration.scope).href;
  event.waitUntil((async () => {
    if (id) {
      await fetch(new URL('api/push/opened', self.registration.scope).href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      }).catch(() => {});
    }
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = open.find((c) => c.url.startsWith(self.registration.scope));
    if (existing) { await existing.focus(); if ('navigate' in existing) await existing.navigate(target).catch(() => {}); }
    else await self.clients.openWindow(target);
  })());
});
