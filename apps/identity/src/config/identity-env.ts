import { z } from 'zod';
import { BaseEnv } from '@am/core';

/** Local-only default; staging and production must set their own secret. */
const DEV_OTP_SECRET = 'dev-only-otp-hmac-secret-change-me-0123456789';
const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0123456789';

/** Environment the identity service needs on top of the base keys. */
export const identityEnvSchema = z.object({
  /** Signs access tokens. The gateway verifies them with the same value (decision T-11). */
  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
  /** Key for the HMAC that turns a one-time code into the stored hash. */
  OTP_HMAC_SECRET: z.string().min(32).default(DEV_OTP_SECRET),
  /**
   * `console` prints the message to stdout and is refused outside development and test.
   * `memory` keeps it for end-to-end tests to read and is refused unless NODE_ENV=test.
   */
  SMS_PROVIDER: z.enum(['console', 'memory', 'twilio']).default('console'),
  /** `smtp` is Mailpit locally and also reaches SES through its SMTP endpoint. */
  EMAIL_PROVIDER: z.enum(['smtp', 'ses']).default('smtp'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  EMAIL_FROM: z.string().default('African Market <no-reply@africanmarket.local>'),
});

export type IdentityEnv = BaseEnv & z.infer<typeof identityEnvSchema>;

const isDeployed = (env: IdentityEnv): boolean =>
  env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';

/** Fails fast on settings that are only acceptable on a developer machine. */
export function assertSafeIdentityEnv(env: IdentityEnv): void {
  if (env.SMS_PROVIDER === 'memory' && env.NODE_ENV !== 'test')
    throw new Error(
      'SMS_PROVIDER=memory exposes codes to the test endpoint; it needs NODE_ENV=test',
    );
  if (!isDeployed(env)) return;
  if (env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET)
    throw new Error('JWT_ACCESS_SECRET must be set to a real secret in staging and production');
  if (env.OTP_HMAC_SECRET === DEV_OTP_SECRET)
    throw new Error('OTP_HMAC_SECRET must be set to a real secret in staging and production');
  if (env.SMS_PROVIDER === 'console')
    throw new Error('SMS_PROVIDER=console prints codes to stdout; it is for development only');
}
