import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

/** Global: phone sign-up checks the number's country. */
@Global()
@Module({
  controllers: [CountriesController],
  providers: [
    {
      provide: CountriesService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new CountriesService(dataSource),
    },
  ],
  exports: [CountriesService],
})
export class CountriesModule {}
