import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import * as Sentry from '@sentry/node';
import { ERROR_REPORT_DATA_COLLECTION, scrubBreadcrumb, scrubErrorReport } from '@am/contracts';
import { isHealthProbe } from '../health-probe';
import { baseEnvSchema, loadEnv } from '../env';
import { setTelemetryState, telemetryState, type TelemetryState } from './state';

const telemetryEnvSchema = baseEnvSchema.pick({
  NODE_ENV: true,
  OTEL_EXPORTER_OTLP_ENDPOINT: true,
  OTEL_TRACES_SAMPLE_RATIO: true,
  SENTRY_DSN: true,
});

/**
 * Starts tracing (OpenTelemetry) and error reporting (Sentry) for a backend app. Call it before
 * anything else is loaded, from the app's `src/instrument.ts`, which `main.ts` imports first:
 * the instrumentations patch http, express, Nest, pg and ioredis as they are required, and miss
 * whatever was loaded before.
 *
 * Spans are always made, so every log line and event carries a trace id; they are exported only
 * when OTEL_EXPORTER_OTLP_ENDPOINT is set. Sentry runs only when SENTRY_DSN is set, and only for
 * errors: traces go to the collector, not to Sentry.
 */
/** `source` is for tests; apps read process.env (through loadEnv). */
export function startTelemetry(service: string, source?: NodeJS.ProcessEnv): TelemetryState {
  const existing = telemetryState();
  if (existing) return existing;
  const env = loadEnv(telemetryEnvSchema, source);
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, '');

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: service,
      'service.namespace': 'african-market',
      'deployment.environment.name': env.NODE_ENV,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(env.OTEL_TRACES_SAMPLE_RATIO),
    }),
    spanProcessors: endpoint
      ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }))]
      : [],
  });
  // The global tracer, W3C trace-context propagation and an AsyncLocalStorage context manager.
  provider.register();

  const sentryHost = env.SENTRY_DSN ? new URL(env.SENTRY_DSN).hostname : undefined;
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new HttpInstrumentation({
        // Probes every few seconds would be most of the traces, and tell nothing.
        ignoreIncomingRequestHook: (req) => isHealthProbe(req),
        // Sending an error report is not part of the request it reports on.
        ignoreOutgoingRequestHook: (req) => sentryHost !== undefined && req.hostname === sentryHost,
      }),
      // Route and handler spans; one per middleware would bury them.
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      new NestInstrumentation(),
      // Only inside a trace: the outbox relay polls every half second, which is not worth a
      // trace each time. Statements are recorded without their parameters.
      new PgInstrumentation({ requireParentSpan: true }),
      // The command name only: keys and values (OTP counters by phone number) stay out.
      new IORedisInstrumentation({
        requireParentSpan: true,
        dbStatementSerializer: (command) => command,
      }),
    ],
  });

  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      serverName: service,
      initialScope: { tags: { service } },
      // No user fields, cookies, bodies or query strings; scrubErrorReport removes what is left.
      dataCollection: ERROR_REPORT_DATA_COLLECTION,
      beforeSend: (event) => scrubErrorReport(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      // Errors are reported where they are handled (reportError); Sentry does not need to
      // rewrite express as it loads, next to the OpenTelemetry instrumentation.
      enableRuntimeChannelInjection: false,
    });
  }

  const state: TelemetryState = {
    service,
    exportingTo: endpoint,
    sampleRatio: env.OTEL_TRACES_SAMPLE_RATIO,
    sentry: Boolean(env.SENTRY_DSN),
    shutdown: async () => {
      await Promise.allSettled([provider.shutdown(), Sentry.close(2000)]);
    },
  };
  setTelemetryState(state);
  return state;
}
