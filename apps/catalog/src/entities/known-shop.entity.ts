import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * What the catalogue knows about a shop, from the shops service's events: its owner
 * (`shop.created`) and whether it is verified (`shop.verified`). Never read from their schema.
 */
@Entity({ name: 'known_shop' })
export class KnownShop {
  /** The shop's id in the shops service. */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  /** Null until `shop.created` arrives (the row can come first, from a member's token). */
  @Column({ type: 'uuid', nullable: true })
  ownerId!: string | null;

  /** Only verified shops' products are public. */
  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  /** When the latest applied verification decision happened, so older events change nothing. */
  @Column({ type: 'timestamptz', nullable: true })
  verificationChangedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
