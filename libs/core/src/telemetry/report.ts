import * as Sentry from '@sentry/node';
import { currentTrace } from './context';

/**
 * Reports an error a person should look at (a 500, an event sent to the dead-letter queue) to
 * Sentry, tagged with the trace id so the report leads to the trace and the logs. Does nothing
 * when Sentry is off. Expected failures (a 4xx, a retry that may still succeed) are not reported.
 */
export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  const trace = currentTrace();
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    if (trace) scope.setTag('trace_id', trace.traceId);
    Sentry.captureException(error);
  });
}
