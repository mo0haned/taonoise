// TaoNoise service worker: precaches the app shell so it opens offline after the first visit. Same-origin GETs only; nothing else is touched.
const C = 'taonoise-v1', SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url); if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(C).then(async c => { const hit = await c.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await c.match('/') : null); const net = fetch(r).then(x => { if (x.ok) c.put(r, x.clone()); return x; }).catch(() => hit); return hit || net; }));
});
