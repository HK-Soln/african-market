import path from 'node:path';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** A build setting that must be set (decision T-45: no defaults). */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (see .env.example)`);
  return value;
}

/** Changes with every build (the commit), so a new deploy replaces the precached offline pages. */
const revision = required('BUILD_ID');

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
  // `.next`; the end-to-end run builds into its own folder, so it can run beside `pnpm dev`.
  distDir: required('NEXT_DIST_DIR'),
  output: 'standalone',
  // The monorepo root, so the standalone build also traces the hoisted node_modules and the libs.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
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
