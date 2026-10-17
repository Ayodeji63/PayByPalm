// Cache public assets only. Credentials, API responses and payment requests are
// always network-only; offline use never implies a transaction succeeded.
const CACHE_NAME = 'paybypalm-public-v2';
const PUBLIC_FILES = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('paybypalm-') && key !== CACHE_NAME)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization') ||
      url.search || url.pathname === '/terminal' || url.pathname.startsWith('/terminal/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const offline = await caches.match('/offline.html');
      return new Response(offline ? await offline.text() : 'Connect to the internet to use PayByPalm.', {
        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }));
    return;
  }
  const hashedAsset = /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2|png|svg)$/.test(url.pathname);
  if (!PUBLIC_FILES.includes(url.pathname) && !hashedAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('cache-control') || '')) {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      if (keys.length > 150) {
        const oldestAsset = keys.find(key => !PUBLIC_FILES.includes(new URL(key.url).pathname));
        if (oldestAsset) await cache.delete(oldestAsset);
      }
    }
    return response;
  })());
});
