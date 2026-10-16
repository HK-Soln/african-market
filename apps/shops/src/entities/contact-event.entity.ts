import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ContactTapChannel } from '@am/contracts';

/**
 * One WhatsApp, call or email tap (F1-07). The table is partitioned by month on `created_at`
 * (migration ContactEvents); ContactService keeps the coming months' partitions in place.
 * Indexes live in the migration, because a partitioned table's key must include `created_at`.
 */
@Entity({ name: 'contact_event' })
export class ContactEvent {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'uuid', nullable: true })
  branchId!: string | null;

  /** A catalogue product id as the app sent it; not checked against the catalogue. */
  @Column({ type: 'uuid', nullable: true })
  productId!: string | null;

  @Column({ type: 'text' })
  channel!: ContactTapChannel;

  /** The signed-in person; cleared when their account is deleted. */
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  /** The app's random visitor id. */
  @Column({ type: 'text' })
  sessionId!: string;

  @Column({ type: 'text', nullable: true })
  sourcePage!: string | null;
}
