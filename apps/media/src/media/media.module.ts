import { Inject, Module, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_ENV, EventBus } from '@am/core';
import { IdempotentConsumer, OutboxService } from '@am/database';
import type { MediaEnv } from '../config/media-env';
import { CdnPurger, CloudFrontPurger, NoCdnPurger } from '../storage/cdn';
import { ObjectStore } from '../storage/object-store';
import { MediaCleanup } from './media-cleanup';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

const CDN = Symbol('CDN');

@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: ObjectStore,
      inject: [APP_ENV],
      useFactory: (env: MediaEnv) => new ObjectStore(env),
    },
    {
      provide: CDN,
      inject: [APP_ENV],
      useFactory: (env: MediaEnv): CdnPurger =>
        env.CLOUDFRONT_DISTRIBUTION_ID
          ? new CloudFrontPurger(env.CLOUDFRONT_DISTRIBUTION_ID)
          : new NoCdnPurger(),
    },
    {
      provide: MediaService,
      inject: [getDataSourceToken(), ObjectStore, OutboxService],
      useFactory: (dataSource: DataSource, store: ObjectStore, outbox: OutboxService) =>
        new MediaService(dataSource, store, outbox),
    },
    {
      provide: MediaCleanup,
      inject: [getDataSourceToken(), ObjectStore, CDN],
      useFactory: (dataSource: DataSource, store: ObjectStore, cdn: CdnPurger) =>
        new MediaCleanup(dataSource, store, cdn),
    },
  ],
})
export class MediaModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    @Inject(APP_ENV) private readonly env: MediaEnv,
    private readonly store: ObjectStore,
    private readonly cleanup: MediaCleanup,
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
  ) {}

  onModuleInit(): void {
    // A deleted account's avatar and unused uploads go at once (decision T-23).
    this.bus.subscribe('user.deleted', async (event) => {
      await this.once.handle(event, 'media.user-deleted', async () => {
        await this.cleanup.removeForUser(event.payload.userId);
      });
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.S3_CREATE_BUCKETS) await this.store.createBuckets();
  }
}
