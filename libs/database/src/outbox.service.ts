import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { EventEnvelope, EventName, EventPayloads } from '@am/contracts';
import { EventBus, SERVICE_NAME } from '@am/core';
import { OutboxMessage, ProcessedEvent } from './outbox.entity';

/** Adds events to the outbox inside the caller's transaction. */
@Injectable()
export class OutboxService {
  constructor(@Inject(SERVICE_NAME) private readonly service: string) {}

  async enqueue<N extends EventName>(
    manager: EntityManager,
    name: N,
    payload: EventPayloads[N],
    correlationId?: string,
  ): Promise<EventEnvelope<N>> {
    const envelope: EventEnvelope<N> = {
      id: randomUUID(),
      name,
      source: this.service,
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };
    const row = manager.create(OutboxMessage, { id: envelope.id, name });
    row.envelope = envelope as unknown as Record<string, unknown>;
    await manager.save(row);
    return envelope;
  }
}

/** Published rows are kept this long, for tracing what was sent, then deleted. */
export const OUTBOX_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Polls the outbox and publishes unpublished rows. Safe with several replicas:
 * rows are claimed with FOR UPDATE SKIP LOCKED.
 *
 * Delivery is at least once. A row is marked published only after the broker has confirmed it;
 * if the service stops between the two, the event is published again on the next tick.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    const interval = Number(process.env.OUTBOX_POLL_MS ?? 500);
    this.timer = setInterval(() => void this.tick(), interval);
    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    // Housekeeping must never be what keeps a stopping process alive.
    this.cleanupTimer.unref();
    void this.cleanup();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** Publishes the oldest unpublished rows and returns how many went out. */
  async tick(batchSize = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager
          .getRepository(OutboxMessage)
          .createQueryBuilder('o')
          .where({ publishedAt: IsNull() })
          .orderBy('o.created_at', 'ASC')
          .limit(batchSize)
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();
        let published = 0;
        for (const row of rows) {
          try {
            await this.bus.publish(row.envelope as unknown as EventEnvelope);
          } catch (err) {
            // Stop here and keep what did go out: throwing would roll those rows back to
            // "unpublished" and send them all a second time. Order is kept for the next tick.
            await manager.increment(OutboxMessage, { id: row.id }, 'attempts', 1);
            this.logger.warn(`Outbox publish failed, will retry: ${(err as Error).message}`);
            break;
          }
          await manager.update(
            OutboxMessage,
            { id: row.id },
            { publishedAt: new Date(), attempts: row.attempts + 1 },
          );
          published++;
        }
        return published;
      });
    } catch (err) {
      this.logger.warn(`Outbox relay tick failed: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Deletes rows published more than `olderThanDays` ago. Unpublished rows are never touched. */
  async cleanup(olderThanDays = OUTBOX_RETENTION_DAYS): Promise<number> {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .delete()
        .from(OutboxMessage)
        .where('published_at IS NOT NULL')
        .andWhere('published_at < now() - make_interval(days => :days)', { days: olderThanDays })
        .execute();
      const removed = result.affected ?? 0;
      if (removed > 0) this.logger.log(`Outbox cleanup removed ${removed} published rows`);
      return removed;
    } catch (err) {
      this.logger.warn(`Outbox cleanup failed: ${(err as Error).message}`);
      return 0;
    }
  }
}

/**
 * Runs a handler at most once per (event id, consumer). Usage inside an EventBus subscription:
 *   bus.subscribe('shop.verified', (e) => this.once.handle(e, 'discovery.shop-index', (m) => this.index(m, e)));
 */
@Injectable()
export class IdempotentConsumer {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async handle(
    event: EventEnvelope,
    consumer: string,
    fn: (manager: EntityManager) => Promise<void>,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(ProcessedEvent)
        .values({ eventId: event.id, consumer })
        .orIgnore()
        .returning(['event_id'])
        .execute();
      if (inserted.raw.length === 0) return false;
      await fn(manager);
      return true;
    });
  }
}
