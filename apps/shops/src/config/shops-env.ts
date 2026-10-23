import { z } from 'zod';
import { BaseEnv, isDeployed, noneMeansOff } from '@am/core';

/**
 * Settings of the shops service. The identity provider differs between environments, so it has
 * no default; with `didit`, its keys must be filled in (`none` with `fake`) (and stay in Secrets Manager in AWS).
 */
export const shopsEnvSchema = z.object({
  /**
   * `didit`: hosted identity checks (decision T-28). `fake`: approves at once, for local work and
   * tests; refused in staging and production.
   */
  KYC_PROVIDER: z.enum(['didit', 'fake']),
  /** The seller app, where the hosted page sends the seller back. */
  SELLER_APP_URL: z.url(),
  DIDIT_API_URL: noneMeansOff(z.url()),
  DIDIT_API_KEY: noneMeansOff(),
  /** Signs Didit's webhooks (the webhook destination's shared secret). */
  DIDIT_API_SECRET: noneMeansOff(),
  /** The published workflow the hosted sessions follow. */
  DIDIT_WORKFLOW_ID: noneMeansOff(),
});

export type ShopsEnv = BaseEnv & z.infer<typeof shopsEnvSchema>;

const DIDIT_KEYS = [
  'DIDIT_API_URL',
  'DIDIT_API_KEY',
  'DIDIT_API_SECRET',
  'DIDIT_WORKFLOW_ID',
] as const;

/** Fails fast on settings that do not go together, or only belong on a developer machine. */
export function assertSafeShopsEnv(env: ShopsEnv): void {
  if (isDeployed(env) && env.KYC_PROVIDER === 'fake')
    throw new Error('KYC_PROVIDER=fake approves everyone; it is for local work and tests only');
  if (env.KYC_PROVIDER === 'didit') {
    const missing = DIDIT_KEYS.filter((key) => !env[key]);
    if (missing.length) throw new Error(`KYC_PROVIDER=didit needs ${missing.join(', ')}`);
  }
}
