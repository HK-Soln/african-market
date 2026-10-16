import { Check, Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@am/database';

/** A variant at one of the shop's branches. Removed listings are deleted, not kept. */
@Entity({ name: 'branch_listing' })
@Index('branch_listing_uq', ['branchId', 'variantId'], { unique: true })
@Index('branch_listing_product_idx', ['productId'])
@Index('branch_listing_variant_idx', ['variantId'])
@Check('branch_listing_quantity_chk', `quantity IS NULL OR quantity >= 0`)
@Check('branch_listing_price_chk', `price_override_fils IS NULL OR price_override_fils >= 0`)
export class BranchListing extends AppBaseEntity {
  @Column({ type: 'uuid' })
  branchId!: string;

  @Column({ type: 'uuid' })
  variantId!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'boolean', default: true })
  inStock!: boolean;

  /** Null when the seller does not count stock. */
  @Column({ type: 'int', nullable: true })
  quantity!: number | null;

  @Column({ type: 'int', nullable: true })
  priceOverrideFils!: number | null;
}
