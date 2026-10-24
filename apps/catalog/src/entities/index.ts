import { BranchListing } from './branch-listing.entity';
import { Category } from './category.entity';
import { KnownBranch } from './known-branch.entity';
import { KnownShop } from './known-shop.entity';
import { Product } from './product.entity';
import { ProductReport } from './product-report.entity';
import { Variant } from './variant.entity';

export * from './branch-listing.entity';
export * from './category.entity';
export * from './known-branch.entity';
export * from './known-shop.entity';
export * from './product.entity';
export * from './product-report.entity';
export * from './variant.entity';

/** TypeORM entities owned by the catalog service. */
export const entities = [
  Category,
  Product,
  Variant,
  BranchListing,
  KnownShop,
  KnownBranch,
  ProductReport,
];
