import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxService } from '@am/database';
import { BranchesService } from './branches.service';
import { SearchSnapshotController } from './search-snapshot.controller';
import { SearchSnapshotService } from './search-snapshot.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  controllers: [ShopsController, SearchSnapshotController],
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
    {
      provide: SearchSnapshotService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new SearchSnapshotService(dataSource),
    },
  ],
})
export class ShopsModule {}
