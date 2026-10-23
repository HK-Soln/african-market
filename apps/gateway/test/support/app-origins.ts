import type { ClientApp } from '@am/auth';

/** Where the tests pretend each browser app is served from (WEB_ORIGIN and the others). */
export const TEST_APP_ORIGINS: Record<ClientApp, string> = {
  web: 'http://localhost:3000',
  seller: 'http://localhost:3001',
  admin: 'http://localhost:3002',
};
