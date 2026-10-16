import { Module } from '@nestjs/common';
import { CatalogueController, PublicShopsController, SearchController } from './public.controller';

/** What anyone may read: search, shop and product pages, categories and emirates. */
@Module({ controllers: [SearchController, CatalogueController, PublicShopsController] })
export class PublicModule {}
