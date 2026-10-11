import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { AppRpcException } from '@am/core';
import { IdentityErrors } from '@am/contracts';
import {
  OTP_MAX_PER_IP_PER_HOUR,
  OTP_MAX_PER_PHONE_PER_HOUR,
  OTP_RESEND_COOLDOWN_MAX_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './otp.constants';

export interface OtpRateLimits {
  /** Wait after the first code. Doubles with each further code in the hour. 0 turns it off. */
  cooldownSeconds: number;
  /** The doubling stops here. */
  maxCooldownSeconds: number;
  maxPerPhonePerHour: number;
  maxPerIpPerHour: number;
}

export const DEFAULT_OTP_RATE_LIMITS: OtpRateLimits = {
  cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  maxCooldownSeconds: OTP_RESEND_COOLDOWN_MAX_SECONDS,
  maxPerPhonePerHour: OTP_MAX_PER_PHONE_PER_HOUR,
  maxPerIpPerHour: OTP_MAX_PER_IP_PER_HOUR,
};

const HOUR_SECONDS = 60 * 60;

const tooMany = (code: string, message: string, retryAfterSeconds: number) =>
  new AppRpcException({ status: 429, code, message, details: { retryAfterSeconds } });

/**
 * Limits how often codes are sent, in Redis so every replica shares the counts: a resend
 * cooldown per phone that doubles with every code sent in the hour (30 s, 1 min, 2 min, 4 min),
 * an hourly cap per phone and an hourly cap per IP. Keys hold a hash of the phone or IP, never
 * the value itself.
 */
export class OtpRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limits: OtpRateLimits = DEFAULT_OTP_RATE_LIMITS,
    private readonly prefix = 'identity:otp',
  ) {}

  /**
   * Records one send to this target (a phone or an email address) from this IP and returns how
   * long the caller must wait before the next one, or throws 429 with `retryAfterSeconds`.
   * Each `scope` has its own cooldown and hourly allowance, so a verification code does not
   * hold up a password reset. The per-IP cap is shared across scopes.
   */
  async consume(
    target: string,
    ip?: string,
    scope = 'sign-in',
  ): Promise<{ resendAfterSeconds: number }> {
    const sentKey = this.key(`sent:${scope}`, target);
    const cooldownKey = this.key(`cooldown:${scope}`, target);
    const base = this.limits.cooldownSeconds;

    // Cooldown first: a refused resend must not use up the hourly allowance. Claiming the key
    // with NX also stops two simultaneous requests from both getting through.
    if (base > 0) {
      const claimed = await this.redis.set(cooldownKey, '1', 'EX', base, 'NX');
      if (claimed === null)
        throw tooMany(
          IdentityErrors.otpResendTooSoon,
          'A code was sent a moment ago',
          await this.secondsLeft(cooldownKey, base),
        );
    }

    const sentThisHour = await this.hit(sentKey);
    if (sentThisHour > this.limits.maxPerPhonePerHour)
      throw tooMany(
        IdentityErrors.otpRateLimited,
        'Too many codes requested',
        await this.secondsLeft(sentKey, HOUR_SECONDS),
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

    if (base === 0) return { resendAfterSeconds: 0 };
    // 1st code: base. 2nd: 2 x base. 3rd: 4 x base, and so on up to the cap.
    const resendAfterSeconds = Math.min(
      base * 2 ** (sentThisHour - 1),
      this.limits.maxCooldownSeconds,
    );
    await this.redis.expire(cooldownKey, resendAfterSeconds);
    return { resendAfterSeconds };
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
