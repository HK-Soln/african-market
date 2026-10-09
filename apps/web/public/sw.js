// Minimal service worker so the app is installable. Phase 0 directive: replace with
// a Serwist (or Workbox) build that precaches the app shell and adds web push (Phase 2).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
