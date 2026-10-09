import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
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
export function buildDataSourceOptions(config: ServiceDataSourceConfig): DataSourceOptions {
  return {
    type: 'postgres',
    url: config.url ?? process.env.DATABASE_URL ?? 'postgres://am:am@localhost:5432/african_market',
    schema: config.schema,
    entities: [...config.entities, OutboxMessage, ProcessedEvent],
    migrations: config.migrations ?? [],
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: process.env.TYPEORM_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
