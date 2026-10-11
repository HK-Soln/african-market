import { DynamicModule, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_ENV, BaseEnv, baseEnvSchema, loadEnv, SERVICE_NAME } from './env';
import { EventBus } from './event-bus';
import { HealthController, HealthService } from './health';

export interface ServiceCoreOptions {
  /** Service name, e.g. 'identity'. Used for logs, queues and health. */
  name: string;
  /** Extra env keys this service needs, merged into the base schema. */
  envSchema?: z.ZodObject;
}

/**
 * Everything a NestJS service needs besides its domain: validated env,
 * structured JSON logs with request ids, health endpoints and the event bus.
 * Import once in each service's AppModule: `ServiceCoreModule.forRoot({ name: 'shops' })`.
 */
@Global()
@Module({})
export class ServiceCoreModule {
  static forRoot(options: ServiceCoreOptions): DynamicModule {
    const schema = options.envSchema
      ? baseEnvSchema.extend(options.envSchema.shape)
      : baseEnvSchema;
    // Whatever a service adds, the base keys are always there; this module only reads those.
    const env: BaseEnv = loadEnv(schema) as BaseEnv;
    return {
      module: ServiceCoreModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            name: options.name,
            // Request logs must never carry a session: these hold the access and refresh tokens.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
            genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        }),
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_ENV, useValue: env },
        { provide: SERVICE_NAME, useValue: options.name },
        HealthService,
        EventBus,
      ],
      exports: [APP_ENV, SERVICE_NAME, HealthService, EventBus],
    };
  }
}
