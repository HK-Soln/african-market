import {
  context,
  type Context,
  isSpanContextValid,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from '@opentelemetry/api';
import { TRACE_CONTEXT_KEY, type TraceCarrier } from '@am/contracts';

/** For callers that make their own spans, without depending on @opentelemetry/api. */
export { SpanKind } from '@opentelemetry/api';

// Without startTelemetry (tests, scripts) the OpenTelemetry API is a no-op: spans have no ids,
// nothing is injected, and every helper here quietly does nothing.

/** The tracer for the spans this kit makes itself: TCP calls and events. */
export const tracer = (): Tracer => trace.getTracer('@am/core');

/** The current trace and span ids, when there is a recorded trace. */
export function currentTrace(): { traceId: string; spanId: string } | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && isSpanContextValid(spanContext)
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : undefined;
}

/** The trace context to send along (`traceparent`, `tracestate`), or undefined if there is none. */
export function injectTraceContext(from: Context = context.active()): TraceCarrier | undefined {
  const carrier: TraceCarrier = {};
  propagation.inject(from, carrier);
  return Object.keys(carrier).length > 0 ? carrier : undefined;
}

/** The context a received carrier continues; the root context when it carries nothing usable. */
export function extractTraceContext(carrier: unknown): Context {
  if (typeof carrier !== 'object' || carrier === null) return ROOT_CONTEXT;
  const strings = Object.fromEntries(
    Object.entries(carrier).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  return propagation.extract(ROOT_CONTEXT, strings);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A TCP payload with the current trace context added (unchanged when there is none). */
export function withTraceCarrier<T>(data: T): T {
  const carrier = injectTraceContext();
  if (!carrier || !isPlainObject(data)) return data;
  return { ...data, [TRACE_CONTEXT_KEY]: carrier };
}

/** Takes the trace context off a received TCP payload, so the handler never sees it. */
export function takeTraceCarrier(data: unknown): unknown {
  if (!isPlainObject(data) || !(TRACE_CONTEXT_KEY in data)) return undefined;
  const carrier = data[TRACE_CONTEXT_KEY];
  delete data[TRACE_CONTEXT_KEY];
  return carrier;
}

/** Marks a span failed with the error that ended it. */
export function failSpan(span: Span, error: unknown): void {
  if (error instanceof Error) span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
}
