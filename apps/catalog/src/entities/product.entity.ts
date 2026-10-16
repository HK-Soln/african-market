import { Check, Column, Entity, Index } from 'typeorm';
import type {
  FoodDeclarationRecord,
  LocalizedString,
  ProductStatus,
  ProductType,
} from '@am/contracts';
import { AppBaseEntity } from '@am/database';

/** A product or service a shop offers. Only `active` products of verified shops are public. */
@Entity({ name: 'product' })
@Index('product_shop_created_idx', ['shopId', 'createdAt'])
@Index('product_shop_updated_idx', ['shopId', 'updatedAt'])
@Index('product_review_queue_idx', ['submittedAt'], { where: `status = 'pending_review'` })
@Index('product_category_idx', ['categoryId'])
@Check(
  'product_status_chk',
  `status IN ('draft', 'pending_review', 'active', 'hidden', 'rejected')`,
)
@Check('product_type_chk', `type IN ('product', 'service')`)
@Check('product_origin_chk', `origin_country IS NULL OR origin_country ~ '^[A-Z]{2}$'`)
export class Product extends AppBaseEntity {
  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'uuid' })
  categoryId!: string;

  @Column({ type: 'text' })
  type!: ProductType;

  @Column({ type: 'jsonb' })
  title!: LocalizedString;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  description!: LocalizedString;

  /** ISO 3166-1 alpha-2. */
  @Column({ type: 'text', nullable: true })
  originCountry!: string | null;

  /** Media ids (product_image, attached by the gateway); never joined across schemas. */
  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  imageMediaIds!: string[];

  @Column({ type: 'text', default: 'draft' })
  status!: ProductStatus;

  /** Why an admin rejected it; shown to the seller. */
  @Column({ type: 'text', nullable: true })
  reviewReason!: string | null;

  /**
   * When an admin approved the product as it is now. Cleared when the seller changes what was
   * reviewed (category, texts, images, declaration), so the product goes back to review.
   */
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  /** When it last went to review: the review queue's order. */
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** Food categories only. */
  @Column({ type: 'jsonb', nullable: true })
  foodDeclaration!: FoodDeclarationRecord | null;
}
