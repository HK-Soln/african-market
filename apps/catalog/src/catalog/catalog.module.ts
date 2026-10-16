import { Module, OnModuleInit } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBus } from '@am/core';
import { IdempotentConsumer, OutboxService } from '@am/database';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';
import { SearchSnapshotService } from './search-snapshot.service';
import { ShopEvents } from './shop-events';

@Module({
  controllers: [CatalogController],
  providers: [
    {
      provide: CategoriesService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new CategoriesService(dataSource),
    },
    {
      provide: ProductsService,
      inject: [getDataSourceToken(), OutboxService],
      useFactory: (dataSource: DataSource, outbox: OutboxService) =>
        new ProductsService(dataSource, outbox),
    },
    {
      provide: SearchSnapshotService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new SearchSnapshotService(dataSource),
    },
    {
      provide: ShopEvents,
      inject: [OutboxService],
      useFactory: (outbox: OutboxService) => new ShopEvents(outbox),
    },
  ],
})
export class CatalogModule implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
    private readonly shops: ShopEvents,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('shop.created', (event) =>
      this.once
        .handle(event, 'catalog.shop-owner', (m) => this.shops.shopCreated(m, event.payload))
        .then(() => undefined),
    );
    // Products of shops that are not verified are not public.
    this.bus.subscribe('shop.verified', (event) =>
      this.once
        .handle(event, 'catalog.shop-verified', (m) =>
          this.shops.shopVerified(m, event.payload, new Date(event.occurredAt)),
        )
        .then(() => undefined),
    );
    this.bus.subscribe('branch.updated', (event) =>
      this.once
        .handle(event, 'catalog.branch', (m) =>
          this.shops.branchUpdated(
            m,
            event.payload,
            new Date(event.occurredAt),
            event.correlationId,
          ),
        )
        .then(() => undefined),
    );
  }
}
