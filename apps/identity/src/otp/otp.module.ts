import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { APP_ENV } from '@am/core';
import { OutboxService } from '@am/database';
import { IdentityEnv } from '../config/identity-env';
import { CountriesService } from '../countries/countries.service';
import { REDIS } from '../redis/redis.module';
import { SessionService } from '../sessions/session.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms-provider';
import { OtpChallenges } from './otp-challenges';
import { OtpRateLimiter } from './otp-rate-limiter';
import { OtpTestNumbers } from './otp-test-numbers';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

/** Global so email verification and password reset reuse the same code rules and limits. */
@Global()
@Module({
  controllers: [OtpController],
  providers: [
    {
      provide: OtpRateLimiter,
      inject: [REDIS],
      useFactory: (redis: Redis) => new OtpRateLimiter(redis),
    },
    {
      provide: OtpChallenges,
      inject: [APP_ENV],
      useFactory: (env: IdentityEnv) => new OtpChallenges(env.OTP_HMAC_SECRET),
    },
    {
      provide: OtpService,
      inject: [
        getDataSourceToken(),
        OtpRateLimiter,
        SMS_PROVIDER,
        OutboxService,
        OtpChallenges,
        SessionService,
        APP_ENV,
        CountriesService,
      ],
      useFactory: (
        dataSource: DataSource,
        limiter: OtpRateLimiter,
        sms: SmsProvider,
        outbox: OutboxService,
        challenges: OtpChallenges,
        sessions: SessionService,
        env: IdentityEnv,
        countries: CountriesService,
      ) =>
        new OtpService(
          dataSource,
          limiter,
          sms,
          outbox,
          challenges,
          sessions,
          OtpTestNumbers.parse(env.OTP_TEST_NUMBERS),
          countries,
        ),
    },
  ],
  exports: [OtpRateLimiter, OtpChallenges],
})
export class OtpModule {}
