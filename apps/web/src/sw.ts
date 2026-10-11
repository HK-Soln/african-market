/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

// The service worker. Built by @serwist/next into public/sw.js (see next.config.ts); the precache
// list is injected at build time. Web push arrives in Phase 2.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;
/** Kept in step with LOCALES in @am/i18n; the offline pages are precached in next.config.ts. */
const LOCALES = ['en', 'ar', 'fr'];
const DEFAULT_LOCALE = 'en';

/** The offline page in the language of the page that could not be loaded. */
const offlinePageFor = (url: URL): string => {
  const locale = LOCALES.find(
    (code) => url.pathname === `/${code}` || url.pathname.startsWith(`/${code}/`),
  );
  return `/${locale ?? DEFAULT_LOCALE}/offline`;
};

const serwist = new Serwist({
  // The app shell: Next's built scripts, styles and fonts, plus the offline pages.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Pages: fresh when online, the last copy seen when not. Pages carry no personal data in
      // their HTML (the session is loaded by the browser), so a cached copy is safe to keep.
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * DAY })],
      }),
    },
    {
      // Shop and product photos: show the saved one at once, refresh it in the background.
      matcher: ({ request }) => request.destination === 'image',
      handler: new StaleWhileRevalidate({
        cacheName: 'images',
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY }),
        ],
      }),
    },
    // Nothing else is cached at run time. In particular, calls to the gateway always go to the
    // network: they carry the session and personal data.
  ],
  fallbacks: {
    entries: LOCALES.map((locale) => ({
      url: `/${locale}/offline`,
      matcher: ({ request }: { request: Request }) =>
        request.destination === 'document' &&
        offlinePageFor(new URL(request.url)) === `/${locale}/offline`,
    })),
  },
});

serwist.addEventListeners();
