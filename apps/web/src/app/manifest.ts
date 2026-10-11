import type { MetadataRoute } from 'next';

/** Installable PWA (decision: PWA first, native apps later if usage proves the need). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'African Market UAE',
    short_name: 'African Market',
    description: 'Find African shops, products and services near you in the UAE',
    // The middleware sends `/` on to the visitor's language.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The splash screen: the app's sand background with the clay bar above it.
    background_color: '#fbf6ef',
    theme_color: '#a9500e',
    categories: ['shopping', 'food', 'lifestyle'],
    // PNGs are generated from the SVGs by tools/generate-pwa-icons.mjs.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
