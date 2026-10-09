import { createApiClient } from '@am/api-client';

/** Server-side gateway URL (container network) vs browser URL (public). */
export const GATEWAY_URL =
  process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000';

export const api = (locale?: string, accessToken?: string) =>
  createApiClient({ baseUrl: GATEWAY_URL, locale, accessToken });
