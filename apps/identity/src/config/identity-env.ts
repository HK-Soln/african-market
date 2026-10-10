import { z } from 'zod';
import { BaseEnv } from '@am/core';

/** Local-only default; staging and production must set their own secret. */
const DEV_OTP_SECRET = 'dev-only-otp-hmac-secret-change-me-0123456789';

/** Environment the identity service needs on top of the base keys. */
export const identityEnvSchema = z.object({
  /** Key for the HMAC that turns a one-time code into the stored hash. */
  OTP_HMAC_SECRET: z.string().min(32).default(DEV_OTP_SECRET),
  /** `console` prints the message to stdout and is refused outside development and test. */
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
});

export type IdentityEnv = BaseEnv & z.infer<typeof identityEnvSchema>;

const isDeployed = (env: IdentityEnv): boolean =>
  env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';

/** Fails fast on settings that are only acceptable on a developer machine. */
export function assertSafeIdentityEnv(env: IdentityEnv): void {
  if (!isDeployed(env)) return;
  if (env.OTP_HMAC_SECRET === DEV_OTP_SECRET)
    throw new Error('OTP_HMAC_SECRET must be set to a real secret in staging and production');
  if (env.SMS_PROVIDER === 'console')
    throw new Error('SMS_PROVIDER=console prints codes to stdout; it is for development only');
}
