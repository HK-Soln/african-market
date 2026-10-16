import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

// Runs in the browser before the app: uncaught errors and failed promises are reported.
if (sentryOptions) Sentry.init(sentryOptions);
