import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import type { LocalizedString, ShopKycStatus, ShopVerificationStatus } from '@am/contracts';
import { AppBaseEntity } from '@am/database';
import { Branch } from './branch.entity';

/**
 * A seller's business: the brand, the contacts and what it may sell. Customers find its
 * branches. Only `verified` shops are public (F1-03).
 */
@Entity({ name: 'shop' })
@Index('shop_slug_uq', ['slug'], { unique: true, where: 'deleted_at IS NULL' })
@Index('shop_owner_idx', ['ownerId'])
@Index('shop_review_queue_idx', ['verificationStatus', 'submittedAt'])
@Check(
  'shop_verification_status_chk',
  `verification_status IN ('draft', 'pending', 'verified', 'rejected', 'suspended')`,
)
@Check('shop_kyc_status_chk', `kyc_status IN ('none', 'pending', 'passed', 'failed')`)
@Check('shop_slug_chk', `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)
export class Shop extends AppBaseEntity {
  @Column({ type: 'text' })
  name!: string;

  /** URL name, unique among live shops; made from the name when the shop is created. */
  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  description!: LocalizedString;

  /** Media ids (owned by the media service, attached by the gateway); never joined across schemas. */
  @Column({ type: 'uuid', nullable: true })
  logoMediaId!: string | null;

  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  galleryMediaIds!: string[];

  /** Catalogue category ids (catalog service). */
  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  categoryIds!: string[];

  /** ISO 3166-1 alpha-2. */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  originCountries!: string[];

  /** E.164. */
  @Column({ type: 'text', nullable: true })
  contactWhatsapp!: string | null;

  @Column({ type: 'text', nullable: true })
  contactPhone!: string | null;

  @Column({ type: 'citext', nullable: true })
  contactEmail!: string | null;

  // Verification (F1-03) and checkout (Phase 3). Not editable through `update`.
  @Column({ type: 'text', nullable: true })
  legalName!: string | null;

  @Column({ type: 'text', nullable: true })
  tradeLicenseNo!: string | null;

  @Column({ type: 'text', nullable: true })
  licenseIssuingAuthority!: string | null;

  @Column({ type: 'date', nullable: true })
  licenseExpiry!: string | null;

  @Column({ type: 'uuid', nullable: true })
  licenseMediaId!: string | null;

  @Column({ type: 'text', default: 'none' })
  kycStatus!: ShopKycStatus;

  @Column({ type: 'text', default: 'draft' })
  verificationStatus!: ShopVerificationStatus;

  /** When the owner last asked for the shop to be listed: the review queue's order. */
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** Why the listing was rejected or suspended; shown to the seller. */
  @Column({ type: 'text', nullable: true })
  verificationReason!: string | null;

  @Column({ type: 'boolean', default: false })
  checkoutEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  codEnabled!: boolean;

  @Column({ type: 'text', nullable: true })
  stripeAccountId!: string | null;

  /** Staff may upload product images too (decision T-29). */
  @Column({ type: 'boolean', default: false })
  staffCanUploadProductImages!: boolean;

  /** Who created it. Always its owner, whatever the access token says. */
  @Column({ type: 'uuid' })
  ownerId!: string;

  @OneToMany(() => Branch, (branch) => branch.shop)
  branches?: Branch[];
}
