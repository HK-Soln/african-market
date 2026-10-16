import { Module } from '@nestjs/common';
import { ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { dataSourceConfig } from './data-source';
import { ShopsModule } from './shops/shops.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'shops' }),
    DatabaseModule.forService(dataSourceConfig),
    ShopsModule,
  ],
})
export class AppModule {}
