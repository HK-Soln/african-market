import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { OutboxService } from '@am/database';
import { EMAIL_PROVIDER, EmailProvider } from '../email/email-provider';
import { OtpChallenges } from '../otp/otp-challenges';
import { OtpRateLimiter } from '../otp/otp-rate-limiter';
import { LoginRateLimiter } from '../password/login-rate-limiter';
import { REDIS } from '../redis/redis.module';
import { EmailAuthController } from './email-auth.controller';
import { EmailAuthService } from './email-auth.service';

@Module({
  controllers: [EmailAuthController],
  providers: [
    {
      provide: LoginRateLimiter,
      inject: [REDIS],
      useFactory: (redis: Redis) => new LoginRateLimiter(redis),
    },
    {
      provide: EmailAuthService,
      inject: [
        getDataSourceToken(),
        OtpRateLimiter,
        LoginRateLimiter,
        EMAIL_PROVIDER,
        OutboxService,
        OtpChallenges,
      ],
      useFactory: (
        dataSource: DataSource,
        codeLimiter: OtpRateLimiter,
        loginLimiter: LoginRateLimiter,
        email: EmailProvider,
        outbox: OutboxService,
        challenges: OtpChallenges,
      ) => new EmailAuthService(dataSource, codeLimiter, loginLimiter, email, outbox, challenges),
    },
  ],
})
export class EmailAuthModule {}
