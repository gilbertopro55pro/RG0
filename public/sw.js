const CACHE_NAME = "photographer-flow-shell-v1";
const SHELL_ASSETS = ["/offline.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Network-first for page navigations, falling back to a static offline page — this app is
// data-driven (live event/payment state), so we deliberately don't cache-first anything dynamic.
//
// Explicitly excludes API routes and anything but a plain GET: a file-download form POST (e.g.
// the gallery's "download all" zip) is also a "navigate"-mode request, and re-issuing it here via
// fetch(event.request) doesn't reliably replay the POST body on every browser (WebKit/mobile
// Safari in particular) — the request reaches the server with an empty body, which fails
// validation and returns a tiny JSON error instead of the real file. Leaving these requests
// alone (no respondWith at all) makes the browser handle them exactly as if there were no service
// worker, which is what a binary file download needs.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate" && event.request.method === "GET" && !event.request.url.includes("/api/")) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
