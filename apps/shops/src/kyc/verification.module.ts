import {
  Inject,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_ENV, EventBus } from '@am/core';
import { IdempotentConsumer, OutboxService } from '@am/database';
import type { ShopsEnv } from '../config/shops-env';
import { DiditKycProvider } from './didit-kyc-provider';
import { FakeKycProvider } from './fake-kyc-provider';
import { KYC_PROVIDER, KycProvider } from './kyc-provider';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

const ERASE_EVERY_MS = 60 * 60 * 1000;

@Module({
  controllers: [VerificationController],
  providers: [
    {
      provide: KYC_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: ShopsEnv): KycProvider =>
        env.KYC_PROVIDER === 'didit'
          ? new DiditKycProvider({
              apiUrl: env.DIDIT_API_URL!,
              apiKey: env.DIDIT_API_KEY!,
              webhookSecret: env.DIDIT_API_SECRET!,
              workflowId: env.DIDIT_WORKFLOW_ID!,
            })
          : new FakeKycProvider(),
    },
    {
      provide: VerificationService,
      inject: [getDataSourceToken(), OutboxService, KYC_PROVIDER, APP_ENV],
      useFactory: (
        dataSource: DataSource,
        outbox: OutboxService,
        provider: KycProvider,
        env: ShopsEnv,
      ) => new VerificationService(dataSource, outbox, provider, env.SELLER_APP_URL),
    },
  ],
})
export class VerificationModule implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VerificationModule.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly verification: VerificationService,
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  onModuleInit(): void {
    // The provider's copy of a deleted account's identity documents goes when its personal data
    // is erased (T-23), not before: the 30 days leave room to look into a fraudulent deletion.
    this.bus.subscribe('user.deleted', async (event) => {
      await this.once.handle(event, 'shops.kyc-erasure', async () => {
        await this.verification.scheduleErasure(
          event.payload.userId,
          new Date(event.payload.eraseBy),
        );
      });
    });
  }

  onApplicationBootstrap(): void {
    this.logger.log(`KYC provider: ${this.provider.name}`);
    this.timer = setInterval(() => void this.erase(), ERASE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async erase(): Promise<void> {
    try {
      const erased = await this.verification.eraseDue();
      if (erased)
        this.logger.log(`Deleted ${erased} identity verification sessions at the provider`);
    } catch (err) {
      this.logger.warn(`KYC erasure failed, will retry: ${(err as Error).message}`);
    }
  }
}
