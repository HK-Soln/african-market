import { Module } from '@nestjs/common';
import { ServiceCoreModule } from '@am/core';
import { DatabaseModule } from '@am/database';
import { dataSourceConfig } from './data-source';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ServiceCoreModule.forRoot({ name: 'discovery' }),
    DatabaseModule.forService(dataSourceConfig),
    SearchModule,
  ],
})
export class AppModule {}
