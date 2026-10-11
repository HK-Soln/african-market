import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '@am/core';
import { IdentityEnv } from '../config/identity-env';
import {
  ConsoleSmsProvider,
  MemorySmsProvider,
  SMS_PROVIDER,
  SmsProvider,
  TwilioSmsProvider,
} from './sms-provider';

const PROVIDERS = {
  console: () => new ConsoleSmsProvider(),
  memory: () => new MemorySmsProvider(),
  twilio: () => new TwilioSmsProvider(),
};

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: IdentityEnv): SmsProvider => PROVIDERS[env.SMS_PROVIDER](),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
