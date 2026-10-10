import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { APP_ENV, ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { assertSafeIdentityEnv, IdentityEnv, identityEnvSchema } from './config/identity-env';
import { dataSourceConfig } from './data-source';
import { OtpModule } from './otp/otp.module';
import { RedisModule } from './redis/redis.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'identity', envSchema: identityEnvSchema }),
    DatabaseModule.forService(dataSourceConfig),
    RedisModule,
    SmsModule,
    OtpModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(APP_ENV) private readonly env: IdentityEnv) {}

  onModuleInit(): void {
    assertSafeIdentityEnv(this.env);
  }
}
