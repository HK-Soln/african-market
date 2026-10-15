import { z } from 'zod';
import { EVENTS_EXCHANGE, SERVICE_NAMES, SERVICES, ServiceName } from '@am/contracts';

// The only place backend code reads process.env: everything else receives typed values from
// loadEnv (or APP_ENV in Nest). The lint rule `no-restricted-properties` keeps it that way.

/** Variables every backend process needs. Services extend this with their own keys. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url().default('postgres://am:am@localhost:5432/african_market'),
  RABBITMQ_URL: z.string().default('amqp://am:am@localhost:5672'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** The topic exchange events are published to. Only tests change it, to stay out of the way. */
  EVENTS_EXCHANGE: z.string().min(1).default(EVENTS_EXCHANGE),
  /**
   * How long a failed event waits before each new try, in ms. When the list runs out the event
   * goes to the dead-letter queue: by default three retries, after 5 s, 30 s and 2 min.
   */
  EVENT_RETRY_DELAYS_MS: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .default('5000,30000,120000'),
  /** Log every SQL query (`true`) or only errors. */
  TYPEORM_LOGGING: z.stringbool().default(false),
  /** How often the outbox relay looks for events to publish, in ms. */
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(500),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** Parses `process.env` against a schema and fails fast with a readable message. */
export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

/** NODE_ENV alone, for code that runs before Nest is up (choosing test-only modules). */
export const loadNodeEnv = (source: NodeJS.ProcessEnv = process.env): BaseEnv['NODE_ENV'] =>
  loadEnv(baseEnvSchema.pick({ NODE_ENV: true }), source).NODE_ENV;

export interface ServiceEndpoint {
  host: string;
  tcpPort: number;
  httpPort: number;
}

const envPrefix = (name: ServiceName) => name.toUpperCase();

/**
 * `<NAME>_HOST`, `<NAME>_TCP_PORT` and `<NAME>_HTTP_PORT` for every service, defaulting to
 * localhost and the ports in SERVICES (libs/contracts).
 */
export const serviceEndpointsSchema = z.object(
  Object.fromEntries(
    SERVICE_NAMES.flatMap((name) => [
      [`${envPrefix(name)}_HOST`, z.string().min(1).default('localhost')],
      [
        `${envPrefix(name)}_TCP_PORT`,
        z.coerce.number().int().positive().default(SERVICES[name].tcpPort),
      ],
      [
        `${envPrefix(name)}_HTTP_PORT`,
        z.coerce.number().int().positive().default(SERVICES[name].httpPort),
      ],
    ]),
  ),
);

/** Where each service listens (for itself) and is reached (for the gateway). */
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

export const APP_ENV = Symbol('APP_ENV');
export const SERVICE_NAME = Symbol('SERVICE_NAME');
