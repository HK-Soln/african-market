import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxService } from '@am/database';
import { BranchesService } from './branches.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  controllers: [ShopsController],
  providers: [
    {
      provide: ShopsService,
      inject: [getDataSourceToken(), OutboxService],
      useFactory: (dataSource: DataSource, outbox: OutboxService) =>
        new ShopsService(dataSource, outbox),
    },
    {
      provide: BranchesService,
      inject: [getDataSourceToken(), OutboxService],
      useFactory: (dataSource: DataSource, outbox: OutboxService) =>
        new BranchesService(dataSource, outbox),
    },
  ],
})
export class ShopsModule {}
