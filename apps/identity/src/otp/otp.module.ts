import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { APP_ENV } from '@am/core';
import { OutboxService } from '@am/database';
import { IdentityEnv } from '../config/identity-env';
import { REDIS } from '../redis/redis.module';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

@Module({
  controllers: [OtpController],
  providers: [
    {
      provide: OtpRateLimiter,
      inject: [REDIS],
      useFactory: (redis: Redis) => new OtpRateLimiter(redis),
    },
    {
      provide: OtpService,
      inject: [getDataSourceToken(), OtpRateLimiter, SMS_PROVIDER, OutboxService, APP_ENV],
      useFactory: (
        dataSource: DataSource,
        limiter: OtpRateLimiter,
        sms: SmsProvider,
        outbox: OutboxService,
        env: IdentityEnv,
      ) => new OtpService(dataSource, limiter, sms, outbox, env.OTP_HMAC_SECRET),
    },
  ],
})
export class OtpModule {}
