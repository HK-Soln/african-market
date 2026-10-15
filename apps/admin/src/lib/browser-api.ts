'use client';

import { createApiClient, createAuthActions } from '@am/api-client';
import { config } from './config';

/**
 * The gateway client for code that runs in the browser. Cookies carry the session, so there is
 * no token to pass; an expired access cookie is refreshed and the call repeated once.
 */
export const browserApi = createApiClient({
  baseUrl: config.gatewayUrl,
  // Read at call time, so emails and messages follow a language change straight away.
  locale: () => (typeof document === 'undefined' ? undefined : document.documentElement.lang),
  refreshOnUnauthorized: true,
});

export const auth = createAuthActions(browserApi);
