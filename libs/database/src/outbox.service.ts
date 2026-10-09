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

/**
 * Polls the outbox and publishes unpublished rows. Safe with several replicas:
 * rows are claimed with FOR UPDATE SKIP LOCKED.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    const interval = Number(process.env.OUTBOX_POLL_MS ?? 500);
    this.timer = setInterval(() => void this.tick(), interval);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

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
        for (const row of rows) {
          await this.bus.publish(row.envelope as unknown as EventEnvelope);
          await manager.update(
            OutboxMessage,
            { id: row.id },
            { publishedAt: new Date(), attempts: row.attempts + 1 },
          );
        }
        return rows.length;
      });
    } catch (err) {
      this.logger.warn(`Outbox relay tick failed: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
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
