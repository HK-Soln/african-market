import { loadEnv } from '@am/core';
import { gatewayEnvSchema } from '../env';

const MINUTE = 60_000;

// Read once, when the routes are declared (decorators run at import).
const { AUTH_CODE_REQUESTS_PER_MINUTE } = loadEnv(
  gatewayEnvSchema.pick({ AUTH_CODE_REQUESTS_PER_MINUTE: true }),
);

/**
 * Stricter limits for the routes worth attacking, per IP, on top of the global 120 a minute.
 * These only blunt bursts at the edge: the limits that count (per phone, per email, escalating
 * resend delay) are kept in Redis by the identity service.
 */
export const AuthThrottles = {
  /** Anything that sends a code by WhatsApp, SMS or email. */
  codeRequest: { default: { limit: AUTH_CODE_REQUESTS_PER_MINUTE, ttl: MINUTE } },
  /** Guessing a code. */
  codeVerify: { default: { limit: 10, ttl: MINUTE } },
  /** Guessing a password. */
  login: { default: { limit: 10, ttl: MINUTE } },
  refresh: { default: { limit: 30, ttl: MINUTE } },
};
