import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { APP_ENV, loadNodeEnv, ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { assertSafeIdentityEnv, IdentityEnv, identityEnvSchema } from './config/identity-env';
import { AuditModule } from './audit/audit.module';
import { CountriesModule } from './countries/countries.module';
import { dataSourceConfig } from './data-source';
import { EmailAuthModule } from './email-auth/email-auth.module';
import { EmailModule } from './email/email.module';
import { OtpModule } from './otp/otp.module';
import { RedisModule } from './redis/redis.module';
import { SessionModule } from './sessions/session.module';
import { SmsModule } from './sms/sms.module';
import { SocialModule } from './social/social.module';
import { testSupportModules } from './test-support/test-support.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'identity', envSchema: identityEnvSchema }),
    DatabaseModule.forService(dataSourceConfig),
    RedisModule,
    AuditModule,
    SmsModule,
    EmailModule,
    SessionModule,
    CountriesModule,
    OtpModule,
    EmailAuthModule,
    SocialModule,
    UsersModule,
    ...testSupportModules(loadNodeEnv()),
  ],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(APP_ENV) private readonly env: IdentityEnv) {}

  onModuleInit(): void {
    assertSafeIdentityEnv(this.env);
  }
}
