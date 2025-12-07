
const CACHE_NAME = 'nutriwise-cache-v18';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // CRITICAL: Bypass Service Worker for API calls entirely to prevent caching issues
  // or stale responses being served to the phone.
  if (requestUrl.pathname.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network first strategy for HTML to ensure we always get the latest app
  if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  } else {
    // Stale-while-revalidate for assets
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  // valid active service worker takes control of the page immediately
  event.waitUntil(clients.claim());
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
