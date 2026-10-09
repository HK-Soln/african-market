import { Module } from '@nestjs/common';
import { ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { dataSourceConfig } from './data-source';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'media' }),
    DatabaseModule.forService(dataSourceConfig),
  ],
})
export class AppModule {}
