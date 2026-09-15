/* IFT PMS — Service Worker
   Purpose: cache the app shell (HTML/CSS/JS/icons/fonts/CDN libs) so the app
   still LOADS and RUNS with no network. Actual data (Firebase RTDB) is handled
   by the in-page Offline/Sync layer using IndexedDB — this worker never
   touches application data, only static assets.
*/
const CACHE_VERSION = "ift-pms-v1";
const APP_SHELL = [
  "./IFT-Production-Management-System.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for the app shell + any same-origin GET request.
// Network-first (with cache fallback) for cross-origin CDN assets (fonts, chart.js, firebase SDK, qrcode),
// so we pick up updates when online but still work fully offline once cached.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes; Firebase RTDB uses its own transport anyway

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    // Cross-origin (fonts.googleapis.com, cdnjs, gstatic firebase SDK, etc.)
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
