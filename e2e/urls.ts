/** Where the web app under test is served. */
export const WEB_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

/** The gateway that web app talks to; the fixtures call it directly to set a test up. */
export const GATEWAY_URL = process.env.E2E_GATEWAY_URL ?? 'http://localhost:4100';
