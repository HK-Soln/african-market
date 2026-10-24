import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { ReportReason, ReportStatus } from '@am/contracts';
import { AppBaseEntity } from '@am/database';
import { Shop } from './shop.entity';

/**
 * Someone's report on a public shop (F1-15), waiting in the admin reports queue until an admin
 * closes it. One open report per visitor and shop (the partial unique index).
 */
@Entity({ name: 'shop_report' })
@Index('shop_report_queue_idx', ['status', 'createdAt'])
@Index('shop_report_shop_idx', ['shopId', 'status'])
@Index('shop_report_open_visitor_uq', ['shopId', 'sessionId'], {
  unique: true,
  where: `status = 'open'`,
})
@Index('shop_report_reporter_idx', ['reporterId'], { where: 'reporter_id IS NOT NULL' })
@Check(
  'shop_report_reason_chk',
  `reason IN ('fraud', 'counterfeit', 'prohibited', 'misleading', 'offensive', 'unavailable', 'other')`,
)
@Check('shop_report_status_chk', `status IN ('open', 'resolved', 'dismissed')`)
export class ShopReport extends AppBaseEntity {
  @Column({ type: 'uuid' })
  shopId!: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'shop_id', foreignKeyConstraintName: 'shop_report_shop_fk' })
  shop?: Shop;

  @Column({ type: 'text' })
  reason!: ReportReason;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  /** The signed-in person who sent it; cleared when their account is deleted. Never shown. */
  @Column({ type: 'uuid', nullable: true })
  reporterId!: string | null;

  /** The app's random visitor id. */
  @Column({ type: 'text' })
  sessionId!: string;

  @Column({ type: 'text', default: 'open' })
  status!: ReportStatus;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  decidedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;
}
