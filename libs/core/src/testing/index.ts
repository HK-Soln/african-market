import type { BaseEnv } from '../env';

/**
 * `@am/core/testing`: every base key with a throwaway local value, for tests that build an
 * environment by hand (`baseEnvSchema.parse({ ...testBaseEnv, RABBITMQ_URL: url })`). Each test
 * overrides what it is about. Apps never use it: they read their own environment.
 */
export const testBaseEnv = {
  DEPLOY_ENV: 'test',
  LOG_LEVEL: 'fatal',
  LOG_FORMAT: 'json',
  DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
  RABBITMQ_URL: 'amqp://unused:unused@localhost:5672',
  REDIS_URL: 'redis://localhost:6379',
  EVENTS_EXCHANGE: 'am.events.test',
  EVENT_RETRY_DELAYS_MS: '5000,30000,120000',
  TYPEORM_LOGGING: 'false',
  OUTBOX_POLL_MS: '500',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'none',
  OTEL_TRACES_SAMPLE_RATIO: '1',
  SENTRY_DSN: 'none',
} satisfies Record<keyof BaseEnv, string>;
