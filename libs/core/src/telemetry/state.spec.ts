import { trace } from '@opentelemetry/api';
import { describeTelemetry, shutdownTelemetry } from './state';
import { startTelemetry } from './start';
import { testBaseEnv } from '../testing';

const base = testBaseEnv;

describe('startTelemetry', () => {
  afterEach(() => shutdownTelemetry());

  it('says when nothing has started it', () => {
    expect(describeTelemetry()).toBe('telemetry: not started');
  });

  it('makes spans with trace ids even when they are not exported', () => {
    const state = startTelemetry('identity', { ...base, OTEL_EXPORTER_OTLP_ENDPOINT: 'none' });
    expect(state).toMatchObject({ service: 'identity', exportingTo: undefined, sentry: false });
    expect(describeTelemetry()).toBe(
      'telemetry: traces not exported (OTEL_EXPORTER_OTLP_ENDPOINT none); Sentry off (SENTRY_DSN none)',
    );
    const span = trace.getTracer('test').startSpan('work');
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanContext().traceId).not.toBe('0'.repeat(32));
    span.end();
  });

  it('exports to the collector and reports to Sentry when both are set', () => {
    startTelemetry('gateway', {
      ...base,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/',
      OTEL_TRACES_SAMPLE_RATIO: '0.25',
      SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
    });
    expect(describeTelemetry()).toBe(
      'telemetry: traces to http://localhost:4318 (sampled 0.25); errors to Sentry',
    );
  });

  it('stops at start on a value it cannot use', () => {
    expect(() => startTelemetry('gateway', { ...base, SENTRY_DSN: 'not a url' })).toThrow(
      /SENTRY_DSN/,
    );
    expect(() => startTelemetry('gateway', { ...base, OTEL_TRACES_SAMPLE_RATIO: '2' })).toThrow(
      /OTEL_TRACES_SAMPLE_RATIO/,
    );
  });
});
