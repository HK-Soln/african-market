import { z } from 'zod';
import { SERVICE_NAMES, ServiceName } from '@am/contracts';
import { DEPLOY_ENVS, flag } from './settings';
import { telemetryEnvShape } from './telemetry/env';

// The only place backend code reads process.env: everything else receives typed values from
// loadEnv (or APP_ENV in Nest). The lint rule `no-restricted-properties` keeps it that way.
//
// No defaults, for anything (decision T-45): every key a process reads must be set, or it stops
// at start and names the missing key. A value that happens to be the same everywhere today is
// still written down in each environment, so nothing runs on a value nobody chose. A feature
// that can be off (Sentry, tracing, a provider's keys) is set to `none`: the key is still
// required, so a forgotten value is never mistaken for a decision.

/** Variables every backend process needs. Services extend this with their own keys. */
export const baseEnvSchema = z.object({
  /**
   * development, test (CI and the throwaway AWS environment), staging or production. Not
   * NODE_ENV: Next and React read that one to mean "production build", and Nx loads .env into
   * every task, so it cannot double as the environment's name.
   */
  DEPLOY_ENV: z.enum(DEPLOY_ENVS),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  /** `json` (one line per entry, for machines) or `pretty` (for a person reading a terminal). */
  LOG_FORMAT: z.enum(['json', 'pretty']),
  DATABASE_URL: z.url(),
  RABBITMQ_URL: z.url(),
  REDIS_URL: z.url(),
  /** The topic exchange events are published to, `am.events`; tests use their own. */
  EVENTS_EXCHANGE: z.string().min(1),
  /**
   * How long a failed event waits before each new try, in ms. When the list runs out the event
   * goes to the dead-letter queue, e.g. `5000,30000,120000`: three retries, after 5 s, 30 s, 2 min.
   */
  EVENT_RETRY_DELAYS_MS: z.string().regex(/^\d+(,\d+)*$/),
  /** Log every SQL query (`true`) or only errors. */
  TYPEORM_LOGGING: flag(),
  /** How often the outbox relay looks for events to publish, in ms. */
  OUTBOX_POLL_MS: z.coerce.number().int().positive(),
  ...telemetryEnvShape,
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** Parses `process.env` against a schema and fails fast with a readable message. */
export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const key = issue.path.join('.');
        const missing = issue.path.length === 1 && source[key] === undefined;
        return `  ${key}: ${missing ? 'not set (every key is required; see .env.example)' : issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export interface ServiceEndpoint {
  host: string;
  tcpPort: number;
  httpPort: number;
}

const envPrefix = (name: ServiceName) => name.toUpperCase();
const port = () => z.coerce.number().int().positive();

/**
 * `<NAME>_HOST`, `<NAME>_TCP_PORT` and `<NAME>_HTTP_PORT` for every service, all required. The
 * usual ports are in SERVICES (libs/contracts); tests and the end-to-end run choose others.
 */
export const serviceEndpointsSchema = z.object(
  Object.fromEntries(
    SERVICE_NAMES.flatMap((name) => [
      [`${envPrefix(name)}_HOST`, z.string().min(1)],
      [`${envPrefix(name)}_TCP_PORT`, port()],
      [`${envPrefix(name)}_HTTP_PORT`, port()],
    ]),
  ),
);

/** Where each service is reached: for the gateway. */
export function loadServiceEndpoints(
  source: NodeJS.ProcessEnv = process.env,
): Record<ServiceName, ServiceEndpoint> {
  // The schema's keys are built from SERVICE_NAMES, so TypeScript only knows them as strings.
  const env = loadEnv(serviceEndpointsSchema, source) as Record<string, string | number>;
  return Object.fromEntries(
    SERVICE_NAMES.map((name) => [
      name,
      {
        host: env[`${envPrefix(name)}_HOST`] as string,
        tcpPort: env[`${envPrefix(name)}_TCP_PORT`] as number,
        httpPort: env[`${envPrefix(name)}_HTTP_PORT`] as number,
      },
    ]),
  ) as Record<ServiceName, ServiceEndpoint>;
}

/** The ports a service listens on: for the service itself, which needs no host. */
export function loadServicePorts(
  name: ServiceName,
  source: NodeJS.ProcessEnv = process.env,
): Omit<ServiceEndpoint, 'host'> {
  const prefix = envPrefix(name);
  const env = loadEnv(
    serviceEndpointsSchema.pick({ [`${prefix}_TCP_PORT`]: true, [`${prefix}_HTTP_PORT`]: true }),
    source,
  ) as Record<string, number>;
  return { tcpPort: env[`${prefix}_TCP_PORT`], httpPort: env[`${prefix}_HTTP_PORT`] };
}

export const APP_ENV = Symbol('APP_ENV');
export const SERVICE_NAME = Symbol('SERVICE_NAME');
