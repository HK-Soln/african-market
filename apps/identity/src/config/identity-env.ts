import { z } from 'zod';
import { BaseEnv } from '@am/core';
import { OtpTestNumbers } from '../otp/otp-test-numbers';

/** The example values in .env.example. Fine on a laptop; refused in staging and production. */
const DEV_OTP_SECRET = 'dev-only-otp-hmac-secret-change-me-0123456789';
const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0123456789';

const optional = z
  .string()
  .optional()
  .transform((value) => value || undefined);

/** Environment the identity service needs on top of the base keys. */
export const identityEnvSchema = z.object({
  /** Signs access tokens. The gateway verifies them with the same value (decision T-11). */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Key for the HMAC that turns a one-time code into the stored hash. */
  OTP_HMAC_SECRET: z.string().min(32),
  /**
   * `console` prints the message to stdout and is refused outside development and test.
   * `memory` keeps it for end-to-end tests to read and is refused unless NODE_ENV=test.
   */
  SMS_PROVIDER: z.enum(['console', 'memory', 'twilio']),
  /** `smtp` is Mailpit locally and also reaches SES through its SMTP endpoint. */
  EMAIL_PROVIDER: z.enum(['smtp', 'ses']).default('smtp'),
  SMTP_URL: z.url(),
  EMAIL_FROM: z.string().min(3),
  /**
   * Numbers with a fixed code that is never sent, `<phone>:<code>,...`: for the end-to-end tests
   * on staging. Optional, since most environments have none; refused in production.
   */
  OTP_TEST_NUMBERS: z.string().default(''),
  /**
   * Social sign-in switched on here, comma-separated: `google`, `facebook`, both, or empty
   * for none (local work without client ids). Differs per environment, so it has no default.
   */
  SOCIAL_PROVIDERS: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(['google', 'facebook']))),
  /** Google OAuth client ids whose ID tokens are accepted (web and seller), comma-separated. */
  GOOGLE_CLIENT_IDS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  FACEBOOK_APP_ID: optional,
  /** The Facebook app secret (Secrets Manager in AWS). */
  FACEBOOK_APP_SECRET: optional,
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
  // Parsed here too, so a malformed list stops the service at start.
  const testNumbers = OtpTestNumbers.parse(env.OTP_TEST_NUMBERS);
  if (env.NODE_ENV === 'production' && testNumbers.size > 0)
    throw new Error(
      'OTP_TEST_NUMBERS signs in without a real code; it must be empty in production',
    );
  if (env.SOCIAL_PROVIDERS.includes('google') && !env.GOOGLE_CLIENT_IDS.length)
    throw new Error('SOCIAL_PROVIDERS has google: set GOOGLE_CLIENT_IDS');
  if (
    env.SOCIAL_PROVIDERS.includes('facebook') &&
    (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET)
  )
    throw new Error('SOCIAL_PROVIDERS has facebook: set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET');
  if (!isDeployed(env)) return;
  if (env.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET)
    throw new Error('JWT_ACCESS_SECRET must be set to a real secret in staging and production');
  if (env.OTP_HMAC_SECRET === DEV_OTP_SECRET)
    throw new Error('OTP_HMAC_SECRET must be set to a real secret in staging and production');
  if (env.SMS_PROVIDER === 'console')
    throw new Error('SMS_PROVIDER=console prints codes to stdout; it is for development only');
}
