import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EVENTS_EXCHANGE, EventEnvelope, EventName } from '@am/contracts';
import { APP_ENV, BaseEnv, SERVICE_NAME } from './env';
import { HealthService } from './health';

export type EventHandler<N extends EventName> = (event: EventEnvelope<N>) => Promise<void>;

const DEAD_LETTER_EXCHANGE = `${EVENTS_EXCHANGE}.dlx`;

/**
 * RabbitMQ topic-exchange event bus.
 *
 * - Publishing is done by the outbox relay (libs/database), not by request handlers.
 * - Each service owns one durable queue `<service>.events`, bound to the event names it
 *   subscribes to. Call `subscribe()` from `onModuleInit`; bindings are created on bootstrap.
 * - A handler that throws sends the message to `<service>.events.dlq` (no infinite redelivery).
 *   Handlers must be idempotent: wrap them with `IdempotentConsumer` from @am/database.
 */
@Injectable()
export class EventBus implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, EventHandler<EventName>[]>();
  private connection?: amqp.AmqpConnectionManager;
  private channel?: amqp.ChannelWrapper;

  constructor(
    @Inject(SERVICE_NAME) private readonly service: string,
    @Inject(APP_ENV) private readonly env: BaseEnv,
    private readonly health: HealthService,
  ) {}

  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as unknown as EventHandler<EventName>);
    this.handlers.set(name, list);
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    // Fail fast instead of buffering in memory: the outbox keeps the row and retries next tick.
    if (!this.channel || !this.connection?.isConnected()) throw new Error('RabbitMQ not connected');
    await this.channel.publish(
      EVENTS_EXCHANGE,
      envelope.name,
      Buffer.from(JSON.stringify(envelope)),
      {
        persistent: true,
        messageId: envelope.id,
        contentType: 'application/json',
        headers: { source: envelope.source, correlationId: envelope.correlationId },
      },
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const queue = `${this.service}.events`;
    this.connection = amqp.connect([this.env.RABBITMQ_URL]);
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message}`),
    );
    this.health.register('rabbitmq', async () => this.connection?.isConnected() ?? false);

    this.channel = this.connection.createChannel({
      json: false,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
        await ch.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', { durable: true });
        if (this.handlers.size === 0) return;
        await ch.assertQueue(`${queue}.dlq`, { durable: true });
        await ch.bindQueue(`${queue}.dlq`, DEAD_LETTER_EXCHANGE, '#');
        await ch.assertQueue(queue, { durable: true, deadLetterExchange: DEAD_LETTER_EXCHANGE });
        for (const name of this.handlers.keys()) await ch.bindQueue(queue, EVENTS_EXCHANGE, name);
        await ch.prefetch(20);
        await ch.consume(queue, (msg) => void this.dispatch(ch, msg));
      },
    });
    // Do not block startup on the broker; amqp-connection-manager reconnects in the background.
    void this.channel.waitForConnect().then(() => this.logger.log(`RabbitMQ connected (${queue})`));
  }

  private async dispatch(ch: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    try {
      const envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
      for (const handler of this.handlers.get(envelope.name) ?? []) await handler(envelope);
      ch.ack(msg);
    } catch (err) {
      this.logger.error(
        `Event ${msg.fields.routingKey} failed, dead-lettering: ${(err as Error).stack}`,
      );
      ch.nack(msg, false, false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
