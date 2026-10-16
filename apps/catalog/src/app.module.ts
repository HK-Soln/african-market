import { Module } from '@nestjs/common';
import { ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { CatalogModule } from './catalog/catalog.module';
import { dataSourceConfig } from './data-source';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'catalog' }),
    DatabaseModule.forService(dataSourceConfig),
    CatalogModule,
  ],
})
export class AppModule {}
