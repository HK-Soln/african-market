import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { HEALTH_PATTERN, HealthResponse } from '@am/contracts';
import { SERVICE_NAME } from './env';

type Check = () => Promise<boolean>;

/** Other modules register dependency checks (postgres, rabbitmq, redis) here. */
@Injectable()
export class HealthService {
  private readonly checks = new Map<string, Check>();

  constructor(@Inject(SERVICE_NAME) private readonly service: string) {}

  register(name: string, check: Check): void {
    this.checks.set(name, check);
  }

  async report(): Promise<HealthResponse> {
    const results: Record<string, 'up' | 'down'> = {};
    for (const [name, check] of this.checks) {
      try {
        results[name] = (await check()) ? 'up' : 'down';
      } catch {
        results[name] = 'down';
      }
    }
    const healthy = Object.values(results).every((r) => r === 'up');
    return {
      service: this.service,
      status: healthy ? 'ok' : 'degraded',
      checks: results,
      time: new Date().toISOString(),
    };
  }
}

/** HTTP liveness for container health checks, plus the TCP pattern the gateway calls. */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  http(): Promise<HealthResponse> {
    return this.health.report();
  }

  @MessagePattern(HEALTH_PATTERN)
  rpc(): Promise<HealthResponse> {
    return this.health.report();
  }
}
