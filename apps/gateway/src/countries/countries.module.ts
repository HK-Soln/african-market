import { Module } from '@nestjs/common';
import { AdminCountriesController, CountriesController } from './countries.controller';

@Module({ controllers: [CountriesController, AdminCountriesController] })
export class CountriesModule {}
