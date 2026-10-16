import { z } from 'zod';

/** An optional http(s) URL where an empty value means the same as no value: switched off. */
const optionalUrl = z
  .union([z.literal(''), z.url({ protocol: /^https?$/ })])
  .optional()
  .transform((value) => value || undefined);

/**
 * Tracing and error reporting. Both are optional: an app runs the same without them, and each
 * says at start whether it is on (`describeTelemetry`).
 */
export const telemetryEnvShape = {
  /**
   * Where traces are sent, over OTLP/HTTP (`<endpoint>/v1/traces`): the collector beside each
   * task in AWS. Unset: spans are still made, so trace ids reach logs and events, but go nowhere.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  /** Share of new traces kept (0 to 1). A trace that arrives from a caller keeps its decision. */
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(1),
  /** Sentry project DSN for error reports. Unset: nothing is sent. */
  SENTRY_DSN: optionalUrl,
};
