import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Transactional outbox. A service writes its event in the same transaction as the
 * state change; `OutboxRelay` publishes it to RabbitMQ afterwards. Lives in each
 * service's own schema (the data source `schema` option).
 */
@Entity({ name: 'outbox' })
@Index('outbox_unpublished_idx', ['createdAt'], { where: 'published_at IS NULL' })
export class OutboxMessage {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb' })
  envelope!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;
}

/** Event ids a consumer has already handled; makes at-least-once delivery safe. */
@Entity({ name: 'processed_event' })
export class ProcessedEvent {
  @PrimaryColumn('uuid')
  eventId!: string;

  @PrimaryColumn({ type: 'text' })
  consumer!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt!: Date;
}
