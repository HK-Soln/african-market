import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_ENV, BaseEnv, baseEnvSchema, loadEnv, SERVICE_NAME } from './env';
import { EventBus } from './event-bus';
import { HealthController, HealthService } from './health';
import { isHealthProbe } from './health-probe';
import { currentTrace } from './telemetry/context';
import { TelemetryShutdown } from './telemetry/lifecycle';
import { RpcTraceInterceptor } from './telemetry/rpc-trace.interceptor';

/** A request id a caller may choose: short, and safe to echo back and to log. */
const REQUEST_ID = /^[\w.:-]{1,128}$/;

export interface ServiceCoreOptions {
  /** Service name, e.g. 'identity'. Used for logs, queues and health. */
  name: string;
  /** Extra env keys this service needs, merged into the base schema. */
  envSchema?: z.ZodObject;
}

/**
 * Everything a NestJS service needs besides its domain: validated env,
 * structured JSON logs with request and trace ids, health endpoints, the event bus, and tracing
 * of TCP calls (startTelemetry, in the app's instrument.ts, does the rest).
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
            // Containers and the load balancer call these every few seconds and report failures
            // themselves; logging each one would bury everything else.
            autoLogging: { ignore: (req) => isHealthProbe(req) },
            // Every line logged inside a trace says which one, so logs and traces join up.
            mixin: () => {
              const trace = currentTrace();
              return trace ? { traceId: trace.traceId, spanId: trace.spanId } : {};
            },
            // The trace id doubles as the request id (and so as the events' correlationId), and
            // goes back in the response, for a person reporting a problem to quote.
            genReqId: (req, res) => {
              const header = req.headers['x-request-id'];
              const id =
                (typeof header === 'string' && REQUEST_ID.test(header) && header) ||
                currentTrace()?.traceId ||
                randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            transport:
              env.LOG_FORMAT === 'pretty'
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
        TelemetryShutdown,
        { provide: APP_INTERCEPTOR, useClass: RpcTraceInterceptor },
      ],
      exports: [APP_ENV, SERVICE_NAME, HealthService, EventBus],
    };
  }
}
