import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

export type { components, paths } from './schema';
export * from './auth-actions';

export interface ApiClientOptions {
  /** Gateway base URL, e.g. http://localhost:4000 (server) or '' when proxied (browser). */
  baseUrl: string;
  /** Locale sent as Accept-Language so services return translated errors and content. */
  locale?: string | (() => string | undefined);
  /** For server components: forward the access token taken from the request cookies. */
  accessToken?: string;
  /**
   * Browser only. When a call comes back 401 the access cookie has usually just expired, so the
   * client asks the gateway for a new one with the refresh cookie and repeats the call once.
   */
  refreshOnUnauthorized?: boolean;
  /** Replaceable for tests. */
  fetch?: typeof globalThis.fetch;
}

const AUTH_PATH = '/api/v1/auth/';

/**
 * Repeats a call once after refreshing the session. Calls that fail together share one refresh:
 * a refresh token works once, so two refreshes at the same time would look like theft.
 */
export function refreshOnUnauthorized(baseUrl: string, doFetch: typeof fetch): Middleware {
  const retryable = new Map<string, Request>();
  let refreshing: Promise<boolean> | null = null;

  const refresh = () => {
    refreshing ??= doFetch(`${baseUrl}${AUTH_PATH}refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(
        (response) => response.ok,
        () => false,
      )
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  return {
    onRequest({ request, id }) {
      // The auth routes are how a session starts; a 401 from them is an answer, not an expiry.
      if (!new URL(request.url).pathname.startsWith(AUTH_PATH)) {
        retryable.set(id, request.clone());
      }
      return request;
    },
    async onResponse({ response, id }) {
      const again = retryable.get(id);
      retryable.delete(id);
      if (response.status !== 401 || !again) return response;
      if (!(await refresh())) return response;
      return doFetch(again);
    },
    onError({ id }) {
      retryable.delete(id);
    },
  };
}

/**
 * Typed client for the gateway. Types come from `src/schema.ts`, generated from the
 * gateway's OpenAPI spec: run `pnpm nx run @am/api-client:generate` after changing routes.
 */
export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, locale, accessToken } = options;
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const client = createClient<paths>({ baseUrl, credentials: 'include', fetch: doFetch });
  const headers: Middleware = {
    onRequest({ request }) {
      const language = typeof locale === 'function' ? locale() : locale;
      if (language) request.headers.set('Accept-Language', language);
      if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
      return request;
    },
  };
  client.use(headers);
  if (options.refreshOnUnauthorized) client.use(refreshOnUnauthorized(baseUrl, doFetch));
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
