import { DynamicModule, Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_ENV, BaseEnv, HealthService } from '@am/core';
import { buildDataSourceOptions, ServiceDataSourceConfig } from './data-source';
import { IdempotentConsumer, OutboxRelay, OutboxService } from './outbox.service';

/**
 * Connects a service to its own Postgres schema and wires the outbox.
 * Requires ServiceCoreModule (for EventBus and HealthService) to be imported first.
 */
@Module({})
export class DatabaseModule implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly health: HealthService,
  ) {}

  static forService(config: ServiceDataSourceConfig): DynamicModule {
    return {
      module: DatabaseModule,
      // Global, so a service's feature modules can inject the DataSource and OutboxService.
      global: true,
      imports: [
        // DATABASE_URL from the validated environment, when the module starts.
        TypeOrmModule.forRootAsync({
          inject: [APP_ENV],
          useFactory: (env: Pick<BaseEnv, 'DATABASE_URL'>) =>
            buildDataSourceOptions({ ...config, url: config.url ?? env.DATABASE_URL }),
        }),
        TypeOrmModule.forFeature(config.entities),
      ],
      providers: [OutboxService, OutboxRelay, IdempotentConsumer],
      exports: [TypeOrmModule, OutboxService, IdempotentConsumer],
    };
  }

  onModuleInit(): void {
    this.health.register('postgres', async () => {
      await this.dataSource.query('SELECT 1');
      return true;
    });
  }
}
