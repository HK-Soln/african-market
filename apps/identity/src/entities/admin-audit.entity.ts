import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One admin action, as recorded by the service where it happened (decision T-42). Rows are only
 * ever added; nothing updates or deletes them. Arriving by event, a row takes the event's id, so
 * an event delivered twice is one row.
 */
@Entity({ name: 'admin_audit' })
@Index('admin_audit_time_idx', ['occurredAt', 'id'])
@Index('admin_audit_actor_idx', ['actorId', 'occurredAt'])
@Index('admin_audit_shop_idx', ['shopId', 'occurredAt'])
@Index('admin_audit_subject_idx', ['subjectType', 'subjectId', 'occurredAt'])
export class AdminAudit {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'PK_admin_audit' })
  id!: string;

  /** The service that recorded it. */
  @Column({ type: 'text' })
  source!: string;

  /** Null when no person acted (a command run on the server). */
  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text' })
  action!: string;

  @Column({ type: 'text' })
  subjectType!: string;

  @Column({ type: 'text' })
  subjectId!: string;

  @Column({ type: 'uuid', nullable: true })
  shopId!: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  details!: Record<string, string | number | boolean | null>;

  @Column({ type: 'text', nullable: true })
  correlationId!: string | null;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;
}
