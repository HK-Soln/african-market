import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { APP_ENV, ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { assertSafeShopsEnv, ShopsEnv, shopsEnvSchema } from './config/shops-env';
import { dataSourceConfig } from './data-source';
import { VerificationModule } from './kyc/verification.module';
import { ShopsModule } from './shops/shops.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'shops', envSchema: shopsEnvSchema }),
    DatabaseModule.forService(dataSourceConfig),
    ShopsModule,
    VerificationModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(APP_ENV) private readonly env: ShopsEnv) {}

  onModuleInit(): void {
    assertSafeShopsEnv(this.env);
  }
}
