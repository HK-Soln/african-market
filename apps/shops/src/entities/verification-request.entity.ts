import { Check, Column, Entity, Index } from 'typeorm';
import type { KycSummary, VerificationStatus, VerificationType } from '@am/contracts';
import { AppBaseEntity } from '@am/database';

/**
 * One verification: the owner's identity (KYC, at the provider) or the shop's trade licence (a
 * document in the media service's private bucket). Identity images never come here: only the
 * provider's session id, its status and a summary (decision T-28).
 */
@Entity({ name: 'verification_request' })
@Index('verification_request_shop_idx', ['shopId', 'createdAt'])
@Index('verification_request_session_uq', ['providerSessionId'], {
  unique: true,
  where: 'provider_session_id IS NOT NULL',
})
@Index('verification_request_erase_idx', ['eraseAfter'], {
  where: 'erase_after IS NOT NULL AND erased_at IS NULL',
})
@Check('verification_request_type_chk', `type IN ('kyc', 'trade_license')`)
@Check(
  'verification_request_status_chk',
  `status IN ('started', 'pending', 'approved', 'rejected', 'expired')`,
)
export class VerificationRequest extends AppBaseEntity {
  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'text' })
  type!: VerificationType;

  /** The person who submitted it (the shop's owner). */
  @Column({ type: 'uuid' })
  submittedBy!: string;

  /** started: sent to the hosted page. pending: waiting on the provider or an admin. */
  @Column({ type: 'text' })
  status!: VerificationStatus;

  @Column({ type: 'text', nullable: true })
  provider!: string | null;

  @Column({ type: 'text', nullable: true })
  providerSessionId!: string | null;

  /** What the provider found, without images (KYC only). */
  @Column({ type: 'jsonb', nullable: true })
  kyc!: KycSummary | null;

  /** The trade licence document (media id, private bucket). */
  @Column({ type: 'uuid', nullable: true })
  documentMediaId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  /** Why it was rejected; shown to the seller. */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  /** Set when the submitter's account is deleted: the provider session is deleted then (T-23). */
  @Column({ type: 'timestamptz', nullable: true })
  eraseAfter!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  erasedAt!: Date | null;
}
