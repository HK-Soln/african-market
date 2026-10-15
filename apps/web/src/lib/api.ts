import { createApiClient } from '@am/api-client';
import { config } from './config';

/** Server-side gateway URL (container network) vs browser URL (public). */
export const GATEWAY_URL = config.serverGatewayUrl;

export const api = (locale?: string, accessToken?: string) =>
  createApiClient({ baseUrl: GATEWAY_URL, locale, accessToken });
