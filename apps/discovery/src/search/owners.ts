import {
  CatalogPatterns,
  CategoryDto,
  CategoryList,
  ListVerifiedShopIdsResponse,
  ProductSearchSnapshotResponse,
  ShopProductSnapshotsResponse,
  ShopSearchSnapshotResponse,
  ShopsPatterns,
} from '@am/contracts';
import { ServiceClient } from '@am/core';

/**
 * The services that own what discovery indexes. Discovery reads them when an event says
 * something changed (the events carry ids only) and when it rebuilds; it never reads their schemas.
 */
export interface SearchOwners {
  shop(shopId: string): Promise<ShopSearchSnapshotResponse>;
  verifiedShopIds(after: string | undefined, limit: number): Promise<string[]>;
  product(productId: string): Promise<ProductSearchSnapshotResponse>;
  shopProducts(shopId: string): Promise<ShopProductSnapshotsResponse>;
  /** The active categories. */
  categories(): Promise<CategoryDto[]>;
}

export const SEARCH_OWNERS = Symbol('SEARCH_OWNERS');

export class TcpSearchOwners implements SearchOwners {
  constructor(
    private readonly shops: ServiceClient,
    private readonly catalog: ServiceClient,
  ) {}

  shop(shopId: string) {
    return this.shops.call<ShopSearchSnapshotResponse>(ShopsPatterns.searchSnapshot, { shopId });
  }

  async verifiedShopIds(after: string | undefined, limit: number) {
    const page = await this.shops.call<ListVerifiedShopIdsResponse>(
      ShopsPatterns.listVerifiedShopIds,
      { after, limit },
    );
    return page.shopIds;
  }

  product(productId: string) {
    return this.catalog.call<ProductSearchSnapshotResponse>(CatalogPatterns.productSnapshot, {
      productId,
    });
  }

  shopProducts(shopId: string) {
    return this.catalog.call<ShopProductSnapshotsResponse>(CatalogPatterns.shopProductSnapshots, {
      shopId,
    });
  }

  async categories() {
    return (await this.catalog.call<CategoryList>(CatalogPatterns.listCategories, {})).items;
  }
}
