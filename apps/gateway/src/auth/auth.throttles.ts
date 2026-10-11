const MINUTE = 60_000;

/**
 * Stricter limits for the routes worth attacking, per IP, on top of the global 120 a minute.
 * These only blunt bursts at the edge: the limits that count (per phone, per email, escalating
 * resend delay) are kept in Redis by the identity service.
 */
export const AuthThrottles = {
  /** Anything that sends a code by WhatsApp, SMS or email. */
  codeRequest: { default: { limit: 5, ttl: MINUTE } },
  /** Guessing a code. */
  codeVerify: { default: { limit: 10, ttl: MINUTE } },
  /** Guessing a password. */
  login: { default: { limit: 10, ttl: MINUTE } },
  refresh: { default: { limit: 30, ttl: MINUTE } },
};
