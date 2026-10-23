// Container healthcheck for every image: exits 0 when the app's health URL answers 2xx.
//
// APP is set in the image. The port is the one the app itself listens on, from the same
// required settings (no defaults, decision T-45):
//   Next apps     PORT                (set in the image)    GET /health
//   gateway       GATEWAY_PORT                              GET /api/v1/health
//   services      <NAME>_HTTP_PORT                          GET /health
'use strict';

const app = process.env.APP;
const NEXT_APPS = new Set(['web', 'seller', 'admin']);

function setting(name) {
  const value = process.env[name];
  if (!value) throw new Error(`healthcheck: ${name} is not set`);
  return value;
}

function target() {
  if (NEXT_APPS.has(app)) return { port: setting('PORT'), path: '/health' };
  if (app === 'gateway') return { port: setting('GATEWAY_PORT'), path: '/api/v1/health' };
  if (!app) throw new Error('healthcheck: APP is not set');
  return { port: setting(`${app.toUpperCase()}_HTTP_PORT`), path: '/health' };
}

const { port, path } = target();
fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(4000) }).then(
  (response) => process.exit(response.ok ? 0 : 1),
  () => process.exit(1),
);
