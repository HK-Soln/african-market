import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { LocalizedString } from '@am/contracts';

/** One public product (active, of a verified shop), for text search and "matching products". */
@Entity({ name: 'search_product' })
@Index('search_product_shop_idx', ['shopId'])
export class SearchProduct {
  @PrimaryColumn({ type: 'uuid' })
  productId!: string;

  @Column({ type: 'uuid' })
  shopId!: string;

  /** Branches with it in stock. */
  @Index('search_product_branches_idx')
  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  branchIds!: string[];

  @Column({ type: 'jsonb' })
  title!: LocalizedString;

  /** The titles in every language, for typo-tolerant (trigram) matching. */
  @Column({ type: 'text' })
  titleText!: string;

  @Column({ type: 'uuid' })
  categoryId!: string;

  @Column({ type: 'text', nullable: true })
  originCountry!: string | null;

  @Column({ type: 'int', nullable: true })
  minPriceFils!: number | null;

  @Column({ type: 'uuid', nullable: true })
  imageMediaId!: string | null;

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'tsvector', select: false, nullable: true })
  searchable!: string | null;

  @Column({ type: 'timestamptz' })
  updatedFromEventAt!: Date;
}
