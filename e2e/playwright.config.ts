import { defineConfig, devices } from '@playwright/test';
import { GATEWAY_URL, WEB_URL } from './urls';

/**
 * End-to-end tests for the core journeys, in English and Arabic.
 *
 * By default this starts its own copy of the stack on its own ports (web 3100, gateway 4100,
 * identity 4111), so it can run beside `pnpm dev`. The backend runs with DEPLOY_ENV=test, the
 * in-memory SMS provider and TEST_SUPPORT_ROUTES=true, the route the tests read their codes from.
 * Everything else comes from .env (copy .env.example).
 *
 * Before the first run: `pnpm infra:up`, `pnpm build`, `pnpm migration:run`, and once
 * `pnpm --filter @am/e2e exec playwright install chromium`.
 *
 * Set E2E_BASE_URL (and E2E_GATEWAY_URL) to test a stack that is already running instead.
 * E2E_SMOKE_ONLY=1 runs only the @smoke tests: on staging, where codes cannot be read back.
 */
const external = Boolean(process.env.E2E_BASE_URL);
const ci = Boolean(process.env.CI);
const smokeOnly = process.env.E2E_SMOKE_ONLY === '1';

/** Reads the repository's .env first (local ports, machine settings); the values below win. */
const node = 'node --env-file-if-exists=../../.env';

export default defineConfig({
  testDir: './tests',
  grep: smokeOnly ? /@smoke/ : undefined,
  // The first page load compiles the app in dev mode.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // One at a time: the tests share one backend and its rate limits.
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // A phone first: that is how most customers will use it.
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: external
    ? undefined
    : [
        {
          name: 'identity',
          command: `${node} dist/main.js`,
          cwd: '../apps/identity',
          url: 'http://localhost:4211/health',
          env: {
            DEPLOY_ENV: 'test',
            TEST_SUPPORT_ROUTES: 'true',
            SMS_PROVIDER: 'memory',
            IDENTITY_TCP_PORT: '4111',
            IDENTITY_HTTP_PORT: '4211',
            LOG_LEVEL: 'warn',
          },
          reuseExistingServer: !ci,
          timeout: 120_000,
        },
        {
          name: 'gateway',
          command: `${node} dist/main.js`,
          cwd: '../apps/gateway',
          url: `${GATEWAY_URL}/api/v1/health`,
          env: {
            DEPLOY_ENV: 'test',
            TEST_SUPPORT_ROUTES: 'true',
            GATEWAY_PORT: '4100',
            IDENTITY_TCP_PORT: '4111',
            CORS_ORIGINS: WEB_URL,
            LOG_LEVEL: 'warn',
          },
          reuseExistingServer: !ci,
          timeout: 120_000,
        },
        {
          name: 'web',
          command: `${node} ../../node_modules/next/dist/bin/next dev -p 3100`,
          cwd: '../apps/web',
          url: `${WEB_URL}/en`,
          env: {
            NEXT_PUBLIC_GATEWAY_URL: GATEWAY_URL,
            GATEWAY_URL,
            NEXT_DIST_DIR: '.next-e2e',
          },
          reuseExistingServer: !ci,
          timeout: 240_000,
        },
      ],
});
