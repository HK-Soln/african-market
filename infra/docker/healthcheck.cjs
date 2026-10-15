// Container healthcheck for every image: exits 0 when the app's health URL answers 2xx.
//
// APP is set in the image. Ports follow the same env overrides the apps themselves read:
//   Next apps     PORT                (default 3000)    GET /health
//   gateway       GATEWAY_PORT        (default 4000)    GET /api/v1/health
//   services      <NAME>_HTTP_PORT    (default from SERVICES in @am/contracts)    GET /health
'use strict';

const app = process.env.APP;
const NEXT_APPS = new Set(['web', 'seller', 'admin']);

function target() {
  if (NEXT_APPS.has(app)) return { port: process.env.PORT || 3000, path: '/health' };
  if (app === 'gateway') return { port: process.env.GATEWAY_PORT || 4000, path: '/api/v1/health' };
  const { SERVICES } = require('@am/contracts');
  const service = SERVICES[app];
  if (!service) throw new Error(`healthcheck: unknown APP "${app}"`);
  return {
    port: process.env[`${app.toUpperCase()}_HTTP_PORT`] || service.httpPort,
    path: '/health',
  };
}

const { port, path } = target();
fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(4000) }).then(
  (response) => process.exit(response.ok ? 0 : 1),
  () => process.exit(1),
);
