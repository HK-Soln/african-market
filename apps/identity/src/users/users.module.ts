import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    {
      provide: UsersService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new UsersService(dataSource),
    },
  ],
})
export class UsersModule {}
