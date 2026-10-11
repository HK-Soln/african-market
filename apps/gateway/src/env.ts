import { z } from 'zod';
import type { BaseEnv } from '@am/core';

export const gatewayEnvSchema = z.object({
  GATEWAY_PORT: z.coerce.number().default(4000),
  /** HS256 secret for access tokens, shared with identity. Production: from AWS Secrets Manager. */
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-only-access-secret-change-me-0123456789'),
  /** Comma-separated origins of the three Next.js apps. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
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
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

/** What `APP_ENV` holds in the gateway: the base keys plus the ones above. */
export type GatewayEnv = BaseEnv & z.infer<typeof gatewayEnvSchema>;
