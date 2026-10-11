'use client';

import { createApiClient, createAuthActions } from '@am/api-client';

/**
 * The gateway client for code that runs in the browser. Cookies carry the session, so there is
 * no token to pass; an expired access cookie is refreshed and the call repeated once.
 */
export const browserApi = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000',
  // Read at call time, so emails and messages follow a language change straight away.
  locale: () => (typeof document === 'undefined' ? undefined : document.documentElement.lang),
  refreshOnUnauthorized: true,
});

export const auth = createAuthActions(browserApi);
