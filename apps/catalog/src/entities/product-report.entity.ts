import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { ReportReason, ReportStatus } from '@am/contracts';
import { AppBaseEntity } from '@am/database';
import { Product } from './product.entity';

/**
 * Someone's report on a public product (F1-15), waiting in the admin reports queue until an admin
 * closes it. One open report per visitor and product (the partial unique index).
 */
@Entity({ name: 'product_report' })
@Index('product_report_queue_idx', ['status', 'createdAt'])
@Index('product_report_product_idx', ['productId', 'status'])
@Index('product_report_shop_idx', ['shopId', 'status'])
@Index('product_report_open_visitor_uq', ['productId', 'sessionId'], {
  unique: true,
  where: `status = 'open'`,
})
@Index('product_report_reporter_idx', ['reporterId'], { where: 'reporter_id IS NOT NULL' })
@Check(
  'product_report_reason_chk',
  `reason IN ('fraud', 'counterfeit', 'prohibited', 'misleading', 'offensive', 'unavailable', 'other')`,
)
@Check('product_report_status_chk', `status IN ('open', 'resolved', 'dismissed')`)
export class ProductReport extends AppBaseEntity {
  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'product_report_product_fk' })
  product?: Product;

  /** The product's shop when it was reported, for the queue's shop filter. */
  @Column({ type: 'uuid' })
  shopId!: string;

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
