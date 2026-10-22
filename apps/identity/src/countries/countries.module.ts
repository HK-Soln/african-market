import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CountriesController } from './countries.controller';
import { AuditService } from '../audit/audit.service';
import { CountriesService } from './countries.service';

/** Global: phone sign-up checks the number's country. */
@Global()
@Module({
  controllers: [CountriesController],
  providers: [
    {
      provide: CountriesService,
      inject: [getDataSourceToken(), AuditService],
      useFactory: (dataSource: DataSource, audit: AuditService) =>
        new CountriesService(dataSource, audit),
    },
  ],
  exports: [CountriesService],
})
export class CountriesModule {}
