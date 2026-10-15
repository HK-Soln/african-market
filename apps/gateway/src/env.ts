import { z } from 'zod';
import type { BaseEnv } from '@am/core';

export const gatewayEnvSchema = z.object({
  /** /health/services checks the services of this phase and earlier. */
  CURRENT_PHASE: z.coerce.number().int().min(0),
  GATEWAY_PORT: z.coerce.number().default(4000),
  /** HS256 secret for access tokens, shared with identity. Production: from AWS Secrets Manager. */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Comma-separated origins of the three Next.js apps. */
  CORS_ORIGINS: z.string().min(1),
  /**
   * Code requests (WhatsApp, SMS, email) per IP per minute. 5 everywhere real; only the end-to-end
   * stack raises it, because every test there comes from the same IP.
   */
  AUTH_CODE_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(5),
  /** Default request timeout to a service, in ms. */
  SERVICE_TIMEOUT_MS: z.coerce.number().default(5000),
  /**
   * Domain for the auth cookies, e.g. `.africanmarket.ae`, so the web apps on sibling subdomains
   * can read the access cookie on the server. Unset means "this host only" (local development).
   */
  COOKIE_DOMAIN: z.string().optional(),
  /**
   * How many reverse proxies sit in front of the gateway (1 behind a load balancer). The caller's
   * IP, which the rate limits use, is read that many hops back in X-Forwarded-For. 0 trusts none.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0),
});

/** What `APP_ENV` holds in the gateway: the base keys plus the ones above. */
export type GatewayEnv = BaseEnv & z.infer<typeof gatewayEnvSchema>;
