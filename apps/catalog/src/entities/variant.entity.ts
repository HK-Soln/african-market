import { Check, Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@am/database';

/** One sellable version of a product (a size, a colour). Every product has at least one. */
@Entity({ name: 'variant' })
@Index('variant_product_idx', ['productId', 'sort'])
@Index('variant_shop_sku_uq', ['shopId', 'sku'], {
  unique: true,
  where: 'sku IS NOT NULL AND deleted_at IS NULL',
})
@Check('variant_price_chk', `price_fils IS NULL OR price_fils >= 0`)
@Check('variant_compare_at_chk', `compare_at_fils IS NULL OR compare_at_fils > price_fils`)
export class Variant extends AppBaseEntity {
  @Column({ type: 'uuid' })
  productId!: string;

  /** The product's shop, so a SKU is unique within the shop. */
  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'text', nullable: true })
  sku!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  options!: Record<string, string>;

  /** Integer fils, VAT included. Null only for a service priced on request. */
  @Column({ type: 'int', nullable: true })
  priceFils!: number | null;

  @Column({ type: 'int', nullable: true })
  compareAtFils!: number | null;

  @Column({ type: 'int', default: 0 })
  sort!: number;
}
