import { z } from 'zod';
import { EVENTS_EXCHANGE } from '@am/contracts';

/** Variables every backend process needs. Services extend this with their own keys. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().default('postgres://am:am@localhost:5432/african_market'),
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
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/** Parses `process.env` against a schema and fails fast with a readable message. */
export function loadEnv<T extends z.ZodTypeAny>(
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

export const APP_ENV = Symbol('APP_ENV');
export const SERVICE_NAME = Symbol('SERVICE_NAME');
