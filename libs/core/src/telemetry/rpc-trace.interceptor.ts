import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { context, SpanKind, trace } from '@opentelemetry/api';
import { finalize, Observable, tap } from 'rxjs';
import { AppRpcException } from '../rpc-error';
import { extractTraceContext, failSpan, takeTraceCarrier, tracer } from './context';
import { reportError } from './report';

/** An error that is the service's fault, not the caller's: anything but a 4xx AppRpcException. */
export function isServerFault(error: unknown): boolean {
  if (!(error instanceof AppRpcException)) return true;
  const body = error.getError();
  return typeof body === 'object' && body !== null && 'status' in body
    ? Number(body.status) >= 500
    : true;
}

/**
 * Continues the gateway's trace in a service: takes the trace context off the TCP payload,
 * runs the handler inside a span named after the pattern, and reports server faults to Sentry.
 * Registered for every app by ServiceCoreModule; HTTP requests pass straight through, the HTTP
 * instrumentation traces those.
 */
@Injectable()
export class RpcTraceInterceptor implements NestInterceptor {
  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (execution.getType() !== 'rpc') return next.handle();
    const rpc = execution.switchToRpc();
    const parent = extractTraceContext(takeTraceCarrier(rpc.getData()));
    const tcp: unknown = rpc.getContext();
    const pattern =
      typeof (tcp as { getPattern?: unknown })?.getPattern === 'function'
        ? String((tcp as { getPattern: () => unknown }).getPattern())
        : execution.getHandler().name;

    const span = tracer().startSpan(
      pattern,
      { kind: SpanKind.SERVER, attributes: { 'rpc.system': 'nest-tcp', 'rpc.method': pattern } },
      parent,
    );
    // Nest binds the handler to the async context current when handle() is called, so calling
    // it inside the span's context runs the handler, and everything it awaits, in that span.
    return context
      .with(trace.setSpan(parent, span), () => next.handle())
      .pipe(
        tap({
          error: (error: unknown) => {
            if (!isServerFault(error)) return;
            failSpan(span, error);
            context.with(trace.setSpan(parent, span), () => reportError(error, { pattern }));
          },
        }),
        finalize(() => span.end()),
      );
  }
}
