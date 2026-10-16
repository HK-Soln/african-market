import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { randomUUID } from 'node:crypto';

/** Removes deleted public images from the CDN's caches, so a removed image stops being served. */
export interface CdnPurger {
  purge(keys: string[]): Promise<void>;
}

/** Locally (MinIO): nothing caches the public bucket. */
export class NoCdnPurger implements CdnPurger {
  async purge(): Promise<void> {}
}

export class CloudFrontPurger implements CdnPurger {
  // CloudFront is global; its API lives in us-east-1.
  private readonly client = new CloudFrontClient({ region: 'us-east-1' });

  constructor(private readonly distributionId: string) {}

  async purge(keys: string[]): Promise<void> {
    // CloudFront takes up to 3000 paths per invalidation.
    for (let i = 0; i < keys.length; i += 3000) {
      const paths = keys.slice(i, i + 3000).map((key) => `/${key}`);
      await this.client.send(
        new CreateInvalidationCommand({
          DistributionId: this.distributionId,
          InvalidationBatch: {
            CallerReference: randomUUID(),
            Paths: { Quantity: paths.length, Items: paths },
          },
        }),
      );
    }
  }
}
