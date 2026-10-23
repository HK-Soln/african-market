import { z } from 'zod';
import { BaseEnv, flag, isDeployed, noneMeansOff } from '@am/core';

/**
 * Storage for the media service. Bucket names and the public address differ between
 * environments, so they have no default. Endpoint and keys are for MinIO (or another S3-compatible
 * store) only: in AWS the task role gives access, and they are `none`.
 */
export const mediaEnvSchema = z.object({
  S3_REGION: z.string().min(1),
  /** MinIO locally; `none` in AWS. */
  S3_ENDPOINT: noneMeansOff(z.url()),
  /**
   * The storage address as a browser reaches it, for upload forms, when it differs from
   * S3_ENDPOINT (containers reach MinIO as `minio`, a browser as `localhost`); `none` when it is
   * the same.
   */
  S3_PRESIGN_ENDPOINT: noneMeansOff(z.url()),
  S3_ACCESS_KEY_ID: noneMeansOff(),
  S3_SECRET_ACCESS_KEY: noneMeansOff(),
  /** Quarantine: the only bucket browsers write to. */
  S3_UPLOADS_BUCKET: z.string().min(3),
  /** Processed images, read through the CDN. */
  S3_PUBLIC_BUCKET: z.string().min(3),
  /** Documents (KMS-encrypted in AWS); never given a URL. */
  S3_PRIVATE_BUCKET: z.string().min(3),
  /** Where the public bucket is read from: the CDN in AWS, MinIO locally. */
  MEDIA_PUBLIC_BASE_URL: z.url(),
  /** Removed public images are purged from this CloudFront distribution; `none` locally. */
  CLOUDFRONT_DISTRIBUTION_ID: noneMeansOff(),
  /**
   * Create the three buckets on start, and let anyone read the public one: a fresh MinIO.
   * Refused in staging and production, where Terraform owns the buckets.
   */
  S3_CREATE_BUCKETS: flag(),
});

export type MediaEnv = BaseEnv & z.infer<typeof mediaEnvSchema>;

/** Fails fast on settings that are only acceptable on a developer machine. */
export function assertSafeMediaEnv(env: MediaEnv): void {
  if (isDeployed(env) && env.S3_CREATE_BUCKETS)
    throw new Error('S3_CREATE_BUCKETS is for a local MinIO; Terraform owns the buckets in AWS');
}
