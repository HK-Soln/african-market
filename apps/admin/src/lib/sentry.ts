import { ERROR_REPORT_DATA_COLLECTION, scrubBreadcrumb, scrubErrorReport } from '@am/contracts';
import { config } from './config';

/**
 * Sentry's settings for this app's browser, server and edge code (instrumentation-client.ts and
 * instrumentation.ts); undefined while it is off. Errors only: no performance tracing, and no
 * session replay, which records what people type and see. Reports leave the UAE, so nothing that
 * identifies a person goes with them (ERROR_REPORT_DATA_COLLECTION, scrubErrorReport).
 */
export const sentryOptions = config.sentry && {
  dsn: config.sentry.dsn,
  environment: config.sentry.environment,
  initialScope: { tags: { app: 'admin' } },
  dataCollection: ERROR_REPORT_DATA_COLLECTION,
  beforeSend: scrubErrorReport,
  beforeBreadcrumb: scrubBreadcrumb,
};
