import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // The monorepo root, so the standalone build also traces the hoisted node_modules and the libs.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product and shop images come from the media service's CDN (MinIO locally).
    remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '9000' }],
  },
};

export default withNextIntl(nextConfig);
