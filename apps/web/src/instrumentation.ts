import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

/**
 * Runs once when the server (Node or edge) starts: checks the settings read at run time, then
 * error reports from server code.
 */
export async function register(): Promise<void> {
  // NEXT_RUNTIME is set by Next itself, not one of our settings.
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/check-server-settings');
  if (sentryOptions) Sentry.init(sentryOptions);
}

/** Errors in server components, route handlers and middleware; nothing is sent while Sentry is off. */
export const onRequestError = Sentry.captureRequestError;
