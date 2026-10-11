// Renders the PNG app icons from the SVG logos. Browsers and iOS need PNGs at fixed sizes for the
// install prompt and the home screen; the SVGs stay the source.
//
//   node tools/generate-pwa-icons.mjs
//
// Run it again whenever apps/web/public/icon.svg or icon-maskable.svg changes, and commit the PNGs.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const outDir = join(publicDir, 'icons');

/** `any` icons keep the rounded mark; `maskable` ones are full-bleed so the OS can crop them. */
const icons = [
  { source: 'icon.svg', name: 'icon-192.png', size: 192 },
  { source: 'icon.svg', name: 'icon-512.png', size: 512 },
  { source: 'icon-maskable.svg', name: 'icon-maskable-192.png', size: 192 },
  { source: 'icon-maskable.svg', name: 'icon-maskable-512.png', size: 512 },
  // iOS rounds the corners itself and shows black behind any transparency.
  { source: 'icon-maskable.svg', name: 'apple-touch-icon.png', size: 180 },
];

await mkdir(outDir, { recursive: true });
for (const { source, name, size } of icons) {
  // A high density so the small SVG viewBox is rasterised sharply before it is resized.
  await sharp(join(publicDir, source), { density: 1200 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, name));
  console.log(`${name} ${size}x${size}`);
}
