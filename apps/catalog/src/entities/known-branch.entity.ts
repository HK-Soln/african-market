import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The shops' branches, from `branch.updated`: a product is listed only at a branch of its own
 * shop. Never read from the shops schema.
 */
@Entity({ name: 'known_branch' })
@Index('known_branch_shop_idx', ['shopId'])
export class KnownBranch {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'boolean', default: false })
  deleted!: boolean;

  /** When the latest applied event happened, so a late older one changes nothing. */
  @Column({ type: 'timestamptz' })
  changedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
