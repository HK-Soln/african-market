// `@am/core/telemetry`: only what an app's src/instrument.ts needs, so that importing it loads
// nothing the instrumentations have to patch (Nest, express, pg) before they are registered.
export { startTelemetry } from './start';
export type { TelemetryState } from './state';
