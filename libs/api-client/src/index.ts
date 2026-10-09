import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

export type { paths } from './schema';

export interface ApiClientOptions {
  /** Gateway base URL, e.g. http://localhost:4000 (server) or '' when proxied (browser). */
  baseUrl: string;
  /** Locale sent as Accept-Language so services return translated errors and content. */
  locale?: string;
  /** For server components: forward the access token taken from the request cookies. */
  accessToken?: string;
}

/**
 * Typed client for the gateway. Types come from `src/schema.ts`, generated from the
 * gateway's OpenAPI spec: run `pnpm nx run @am/api-client:generate` after changing routes.
 */
export function createApiClient({ baseUrl, locale, accessToken }: ApiClientOptions) {
  const client = createClient<paths>({ baseUrl, credentials: 'include' });
  const headers: Middleware = {
    onRequest({ request }) {
      if (locale) request.headers.set('Accept-Language', locale);
      if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
      return request;
    },
  };
  client.use(headers);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
