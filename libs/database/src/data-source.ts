import { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { baseEnvSchema, loadEnv } from '@am/core';
import { OutboxMessage, ProcessedEvent } from './outbox.entity';

export interface ServiceDataSourceConfig {
  /** Postgres schema owned by the service, e.g. 'shops'. Services never read other schemas. */
  schema: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any[];
  /** Glob or classes for migrations. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrations?: any[] | string[];
  url?: string;
}

/**
 * One factory for both the Nest runtime and the TypeORM CLI (`src/data-source.ts` in each service).
 * `synchronize` is always false: schema changes ship as migrations only.
 */
/** The keys this file needs. It also runs in the TypeORM CLI, outside Nest, so it loads them itself. */
const databaseEnvSchema = baseEnvSchema.pick({ DATABASE_URL: true, TYPEORM_LOGGING: true });

export function buildDataSourceOptions(config: ServiceDataSourceConfig): DataSourceOptions {
  const env = loadEnv(databaseEnvSchema);
  return {
    type: 'postgres',
    url: config.url ?? env.DATABASE_URL,
    schema: config.schema,
    entities: [...config.entities, OutboxMessage, ProcessedEvent],
    migrations: config.migrations ?? [],
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: env.TYPEORM_LOGGING ? ['query', 'error'] : ['error'],
  };
}

/**
 * DataSource for the TypeORM CLI. TypeORM creates its `<schema>.migrations` bookkeeping table
 * before it runs the first migration, so on an empty database (CI, a new RDS instance) the schema
 * must already exist or `migration:run` fails with `schema "<name>" does not exist`.
 */
class CliDataSource extends DataSource {
  override async initialize(): Promise<this> {
    const { schema, url } = this.options as { schema?: string; url?: string };
    if (schema && url) await ensureSchema(url, schema);
    return super.initialize();
  }
}

async function ensureSchema(url: string, schema: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  // A throwaway connection without a schema, so nothing is looked up in it yet.
  const bootstrap = new DataSource({ type: 'postgres', url });
  await bootstrap.initialize();
  try {
    await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await bootstrap.destroy();
  }
}

/** Default export of each service's `src/data-source.ts`, used by `migration:*` targets. */
export function createCliDataSource(config: ServiceDataSourceConfig): DataSource {
  return new CliDataSource(buildDataSourceOptions(config));
}
