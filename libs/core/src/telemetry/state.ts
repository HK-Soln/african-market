/** What startTelemetry turned on, for the start-up log line and for shutdown. */
export interface TelemetryState {
  service: string;
  exportingTo?: string;
  sampleRatio: number;
  sentry: boolean;
  shutdown: () => Promise<void>;
}

let current: TelemetryState | undefined;

export const setTelemetryState = (state: TelemetryState): void => {
  current = state;
};

export const telemetryState = (): TelemetryState | undefined => current;

/** One line for the start-up log: what is traced, where it goes, and whether errors are reported. */
export function describeTelemetry(): string {
  if (!current) return 'telemetry: not started';
  const traces = current.exportingTo
    ? `traces to ${current.exportingTo} (sampled ${current.sampleRatio})`
    : 'traces not exported (OTEL_EXPORTER_OTLP_ENDPOINT unset)';
  const errors = current.sentry ? 'errors to Sentry' : 'Sentry off (SENTRY_DSN unset)';
  return `telemetry: ${traces}; ${errors}`;
}

/** Sends what is still buffered (spans, error reports). Called once, as the app stops. */
export async function shutdownTelemetry(): Promise<void> {
  const state = current;
  current = undefined;
  await state?.shutdown();
}
