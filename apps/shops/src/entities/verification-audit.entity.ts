import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every step of a shop's verification, who took it and when: started KYC, the provider's result,
 * submission, each admin decision and each look at an identity image. Rows are only ever added.
 */
@Entity({ name: 'verification_audit' })
@Index('verification_audit_shop_idx', ['shopId', 'createdAt'])
export class VerificationAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'uuid', nullable: true })
  requestId!: string | null;

  /** Null when the provider acted (a webhook). */
  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  /** kyc_started, kyc_result, submitted, listing_approved, listing_rejected, listing_suspended,
   * listing_reinstated, license_submitted, license_approved, license_rejected, document_viewed. */
  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  details!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
