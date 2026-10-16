import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

/** Runs once when the server (Node or edge) starts: error reports from server code. */
export function register(): void {
  if (sentryOptions) Sentry.init(sentryOptions);
}

/** Errors in server components, route handlers and middleware; nothing is sent while Sentry is off. */
export const onRequestError = Sentry.captureRequestError;
