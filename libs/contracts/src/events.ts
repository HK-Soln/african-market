/**
 * Domain events published through the transactional outbox onto RabbitMQ.
 *
 * Rules (see docs/architecture/events.md):
 * - Event names are `<aggregate>.<past_tense_verb>` and never change once shipped;
 *   breaking payload changes get a new name (`shop.verified.v2`).
 * - Payloads carry ids and the fields consumers need to build read models;
 *   they never carry secrets or full personal data.
 * - Consumers are idempotent: they record `envelope.id` before acting.
 */
export interface EventEnvelope<TName extends EventName = EventName> {
  /** UUID, unique per event; used for idempotency. */
  id: string;
  name: TName;
  /** Service that produced it. */
  source: string;
  /** ISO-8601 UTC. */
  occurredAt: string;
  /** Request/trace id that caused the change, for log correlation. */
  correlationId?: string;
  payload: EventPayloads[TName];
}

export interface EventPayloads {
  'user.registered': { userId: string; phone?: string; email?: string; preferredLanguage: string };
  'membership.changed': {
    userId: string;
    shopId: string;
    role: 'owner' | 'manager' | 'staff' | null;
    branchIds: string[];
  };
  'shop.created': { shopId: string; ownerId: string; name: string; slug: string };
  'shop.updated': { shopId: string };
  'shop.verified': {
    shopId: string;
    verificationStatus: 'verified' | 'rejected' | 'suspended';
    checkoutEnabled: boolean;
    codEnabled: boolean;
  };
  'branch.updated': { branchId: string; shopId: string; deleted: boolean };
  'product.upserted': { productId: string; shopId: string };
  'product.removed': { productId: string; shopId: string };
  'media.ready': { mediaId: string; ownerId: string; urls: Record<string, string> };
  'message.sent': {
    messageId: string;
    conversationId: string;
    senderId: string;
    recipientIds: string[];
  };
  'order.placed': {
    orderId: string;
    shopId: string;
    customerId: string;
    totalFils: number;
    paymentMethod: 'card' | 'cod';
  };
  'order.status_changed': { orderId: string; from: string; to: string };
  'payment.succeeded': {
    paymentId: string;
    orderId: string;
    amountFils: number;
    applicationFeeFils: number;
  };
  'payout.sent': { payoutId: string; shopId: string; amountFils: number };
}

export type EventName = keyof EventPayloads;

/** RabbitMQ topic exchange every event is published to; routing key = event name. */
export const EVENTS_EXCHANGE = 'am.events';
