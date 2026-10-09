import type { MetadataRoute } from 'next';

/** Installable PWA (decision: PWA first, native apps later if usage proves the need). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'African Market',
    short_name: 'African Market',
    description: 'Find African shops, products and services near you in the UAE',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#c2620a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      // Phase 0: add 192px and 512px PNG icons and a maskable icon once the brand exists.
    ],
  };
}
