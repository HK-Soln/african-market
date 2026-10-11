import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { IdentityErrors } from '@am/contracts';
import { identityError } from '../errors';

export interface LoginRateLimits {
  /** Wrong passwords allowed for one email before it is locked for the window. */
  maxFailuresPerEmail: number;
  /** Wrong passwords allowed from one IP, across all emails, in the window. */
  maxFailuresPerIp: number;
  windowSeconds: number;
}

export const DEFAULT_LOGIN_RATE_LIMITS: LoginRateLimits = {
  maxFailuresPerEmail: 5,
  maxFailuresPerIp: 30,
  windowSeconds: 15 * 60,
};

/**
 * Slows password guessing. Only failures are counted, so a person who signs in correctly is never
 * locked out by their own successes; a correct sign-in clears the count for that email. Keys hold
 * a hash of the email or IP, never the value itself.
 */
export class LoginRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limits: LoginRateLimits = DEFAULT_LOGIN_RATE_LIMITS,
    private readonly prefix = 'identity:login',
  ) {}

  /** Throws 429 with `retryAfterSeconds` when the email or the IP has failed too often. */
  async assertAllowed(email: string, ip?: string): Promise<void> {
    await this.assertBelow(this.key('email', email), this.limits.maxFailuresPerEmail);
    if (ip) await this.assertBelow(this.key('ip', ip), this.limits.maxFailuresPerIp);
  }

  async recordFailure(email: string, ip?: string): Promise<void> {
    await this.hit(this.key('email', email));
    if (ip) await this.hit(this.key('ip', ip));
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key('email', email));
  }

  private async assertBelow(key: string, max: number): Promise<void> {
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures < max) return;
    const ttl = await this.redis.ttl(key);
    throw identityError(IdentityErrors.loginRateLimited, {
      retryAfterSeconds: ttl > 0 ? ttl : this.limits.windowSeconds,
    });
  }

  private async hit(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, this.limits.windowSeconds);
  }

  private key(kind: string, value: string): string {
    return `${this.prefix}:${kind}:${createHash('sha256').update(value).digest('hex')}`;
  }
}
