import { DataSource, EntityManager, In } from 'typeorm';
import {
  ProductSearchSnapshot,
  ProductSearchSnapshotRequest,
  ProductSearchSnapshotResponse,
  ShopProductSnapshotsRequest,
  ShopProductSnapshotsResponse,
} from '@am/contracts';
import { BranchListing, Product, Variant } from '../entities';

/**
 * What discovery reads to build its search read model (F1-05). The status is passed as it is:
 * discovery decides what is public from it and from the shop's verification, which it reads from
 * the shops service itself (the two events can reach catalog and discovery in either order).
 */
export class SearchSnapshotService {
  constructor(private readonly dataSource: DataSource) {}

  async product(input: ProductSearchSnapshotRequest): Promise<ProductSearchSnapshotResponse> {
    return this.read(async (manager, observedAt) => {
      const product = await manager.findOneBy(Product, { id: input.productId });
      if (!product) return null;
      return (await this.snapshots(manager, [product], observedAt))[0];
    });
  }

  async shopProducts(input: ShopProductSnapshotsRequest): Promise<ShopProductSnapshotsResponse> {
    return this.read(async (manager, observedAt) => {
      const products = await manager.findBy(Product, { shopId: input.shopId });
      return { products: await this.snapshots(manager, products, observedAt), observedAt };
    });
  }

  private read<T>(fn: (manager: EntityManager, observedAt: string) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const [{ now }] = await manager.query(`SELECT transaction_timestamp() AS now`);
      return fn(manager, new Date(now).toISOString());
    });
  }

  private async snapshots(
    manager: EntityManager,
    products: Product[],
    observedAt: string,
  ): Promise<ProductSearchSnapshot[]> {
    if (!products.length) return [];
    const ids = products.map((p) => p.id);
    const variants = await manager.findBy(Variant, { productId: In(ids) });
    const listings = await manager.findBy(BranchListing, { productId: In(ids) });
    const price = new Map(variants.map((v) => [v.id, v.priceFils]));

    return products.map((product) => {
      const own = variants.filter((v) => v.productId === product.id);
      const inStock = listings.filter((l) => l.productId === product.id && l.inStock);
      // A branch price wins at that branch; without listings, the variants' own prices.
      const prices = (
        inStock.length
          ? inStock.map((l) => l.priceOverrideFils ?? price.get(l.variantId) ?? null)
          : own.map((v) => v.priceFils)
      ).filter((p): p is number => p !== null);
      return {
        productId: product.id,
        shopId: product.shopId,
        status: product.status,
        title: product.title,
        description: product.description,
        categoryId: product.categoryId,
        originCountry: product.originCountry,
        imageMediaIds: product.imageMediaIds,
        minPriceFils: prices.length ? Math.min(...prices) : null,
        branchIds: [...new Set(inStock.map((l) => l.branchId))].sort(),
        observedAt,
      };
    });
  }
}
