import { z } from 'zod';

/**
 * How a setting says its feature is off, written out like any other value. Not an empty value:
 * ECS drops environment variables that are empty, so in AWS it would arrive as missing.
 */
export const OFF = 'none';

const notEmpty = () => z.string().min(1, `empty: write \`${OFF}\` to switch it off`);

/**
 * A setting whose feature can be off. The key must still be set, so a forgotten value stops the
 * app instead of quietly switching the feature off: `none` comes out as `undefined`, anything
 * else must pass `schema`.
 */
export const noneMeansOff = <T extends z.ZodType<unknown, string> = z.ZodString>(schema?: T) =>
  notEmpty()
    .transform((value) => (value === OFF ? undefined : value))
    .pipe((schema ?? z.string()).optional() as z.ZodOptional<T>);

/** A comma-separated list (spaces around items ignored), or `none` for an empty one. */
export const listOrNone = <T extends z.ZodType<unknown, string>>(item: T) =>
  notEmpty()
    .transform((value) =>
      value === OFF
        ? []
        : value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
    )
    .pipe(z.array(item));

/** `true` or `false`, written out: a switch with no default. */
export const flag = () => z.stringbool();

/** Which environment a process runs in. Only safety checks read it (refusing fakes in production). */
export const DEPLOY_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];

/** Staging and production: real customers' data, or a rehearsal of it. */
export const isDeployed = (env: { DEPLOY_ENV: DeployEnv }): boolean =>
  env.DEPLOY_ENV === 'staging' || env.DEPLOY_ENV === 'production';
