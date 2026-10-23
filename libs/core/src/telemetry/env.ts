import { z } from 'zod';
import { noneMeansOff } from '../settings';

const httpUrl = () => z.url({ protocol: /^https?$/ });

/**
 * Tracing and error reporting. Each can be off (`none`), and each app says at start
 * whether it is on (`describeTelemetry`).
 */
export const telemetryEnvShape = {
  /**
   * Where traces are sent, over OTLP/HTTP (`<endpoint>/v1/traces`): the collector beside each
   * task in AWS. `none`: spans are still made, so trace ids reach logs and events, but go nowhere.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: noneMeansOff(httpUrl()),
  /** Share of new traces kept (0 to 1). A trace that arrives from a caller keeps its decision. */
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1),
  /** Sentry project DSN for error reports. `none`: nothing is sent. */
  SENTRY_DSN: noneMeansOff(httpUrl()),
};
