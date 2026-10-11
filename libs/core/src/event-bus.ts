import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EventEnvelope, EventName } from '@am/contracts';
import { APP_ENV, BaseEnv, SERVICE_NAME } from './env';
import { HealthService } from './health';

export type EventHandler<N extends EventName> = (event: EventEnvelope<N>) => Promise<void>;

/** How many times a message has already been retried. Absent on a first delivery. */
export const ATTEMPT_HEADER = 'x-attempt';
/** Why the last try failed; kept on the message so the dead-letter queue explains itself. */
export const LAST_ERROR_HEADER = 'x-last-error';

/** A publish that the broker has not confirmed in this time fails, and the outbox tries again. */
const PUBLISH_TIMEOUT_MS = 5000;

/**
 * RabbitMQ topic-exchange event bus.
 *
 * - Publishing is done by the outbox relay (libs/database), not by request handlers.
 * - Each service owns one durable queue `<service>.events`, bound to the event names it
 *   subscribes to. Call `subscribe()` from `onModuleInit`; bindings are created on bootstrap.
 * - A handler that throws gets the event again after a wait: `<service>.events.retry.<ms>` holds
 *   it for that long and hands it back. After the last wait in `EVENT_RETRY_DELAYS_MS` it goes to
 *   `<service>.events.dlq` with the error, and stays there for a person to look at.
 * - Events can arrive more than once. Handlers must be idempotent: wrap them with
 *   `IdempotentConsumer` from @am/database.
 */
@Injectable()
export class EventBus implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, EventHandler<EventName>[]>();
  private readonly exchange: string;
  private readonly queue: string;
  private readonly retryDelaysMs: number[];
  private connection?: amqp.AmqpConnectionManager;
  private channel?: amqp.ChannelWrapper;

  constructor(
    @Inject(SERVICE_NAME) private readonly service: string,
    @Inject(APP_ENV) private readonly env: BaseEnv,
    private readonly health: HealthService,
  ) {
    this.exchange = env.EVENTS_EXCHANGE;
    this.queue = `${service}.events`;
    this.retryDelaysMs = env.EVENT_RETRY_DELAYS_MS.split(',').map(Number);
  }

  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as unknown as EventHandler<EventName>);
    this.handlers.set(name, list);
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    // Fail fast instead of buffering in memory: the outbox keeps the row and retries next tick.
    if (!this.channel || !this.connection?.isConnected()) throw new Error('RabbitMQ not connected');
    await this.channel.publish(
      this.exchange,
      envelope.name,
      Buffer.from(JSON.stringify(envelope)),
      {
        persistent: true,
        messageId: envelope.id,
        contentType: 'application/json',
        headers: { source: envelope.source, correlationId: envelope.correlationId },
        // Without this a publish made as the connection drops would wait for it to come back,
        // holding the outbox transaction open the whole time.
        timeout: PUBLISH_TIMEOUT_MS,
      },
    );
  }

  /** True once the connection is up and the queues exist. */
  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  async onApplicationBootstrap(): Promise<void> {
    const queue = this.queue;
    this.connection = amqp.connect([this.env.RABBITMQ_URL]);
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message}`),
    );
    this.health.register('rabbitmq', async () => this.isConnected());

    this.channel = this.connection.createChannel({
      json: false,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(this.exchange, 'topic', { durable: true });
        if (this.handlers.size === 0) return;
        await ch.assertQueue(`${queue}.dlq`, { durable: true });
        // A message rejected outright (an unreadable one) goes straight to this service's own
        // dead-letter queue, through the default exchange, and to nobody else's.
        await ch.assertQueue(queue, {
          durable: true,
          deadLetterExchange: '',
          deadLetterRoutingKey: `${queue}.dlq`,
        });
        for (const delay of new Set(this.retryDelaysMs)) {
          // Nothing consumes a retry queue. A message sits for its time, "dies", and the broker
          // delivers it to the default exchange with the service's queue as its address.
          await ch.assertQueue(this.retryQueue(delay), {
            durable: true,
            messageTtl: delay,
            deadLetterExchange: '',
            deadLetterRoutingKey: queue,
          });
        }
        for (const name of this.handlers.keys()) await ch.bindQueue(queue, this.exchange, name);
        await ch.prefetch(20);
        await ch.consume(queue, (msg) => void this.dispatch(ch, msg));
      },
    });
    // Do not block startup on the broker; amqp-connection-manager reconnects in the background.
    void this.channel.waitForConnect().then(() => this.logger.log(`RabbitMQ connected (${queue})`));
  }

  /** Resolves once the first connection is made. For tests and scripts; services never wait. */
  async waitForConnect(): Promise<void> {
    await this.channel?.waitForConnect();
  }

  private retryQueue(delayMs: number): string {
    return `${this.queue}.retry.${delayMs}`;
  }

  private async dispatch(ch: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
      if (typeof envelope?.id !== 'string' || typeof envelope?.name !== 'string') {
        throw new Error('not an event envelope');
      }
    } catch (err) {
      // Trying again cannot fix a message that cannot be read.
      this.logger.error(`Unreadable event on ${this.queue}, dead-lettering: ${String(err)}`);
      ch.nack(msg, false, false);
      return;
    }

    try {
      for (const handler of this.handlers.get(envelope.name) ?? []) await handler(envelope);
      ch.ack(msg);
    } catch (err) {
      await this.retryOrBury(ch, msg, envelope, err as Error);
    }
  }

  /**
   * Sends a failed event to wait for its next try, or to the dead-letter queue when it has had
   * them all. The copy is confirmed by the broker before the original is acknowledged, so a
   * crash in between delivers the event twice rather than losing it.
   */
  private async retryOrBury(
    ch: ConfirmChannel,
    msg: ConsumeMessage,
    envelope: EventEnvelope,
    error: Error,
  ): Promise<void> {
    const attempt = Number(msg.properties.headers?.[ATTEMPT_HEADER] ?? 0);
    const delay = this.retryDelaysMs[attempt];
    const target = delay === undefined ? `${this.queue}.dlq` : this.retryQueue(delay);
    const label = `${envelope.name} ${envelope.id}`;

    if (delay === undefined) {
      this.logger.error(
        `Event ${label} failed ${attempt + 1} times, dead-lettering: ${error.stack}`,
      );
    } else {
      this.logger.warn(`Event ${label} failed, retrying in ${delay} ms: ${error.message}`);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        ch.publish(
          '',
          target,
          msg.content,
          {
            persistent: true,
            messageId: msg.properties.messageId,
            contentType: msg.properties.contentType,
            headers: {
              ...msg.properties.headers,
              [ATTEMPT_HEADER]: attempt + 1,
              [LAST_ERROR_HEADER]: String(error.message).slice(0, 500),
            },
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });
      ch.ack(msg);
    } catch (err) {
      // The channel is going away. Unacknowledged, the broker delivers the event again.
      this.logger.warn(`Could not requeue ${label}; the broker will redeliver it: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
