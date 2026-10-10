import type { MetadataRoute } from 'next';

/** Installable PWA (decision: PWA first, native apps later if usage proves the need). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'African Market',
    short_name: 'African Market',
    description: 'Find African shops, products and services near you in the UAE',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf6ef',
    theme_color: '#a9500e',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      // F0-09 adds the 192px and 512px PNG exports and the Apple touch icon.
    ],
  };
}
