import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HEALTH_PATTERN, HealthResponse, SERVICE_NAMES, SERVICES } from '@am/contracts';
import { Public } from '@am/auth';
import { ServiceCaller } from '../common/service-caller';

@ApiTags('health')
@Controller('health')
export class GatewayHealthController {
  constructor(private readonly caller: ServiceCaller) {}

  /** Liveness of the gateway itself. */
  @Public()
  @Get()
  live() {
    return { service: 'gateway', status: 'ok', time: new Date().toISOString() };
  }

  /** Readiness of every service that exists in the current phase (CURRENT_PHASE env, default 0). */
  @Public()
  @Get('services')
  async services() {
    const phase = Number(process.env.CURRENT_PHASE ?? 0);
    const names = SERVICE_NAMES.filter((n) => SERVICES[n].phase <= phase);
    const results = await Promise.all(
      names.map((name) =>
        this.caller.call<HealthResponse>(name, HEALTH_PATTERN, {}, 1500).catch(() => ({
          service: name,
          status: 'down' as const,
          checks: {},
          time: new Date().toISOString(),
        })),
      ),
    );
    return {
      status: results.every((r) => r.status === 'ok') ? 'ok' : 'degraded',
      services: results,
    };
  }
}
