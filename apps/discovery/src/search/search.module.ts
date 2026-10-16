import { Module, OnModuleInit } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBus, loadServiceEndpoints, ServiceClient } from '@am/core';
import { IdempotentConsumer } from '@am/database';
import { EmiratesService } from './emirates.service';
import { SearchIndexer } from './indexer';
import { SEARCH_OWNERS, SearchOwners, TcpSearchOwners } from './owners';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [
    {
      provide: SEARCH_OWNERS,
      useFactory: (): SearchOwners => {
        const endpoints = loadServiceEndpoints();
        return new TcpSearchOwners(
          new ServiceClient('shops', endpoints.shops),
          new ServiceClient('catalog', endpoints.catalog),
        );
      },
    },
    {
      provide: SearchIndexer,
      inject: [getDataSourceToken(), SEARCH_OWNERS],
      useFactory: (dataSource: DataSource, owners: SearchOwners) =>
        new SearchIndexer(dataSource, owners),
    },
    {
      provide: EmiratesService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new EmiratesService(dataSource),
    },
    {
      provide: SearchService,
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => new SearchService(dataSource),
    },
  ],
})
export class SearchModule implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
    private readonly indexer: SearchIndexer,
  ) {}

  onModuleInit(): void {
    // Events carry ids only: each one makes discovery read the owner's current state. A failed
    // read (the owner restarting) throws, and the event bus retries the event.
    for (const name of [
      'shop.created',
      'shop.updated',
      'shop.verified',
      'branch.updated',
    ] as const) {
      this.bus.subscribe(name, (event) =>
        this.once
          .handle(event, `discovery.${name}`, (m) =>
            this.indexer.indexShop(m, event.payload.shopId),
          )
          .then(() => undefined),
      );
    }
    for (const name of ['product.upserted', 'product.removed'] as const) {
      this.bus.subscribe(name, (event) =>
        this.once
          .handle(event, `discovery.${name}`, (m) =>
            this.indexer.indexProduct(m, event.payload.productId, event.payload.shopId),
          )
          .then(() => undefined),
      );
    }
    this.bus.subscribe('media.ready', (event) =>
      this.once
        .handle(event, 'discovery.media', (m) => this.indexer.mediaReady(m, event.payload))
        .then(() => undefined),
    );
  }
}
