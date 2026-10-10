import 'reflect-metadata';
import { createCliDataSource, ServiceDataSourceConfig } from '@am/database';
import { SERVICES } from '@am/contracts';
import { entities } from './entities';

/** Shared by the Nest runtime (AppModule) and by the TypeORM CLI (`pnpm nx run @am/messaging:migration:run`). */
export const dataSourceConfig: ServiceDataSourceConfig = {
  schema: SERVICES.messaging.schema,
  entities,
  migrations: [__dirname + '/migrations/*.js'],
};

export default createCliDataSource(dataSourceConfig);
