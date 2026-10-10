import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppRpcException } from '@am/core';
import { IdentityErrors } from '@am/contracts';
import {
  OTP_MAX_PER_IP_PER_HOUR,
  OTP_MAX_PER_PHONE_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './otp.constants';

export interface OtpRateLimits {
  cooldownSeconds: number;
  maxPerPhonePerHour: number;
  maxPerIpPerHour: number;
}

export const DEFAULT_OTP_RATE_LIMITS: OtpRateLimits = {
  cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  maxPerPhonePerHour: OTP_MAX_PER_PHONE_PER_HOUR,
  maxPerIpPerHour: OTP_MAX_PER_IP_PER_HOUR,
};

const HOUR_SECONDS = 60 * 60;

const tooMany = (code: string, message: string, retryAfterSeconds: number) =>
  new AppRpcException({ status: 429, code, message, details: { retryAfterSeconds } });

/**
 * Limits how often codes are sent, in Redis so every replica shares the counts: a resend
 * cooldown per phone, an hourly cap per phone and an hourly cap per IP. Keys hold a hash of the
 * phone or IP, never the value itself.
 */
export class OtpRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limits: OtpRateLimits = DEFAULT_OTP_RATE_LIMITS,
    private readonly prefix = 'identity:otp',
  ) {}

  /** Records one send for this phone and IP, or throws 429 with `retryAfterSeconds`. */
  async consume(phone: string, ip?: string): Promise<void> {
    const phoneKey = this.key('phone', phone);

    // Cooldown first: a refused resend must not use up the hourly allowance.
    if (this.limits.cooldownSeconds > 0) {
      const cooldownKey = this.key('cooldown', phone);
      const set = await this.redis.set(cooldownKey, '1', 'EX', this.limits.cooldownSeconds, 'NX');
      if (set === null)
        throw tooMany(
          IdentityErrors.otpResendTooSoon,
          'A code was sent a moment ago',
          await this.secondsLeft(cooldownKey, this.limits.cooldownSeconds),
        );
    }

    if ((await this.hit(phoneKey)) > this.limits.maxPerPhonePerHour)
      throw tooMany(
        IdentityErrors.otpRateLimited,
        'Too many codes requested for this phone',
        await this.secondsLeft(phoneKey, HOUR_SECONDS),
      );

    if (ip) {
      const ipKey = this.key('ip', ip);
      if ((await this.hit(ipKey)) > this.limits.maxPerIpPerHour)
        throw tooMany(
          IdentityErrors.otpRateLimited,
          'Too many codes requested from this network',
          await this.secondsLeft(ipKey, HOUR_SECONDS),
        );
    }
  }

  /** Increments an hourly counter; the hour starts at the first hit. */
  private async hit(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, HOUR_SECONDS);
    return count;
  }

  private async secondsLeft(key: string, fallback: number): Promise<number> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : fallback;
  }

  private key(kind: string, value: string): string {
    return `${this.prefix}:${kind}:${createHash('sha256').update(value).digest('hex')}`;
  }
}
