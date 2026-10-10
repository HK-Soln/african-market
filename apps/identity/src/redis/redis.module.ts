import { Global, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_ENV, BaseEnv, HealthService } from '@am/core';

export const REDIS = Symbol('REDIS');

/** One shared Redis connection for rate limits (and, from F0-05, session lookups). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_ENV],
      useFactory: (env: BaseEnv) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.health.register('redis', async () => (await this.redis.ping()) === 'PONG');
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
