import { z } from 'zod';
import { BaseEnv, flag, isDeployed, listOrNone, noneMeansOff } from '@am/core';
import { OtpTestNumbers } from '../otp/otp-test-numbers';

/** The example values in .env.example. Fine on a laptop; refused in staging and production. */
const DEV_OTP_SECRET = 'dev-only-otp-hmac-secret-change-me-0123456789';
const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0123456789';

/** Environment the identity service needs on top of the base keys. */
export const identityEnvSchema = z.object({
  /** Signs access tokens. The gateway verifies them with the same value (decision T-11). */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Key for the HMAC that turns a one-time code into the stored hash. */
  OTP_HMAC_SECRET: z.string().min(32),
  /**
   * `console` prints the message to stdout and is refused in staging and production.
   * `memory` keeps it for end-to-end tests to read (with TEST_SUPPORT_ROUTES) and is refused in
   * staging and production.
   */
  SMS_PROVIDER: z.enum(['console', 'memory', 'twilio']),
  /** `smtp` is Mailpit locally and also reaches SES through its SMTP endpoint. */
  EMAIL_PROVIDER: z.enum(['smtp', 'ses']),
  SMTP_URL: z.url(),
  EMAIL_FROM: z.string().min(3),
  /**
   * Numbers with a fixed code that is never sent, `<phone>:<code>,...`: for the end-to-end tests
   * on staging. `none` for none, which production requires.
   */
  OTP_TEST_NUMBERS: noneMeansOff(),
  /**
   * Social sign-in switched on here, comma-separated: `google`, `facebook`, both, or `none` (local work without client ids). Differs per environment, so it has no default.
   */
  SOCIAL_PROVIDERS: listOrNone(z.enum(['google', 'facebook'])),
  /**
   * Google OAuth client ids whose ID tokens are accepted (web and seller), comma-separated;
   * `none` without Google sign-in.
   */
  GOOGLE_CLIENT_IDS: listOrNone(z.string()),
  /** `none` without Facebook sign-in. */
  FACEBOOK_APP_ID: noneMeansOff(),
  /** The Facebook app secret (Secrets Manager in AWS); `none` without Facebook sign-in. */
  FACEBOOK_APP_SECRET: noneMeansOff(),
  /**
   * Accept made-up social sign-in tokens instead of asking Google and Facebook, for the
   * end-to-end tests. Anyone can then sign in as anyone: refused in staging and production.
   */
  FAKE_SOCIAL_SIGN_IN: flag(),
  /** The handler the gateway's code route asks (see the gateway's TEST_SUPPORT_ROUTES). */
  TEST_SUPPORT_ROUTES: flag(),
});

export type IdentityEnv = BaseEnv & z.infer<typeof identityEnvSchema>;

/** Fails fast on settings that are only acceptable on a developer machine. */
export function assertSafeIdentityEnv(env: IdentityEnv): void {
  // Parsed here too, so a malformed list stops the service at start.
  const testNumbers = OtpTestNumbers.fromSetting(env.OTP_TEST_NUMBERS);
  if (env.DEPLOY_ENV === 'production' && testNumbers.size > 0)
    throw new Error('OTP_TEST_NUMBERS signs in without a real code; it must be none in production');
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
  if (env.SMS_PROVIDER === 'memory')
    throw new Error('SMS_PROVIDER=memory exposes codes to the test route; it is for tests only');
  if (env.FAKE_SOCIAL_SIGN_IN)
    throw new Error('FAKE_SOCIAL_SIGN_IN lets anyone sign in as anyone; it must be false here');
  if (env.TEST_SUPPORT_ROUTES)
    throw new Error('TEST_SUPPORT_ROUTES hands out sign-in codes; it must be false here');
}
