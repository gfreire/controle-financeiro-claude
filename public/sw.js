// Minimal service worker — enables "Instalar app" (PWA install) on Chrome/Android.
// Intentionally does NOT cache app routes: this app is data-heavy and always online,
// so stale caching would do more harm than good. Network passthrough only.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op handler: its presence is enough to satisfy install criteria.
  // Requests fall through to the network as normal.
});
