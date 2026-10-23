import { createApiClient } from '@am/api-client';
import { config } from './config';

/** Server-side calls go to the gateway's address inside the network, not the public one. */
export const api = (locale?: string, accessToken?: string) =>
  createApiClient({ baseUrl: config.serverGatewayUrl(), locale, accessToken });
