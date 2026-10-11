import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { APP_ENV } from '@am/core';
import { IdentityEnv } from '../config/identity-env';
import {
  EMAIL_PROVIDER,
  EmailProvider,
  SesEmailProvider,
  SmtpEmailProvider,
} from './email-provider';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: IdentityEnv): EmailProvider =>
        env.EMAIL_PROVIDER === 'ses'
          ? new SesEmailProvider()
          : new SmtpEmailProvider(env.SMTP_URL, env.EMAIL_FROM),
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule implements OnModuleDestroy {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  onModuleDestroy(): void {
    if (this.provider instanceof SmtpEmailProvider) this.provider.close();
  }
}
