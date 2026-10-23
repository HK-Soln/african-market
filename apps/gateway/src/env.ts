import { z } from 'zod';
import { type BaseEnv, flag, isDeployed, noneMeansOff } from '@am/core';

export const gatewayEnvSchema = z.object({
  /** /health/services checks the services of this phase and earlier. */
  CURRENT_PHASE: z.coerce.number().int().min(0),
  GATEWAY_PORT: z.coerce.number().int().positive(),
  /** HS256 secret for access tokens, shared with identity. Production: from AWS Secrets Manager. */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Comma-separated origins of the three Next.js apps. */
  CORS_ORIGINS: z.string().min(1),
  /**
   * Scales the per-IP limits on the auth routes (auth/auth.throttles.ts). 1 everywhere real; only
   * the end-to-end stack raises it, because every test there comes from the same IP.
   */
  AUTH_THROTTLE_MULTIPLIER: z.coerce.number().int().positive(),
  /** Request timeout to a service, in ms (5000). */
  SERVICE_TIMEOUT_MS: z.coerce.number().int().positive(),
  /**
   * Domain for the auth cookies, e.g. `.africanmarket.ae`, so the web apps on sibling subdomains
   * can read the access cookie on the server. `none` means "this host only" (local development).
   */
  COOKIE_DOMAIN: noneMeansOff(),
  /**
   * Send the auth cookies over HTTPS only. `true` wherever the gateway is served over HTTPS (every
   * AWS environment, the test one included); `false` only for plain http on a laptop or in CI.
   * Must be `true` in staging and production.
   */
  COOKIE_SECURE: flag(),
  /**
   * `GET /api/v1/test/otp`, which hands out the sign-in code identity's in-memory SMS provider
   * "sent": for the end-to-end tests only. Refused in staging and production.
   */
  TEST_SUPPORT_ROUTES: flag(),
  /**
   * How many reverse proxies sit in front of the gateway (1 behind a load balancer). The caller's
   * IP, which the rate limits use, is read that many hops back in X-Forwarded-For. 0 trusts none.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0),
});

/** What `APP_ENV` holds in the gateway: the base keys plus the ones above. */
export type GatewayEnv = BaseEnv & z.infer<typeof gatewayEnvSchema>;

/** Fails fast on settings that would weaken staging or production. */
export function assertSafeGatewayEnv(env: GatewayEnv): void {
  if (!isDeployed(env)) return;
  if (!env.COOKIE_SECURE)
    throw new Error('COOKIE_SECURE must be true in staging and production (HTTPS only)');
  if (env.TEST_SUPPORT_ROUTES)
    throw new Error('TEST_SUPPORT_ROUTES hands out sign-in codes; it must be false here');
}
