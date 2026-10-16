import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { TRACE_CONTEXT_KEY } from '@am/contracts';
import {
  currentTrace,
  extractTraceContext,
  injectTraceContext,
  takeTraceCarrier,
  tracer,
  withTraceCarrier,
} from './context';

describe('trace context helpers', () => {
  it('do nothing while tracing is not started', () => {
    tracer().startActiveSpan('request', (span) => {
      expect(currentTrace()).toBeUndefined();
      expect(injectTraceContext()).toBeUndefined();
      expect(withTraceCarrier({ a: 1 })).toEqual({ a: 1 });
      span.end();
    });
  });

  describe('with tracing', () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    beforeAll(() => provider.register());
    afterAll(() => provider.shutdown());

    it('carry the trace across a TCP payload and take it off again', () => {
      tracer().startActiveSpan('request', (span) => {
        const sent = withTraceCarrier({ query: { limit: 5 } });
        expect(sent).toEqual({
          query: { limit: 5 },
          [TRACE_CONTEXT_KEY]: { traceparent: expect.stringMatching(/^00-[0-9a-f]{32}-/) },
        });

        const received = JSON.parse(JSON.stringify(sent)) as Record<string, unknown>;
        const parent = extractTraceContext(takeTraceCarrier(received));
        expect(received).toEqual({ query: { limit: 5 } });
        expect(trace.getSpanContext(parent)).toMatchObject({
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
        });
        expect(currentTrace()).toEqual({
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
        });
        span.end();
      });
    });

    it('leave payloads that are not objects alone', () => {
      tracer().startActiveSpan('request', (span) => {
        expect(withTraceCarrier('text')).toBe('text');
        expect(withTraceCarrier([1, 2])).toEqual([1, 2]);
        expect(takeTraceCarrier('text')).toBeUndefined();
        span.end();
      });
    });

    it('start a new trace from a carrier that is missing or malformed', () => {
      for (const carrier of [undefined, null, 'x', { traceparent: 42 }, { traceparent: 'nope' }]) {
        expect(trace.getSpanContext(extractTraceContext(carrier))).toBeUndefined();
      }
      expect(context.active()).toBe(ROOT_CONTEXT);
    });
  });
});
