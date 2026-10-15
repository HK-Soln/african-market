import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, connect as connectTcp, type Server, type Socket } from 'node:net';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EventEnvelope } from '@am/contracts';
import { baseEnvSchema, EventBus, HealthService } from '@am/core';
import { createServiceSchema } from './migration-helpers';
import { OutboxMessage, ProcessedEvent } from './outbox.entity';
import { IdempotentConsumer, OutboxRelay, OutboxService } from './outbox.service';
import { createTestDatabase, type TestDatabase } from './testing';

// Integration tests against a real Postgres (Testcontainers, see ./testing) and RabbitMQ (docker
// compose locally, a service container in CI). They use a throwaway database and their own
// exchange and queues.

jest.setTimeout(90_000);

const brokerUrl = process.env.RABBITMQ_URL ?? 'amqp://am:am@localhost:5672';
const run = randomUUID().replace(/-/g, '').slice(0, 10);
const exchange = `am.events.test.${run}`;
const SCHEMA = 'outbox_test';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await condition()) return;
    await sleep(50);
  }
  throw new Error('Timed out waiting for a condition');
}

/**
 * Stands between a bus and RabbitMQ so a test can take the broker away and bring it back:
 * `stop()` cuts every connection and refuses new ones, exactly what a broker restart looks like
 * from a service.
 */
class BrokerProxy {
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  private port = 0;

  constructor(private readonly upstream: URL) {}

  get url(): string {
    const proxied = new URL(this.upstream.toString());
    proxied.hostname = '127.0.0.1';
    proxied.port = String(this.port);
    return proxied.toString();
  }

  async start(): Promise<void> {
    this.server = createServer((client) => {
      const broker = connectTcp(Number(this.upstream.port || 5672), this.upstream.hostname);
      for (const socket of [client, broker]) {
        this.sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => {
          this.sockets.delete(socket);
          client.destroy();
          broker.destroy();
        });
      }
      client.pipe(broker);
      broker.pipe(client);
    });
    await new Promise<void>((resolve) => this.server?.listen(this.port, '127.0.0.1', resolve));
    this.port = (this.server.address() as { port: number }).port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    this.server = undefined;
  }
}

describe('transactional outbox (Postgres + RabbitMQ)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  const outbox = new OutboxService('outbox-test');
  const buses: EventBus[] = [];
  let serviceSeq = 0;

  /** A started bus. Every one gets its own service name, so its own queue. */
  const startBus = async (url = brokerUrl) => {
    const service = `test-${run}-${++serviceSeq}`;
    const env = baseEnvSchema.parse({
      RABBITMQ_URL: url,
      EVENTS_EXCHANGE: exchange,
      EVENT_RETRY_DELAYS_MS: '50',
    });
    const bus = new EventBus(service, env, new HealthService(service));
    buses.push(bus);
    return bus;
  };

  /** A second service that listens for `user.registered` and records what arrives. */
  const startListener = async () => {
    const received: EventEnvelope[] = [];
    const bus = await startBus();
    bus.subscribe('user.registered', async (event) => void received.push(event));
    await bus.onApplicationBootstrap();
    await bus.waitForConnect();
    return received;
  };

  const enqueue = (userId: string) =>
    db.transaction((manager) =>
      outbox.enqueue(manager, 'user.registered', { userId, preferredLanguage: 'en' }),
    );

  const rows = () => db.getRepository(OutboxMessage).find({ order: { createdAt: 'ASC' } });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    // The same DDL every service's first migration runs.
    testDb = await createTestDatabase({
      schema: SCHEMA,
      entities: [],
      setup: (runner) => createServiceSchema(runner, SCHEMA),
    });
    db = testDb.db;
  });

  beforeEach(async () => {
    await db.getRepository(OutboxMessage).clear();
    await db.getRepository(ProcessedEvent).clear();
  });

  afterAll(async () => {
    for (const bus of buses) await bus.onModuleDestroy();
    await testDb?.drop();
  });

  describe('publishing', () => {
    it('never publishes an event whose transaction rolled back', async () => {
      const received = await startListener();
      const bus = await startBus();
      await bus.onApplicationBootstrap();
      await bus.waitForConnect();
      const relay = new OutboxRelay(db, bus);

      const lost = randomUUID();
      await expect(
        db.transaction(async (manager) => {
          await outbox.enqueue(manager, 'user.registered', {
            userId: lost,
            preferredLanguage: 'en',
          });
          throw new Error('the user row violated a constraint');
        }),
      ).rejects.toThrow('violated a constraint');
      expect(await rows()).toHaveLength(0);
      expect(await relay.tick()).toBe(0);

      // An event that did commit goes out, and it is the only one anybody receives.
      const kept = randomUUID();
      const envelope = await enqueue(kept);
      expect(await relay.tick()).toBe(1);
      await waitUntil(() => received.length === 1);
      await sleep(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(envelope);
      const [row] = await rows();
      expect(row.publishedAt).toBeInstanceOf(Date);
      expect(row.attempts).toBe(1);
      // Already published: the next tick has nothing to do.
      expect(await relay.tick()).toBe(0);
    });

    it('publishes an event enqueued while RabbitMQ was down once it is back', async () => {
      const received = await startListener();
      const proxy = new BrokerProxy(new URL(brokerUrl));
      await proxy.start();
      const bus = await startBus(proxy.url);
      await bus.onApplicationBootstrap();
      await bus.waitForConnect();
      const relay = new OutboxRelay(db, bus);

      await proxy.stop();
      await waitUntil(() => !bus.isConnected());

      // The business transaction does not care that the broker is gone.
      const envelope = await enqueue(randomUUID());
      expect(await relay.tick()).toBe(0);
      expect(await relay.tick()).toBe(0);
      const [waiting] = await rows();
      expect(waiting.publishedAt).toBeNull();
      expect(waiting.attempts).toBe(2);
      expect(received).toHaveLength(0);

      await proxy.start();
      await waitUntil(() => bus.isConnected());
      await waitUntil(async () => (await relay.tick()) === 1);
      await waitUntil(() => received.length === 1);

      expect(received[0]).toEqual(envelope);
      expect((await rows())[0].publishedAt).toBeInstanceOf(Date);
      await proxy.stop();
    });

    it('keeps what went out when a publish fails part-way through a batch', async () => {
      const published: string[] = [];
      let failOn: string | null = null;
      // A stand-in bus is the only way to fail on exactly the second message.
      const bus = {
        publish: async (envelope: EventEnvelope) => {
          if (envelope.id === failOn) throw new Error('channel closed');
          published.push(envelope.id);
        },
      } as unknown as EventBus;
      const relay = new OutboxRelay(db, bus);

      const first = await enqueue(randomUUID());
      const second = await enqueue(randomUUID());
      const third = await enqueue(randomUUID());
      failOn = second.id;

      expect(await relay.tick()).toBe(1);
      const after = await rows();
      expect(after.map((row) => row.publishedAt !== null)).toEqual([true, false, false]);

      failOn = null;
      expect(await relay.tick()).toBe(2);
      // In order, and the first one was not sent a second time.
      expect(published).toEqual([first.id, second.id, third.id]);
    });
  });

  describe('consuming', () => {
    it('handles a duplicate delivery once', async () => {
      const once = new IdempotentConsumer(db);
      let handled = 0;
      // Counted when a delivery has been dealt with, not when it arrives: the first one may still
      // be inside its transaction when the second arrives.
      let deliveries = 0;
      const listener = await startBus();
      listener.subscribe('user.registered', async (event) => {
        try {
          await once.handle(event, 'test.welcome-message', async () => void handled++);
        } finally {
          deliveries++;
        }
      });
      await listener.onApplicationBootstrap();
      await listener.waitForConnect();

      const publisher = await startBus();
      await publisher.onApplicationBootstrap();
      await publisher.waitForConnect();
      const relay = new OutboxRelay(db, publisher);

      // The relay stopped after the broker took the event but before the row was marked: the
      // same event, with the same id, goes out again.
      const envelope = await enqueue(randomUUID());
      expect(await relay.tick()).toBe(1);
      await db.getRepository(OutboxMessage).update({ id: envelope.id }, { publishedAt: null });
      expect(await relay.tick()).toBe(1);

      await waitUntil(() => deliveries === 2);
      expect(handled).toBe(1);
      expect(await db.getRepository(ProcessedEvent).countBy({ eventId: envelope.id })).toBe(1);
    });

    it('lets each consumer of an event handle it once', async () => {
      const once = new IdempotentConsumer(db);
      const event = { id: randomUUID(), name: 'user.registered' } as EventEnvelope;
      const ran: string[] = [];

      for (const consumer of ['a.index', 'b.email', 'a.index']) {
        await once.handle(event, consumer, async () => void ran.push(consumer));
      }
      expect(ran).toEqual(['a.index', 'b.email']);
    });

    it('does not mark an event handled when its handler failed', async () => {
      const once = new IdempotentConsumer(db);
      const event = { id: randomUUID(), name: 'user.registered' } as EventEnvelope;

      await expect(
        once.handle(event, 'test.index', async () => {
          throw new Error('index unavailable');
        }),
      ).rejects.toThrow('index unavailable');
      expect(await db.getRepository(ProcessedEvent).countBy({ eventId: event.id })).toBe(0);

      // So the retry does the work.
      let ran = false;
      expect(await once.handle(event, 'test.index', async () => void (ran = true))).toBe(true);
      expect(ran).toBe(true);
    });

    it('writes the handler’s changes and the "handled" mark together', async () => {
      const once = new IdempotentConsumer(db);
      const event = { id: randomUUID(), name: 'user.registered' } as EventEnvelope;
      const marker = randomUUID();

      await expect(
        once.handle(event, 'test.index', async (manager) => {
          await manager.insert(ProcessedEvent, { eventId: marker, consumer: 'side-effect' });
          throw new Error('failed after writing');
        }),
      ).rejects.toThrow('failed after writing');
      expect(await db.getRepository(ProcessedEvent).countBy({ eventId: marker })).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('deletes rows published more than 7 days ago and nothing else', async () => {
      const relay = new OutboxRelay(db, {} as EventBus);
      const old = await enqueue(randomUUID());
      const recent = await enqueue(randomUUID());
      const stuck = await enqueue(randomUUID());
      const table = `"${SCHEMA}"."outbox"`;
      await db.query(`UPDATE ${table} SET published_at = now() - interval '8 days' WHERE id = $1`, [
        old.id,
      ]);
      await db.query(`UPDATE ${table} SET published_at = now() - interval '6 days' WHERE id = $1`, [
        recent.id,
      ]);
      // Never published, however old: it still has to go out.
      await db.query(`UPDATE ${table} SET created_at = now() - interval '30 days' WHERE id = $1`, [
        stuck.id,
      ]);

      expect(await relay.cleanup()).toBe(1);
      expect((await rows()).map((row) => row.id).sort()).toEqual([recent.id, stuck.id].sort());
      expect(await relay.cleanup()).toBe(0);
    });
  });
});
