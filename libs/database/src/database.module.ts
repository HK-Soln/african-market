import { DynamicModule, Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HealthService } from '@am/core';
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
      imports: [
        TypeOrmModule.forRoot(buildDataSourceOptions(config)),
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
