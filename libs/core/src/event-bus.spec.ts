import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { connect, type Channel, type ChannelModel } from 'amqplib';
import type { EventEnvelope } from '@am/contracts';
import { baseEnvSchema } from './env';
import { ATTEMPT_HEADER, EventBus, LAST_ERROR_HEADER } from './event-bus';
import { HealthService } from './health';

// Integration tests against a real RabbitMQ: docker compose locally (`pnpm infra:up`), a service
// container in CI. Each run uses its own exchange and queue names, and removes them afterwards,
// so it cannot disturb services that are running against the same broker.

jest.setTimeout(60_000);

const brokerUrl = process.env.RABBITMQ_URL ?? 'amqp://am:am@localhost:5672';
const run = randomUUID().slice(0, 8);
const exchange = `am.events.test.${run}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await condition()) return;
    await sleep(25);
  }
  throw new Error('Timed out waiting for a condition');
}

const event = (overrides: Partial<EventEnvelope<'user.registered'>> = {}) =>
  ({
    id: randomUUID(),
    name: 'user.registered',
    source: 'test',
    occurredAt: new Date().toISOString(),
    payload: { userId: randomUUID(), preferredLanguage: 'en' },
    ...overrides,
  }) as EventEnvelope<'user.registered'>;

/** Required by the schema; the event bus never connects to them. */
const notUsedHere = {
  DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
  REDIS_URL: 'redis://localhost:6379',
};
describe('EventBus (RabbitMQ)', () => {
  let admin: ChannelModel;
  let adminChannel: Channel;
  const buses: EventBus[] = [];
  const services: string[] = [];
  const retryDelaysOf: Record<string, string[]> = {};
  let serviceSeq = 0;

  /** A started bus for a service of its own, with short waits between retries. */
  const startBus = async (
    retryDelays: string,
    subscribe: (bus: EventBus) => void = () => undefined,
  ) => {
    const service = `test-${run}-${++serviceSeq}`;
    const env = baseEnvSchema.parse({
      ...notUsedHere,
      RABBITMQ_URL: brokerUrl,
      EVENTS_EXCHANGE: exchange,
      EVENT_RETRY_DELAYS_MS: retryDelays,
    });
    const bus = new EventBus(service, env, new HealthService(service));
    subscribe(bus);
    await bus.onApplicationBootstrap();
    await bus.waitForConnect();
    buses.push(bus);
    services.push(service);
    retryDelaysOf[service] = retryDelays.split(',');
    return { bus, service, queue: `${service}.events` };
  };

  const deadLetters = async (queue: string) => {
    const found = [];
    for (;;) {
      const message = await adminChannel.get(`${queue}.dlq`, { noAck: true });
      if (!message) return found;
      found.push(message);
    }
  };

  beforeAll(async () => {
    // Failing handlers are the point of several tests; their logged stack traces are noise.
    Logger.overrideLogger(false);
    admin = await connect(brokerUrl);
    adminChannel = await admin.createChannel();
  });

  afterAll(async () => {
    for (const bus of buses) await bus.onModuleDestroy();
    for (const service of services) {
      const info = await adminChannel.checkQueue(`${service}.events`).catch(() => null);
      if (!info) continue;
      await adminChannel.deleteQueue(`${service}.events`);
      await adminChannel.deleteQueue(`${service}.events.dlq`);
      for (const delay of retryDelaysOf[service] ?? []) {
        await adminChannel.deleteQueue(`${service}.events.retry.${delay}`);
      }
    }
    await adminChannel.deleteExchange(exchange).catch(() => undefined);
    await admin.close();
  });

  it('delivers a published event to a service that subscribed to its name', async () => {
    const received: EventEnvelope[] = [];
    const { bus } = await startBus('50', (b) =>
      b.subscribe('user.registered', async (e) => void received.push(e)),
    );
    const sent = event({ correlationId: 'req-1' });

    await bus.publish(sent);
    await waitUntil(() => received.length === 1);
    expect(received[0]).toEqual(sent);
  });

  it('refuses to publish when it is not connected, so the outbox keeps the event', async () => {
    const env = baseEnvSchema.parse({
      ...notUsedHere,
      RABBITMQ_URL: brokerUrl,
      EVENTS_EXCHANGE: exchange,
    });
    const idle = new EventBus('never-started', env, new HealthService('never-started'));
    await expect(idle.publish(event())).rejects.toThrow('RabbitMQ not connected');
  });

  it('gives a failed event to the handler again after a wait, until it succeeds', async () => {
    const calls: number[] = [];
    const { bus, queue } = await startBus('150,150,150', (b) =>
      b.subscribe('user.registered', async () => {
        calls.push(Date.now());
        if (calls.length < 3) throw new Error('database is restarting');
      }),
    );

    await bus.publish(event());
    await waitUntil(() => calls.length === 3);
    await sleep(400);

    expect(calls).toHaveLength(3);
    // Each retry waited in the retry queue rather than coming straight back.
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(140);
    expect(calls[2] - calls[1]).toBeGreaterThanOrEqual(140);
    expect(await deadLetters(queue)).toHaveLength(0);
  });

  it('dead-letters an event after the last retry, with the reason and the count', async () => {
    const calls: number[] = [];
    const { bus, queue } = await startBus('60,240', (b) =>
      b.subscribe('user.registered', async () => {
        calls.push(Date.now());
        throw new Error('shop index is corrupt');
      }),
    );
    const sent = event();

    await bus.publish(sent);
    let dead: Awaited<ReturnType<typeof deadLetters>> = [];
    await waitUntil(async () => (dead = await deadLetters(queue)).length === 1);
    await sleep(400);

    // The first delivery plus one try per configured wait, and no more after that.
    expect(calls).toHaveLength(3);
    // The waits get longer: this is the backoff.
    expect(calls[2] - calls[1]).toBeGreaterThan(calls[1] - calls[0]);
    expect(JSON.parse(dead[0].content.toString())).toEqual(sent);
    expect(dead[0].properties.headers?.[ATTEMPT_HEADER]).toBe(3);
    expect(dead[0].properties.headers?.[LAST_ERROR_HEADER]).toBe('shop index is corrupt');
    expect(dead[0].properties.messageId).toBe(sent.id);
  });

  it('retries only in the service that failed', async () => {
    let failing = 0;
    let healthy = 0;
    const broken = await startBus('50', (b) =>
      b.subscribe('user.registered', async () => {
        failing++;
        throw new Error('down');
      }),
    );
    await startBus('50', (b) => b.subscribe('user.registered', async () => void healthy++));

    await broken.bus.publish(event());
    await waitUntil(() => failing === 2);
    await sleep(300);

    expect(healthy).toBe(1);
  });

  it('dead-letters a message it cannot read without calling a handler', async () => {
    let called = 0;
    const { queue } = await startBus('50', (b) =>
      b.subscribe('user.registered', async () => void called++),
    );

    adminChannel.publish(exchange, 'user.registered', Buffer.from('not json'));
    let dead: Awaited<ReturnType<typeof deadLetters>> = [];
    await waitUntil(async () => (dead = await deadLetters(queue)).length === 1);

    expect(dead[0].content.toString()).toBe('not json');
    expect(called).toBe(0);
  });

  it('keeps one service’s dead letters out of every other service’s queue', async () => {
    const one = await startBus('50', (b) => b.subscribe('shop.created', async () => undefined));
    const other = await startBus('50', (b) => b.subscribe('shop.updated', async () => undefined));

    adminChannel.publish(exchange, 'shop.created', Buffer.from('not json'));
    await waitUntil(async () => (await deadLetters(one.queue)).length === 1);
    await sleep(200);

    expect(await deadLetters(other.queue)).toHaveLength(0);
  });
});
