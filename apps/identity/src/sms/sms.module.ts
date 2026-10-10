import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '@am/core';
import { IdentityEnv } from '../config/identity-env';
import { ConsoleSmsProvider, SMS_PROVIDER, SmsProvider, TwilioSmsProvider } from './sms-provider';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: IdentityEnv): SmsProvider =>
        env.SMS_PROVIDER === 'twilio' ? new TwilioSmsProvider() : new ConsoleSmsProvider(),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
