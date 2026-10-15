import { randomUUID } from 'node:crypto';
import path from 'node:path';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** Changes with every build, so a new deploy replaces the precached offline pages. */
const revision = process.env.BUILD_ID ?? randomUUID();

/**
 * Builds src/sw.ts into public/sw.js with the list of files to precache. Off in development,
 * where a service worker serving yesterday's files only gets in the way.
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // Registered by src/components/service-worker-registrar.tsx.
  register: false,
  disable: process.env.NODE_ENV !== 'production',
  additionalPrecacheEntries: ['en', 'ar', 'fr'].map((locale) => ({
    url: `/${locale}/offline`,
    revision,
  })),
});

const nextConfig: NextConfig = {
  // The end-to-end run builds into its own folder, so it can run beside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: 'standalone',
  // The monorepo root, so the standalone build also traces the hoisted node_modules and the libs.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product and shop images come from the media service's CDN (MinIO locally).
    remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '9000' }],
  },
  async headers() {
    return [
      {
        // The browser must always ask for the newest worker; the worker does its own caching.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
