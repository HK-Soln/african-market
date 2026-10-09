import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, ServiceDataSourceConfig } from '@am/database';
import { SERVICES } from '@am/contracts';
import { entities } from './entities';

/** Shared by the Nest runtime (AppModule) and by the TypeORM CLI (`pnpm nx run @am/notifications:migration:run`). */
export const dataSourceConfig: ServiceDataSourceConfig = {
  schema: SERVICES.notifications.schema,
  entities,
  migrations: [__dirname + '/migrations/*.js'],
};

export default new DataSource(buildDataSourceOptions(dataSourceConfig));
