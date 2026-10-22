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
import type { AuditRecord } from './dto/audit';
import type { TraceCarrier } from './telemetry';

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
  /**
   * Trace context of the change that caused the event, so the consumers' work joins the same
   * trace. Set by OutboxService when tracing is on.
   */
  traceContext?: TraceCarrier;
  payload: EventPayloads[TName];
}

export interface EventPayloads {
  'user.registered': { userId: string; phone?: string; email?: string; preferredLanguage: string };
  'user.deleted': { userId: string; deletedAt: string; eraseBy: string };
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
  'media.ready': {
    mediaId: string;
    ownerId: string;
    purpose: string;
    urls: Record<string, string>;
  };
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
  'audit.recorded': AuditRecord;
}

export type EventName = keyof EventPayloads;

/** What the catalogue records about one event. Every payload field must be described. */
export interface EventDoc<N extends EventName> {
  /** When it is published, in one sentence. */
  description: string;
  /** The service that owns the aggregate and publishes the event (or the services, listed). */
  publisher: string;
  payload: { [K in keyof EventPayloads[N]]-?: string };
}

/**
 * The documentation of every event, next to its type. The compiler refuses a new event, or a new
 * payload field, without an entry here; `events.spec.ts` checks the entries and keeps
 * docs/architecture/events.md in step.
 */
export const EVENT_CATALOG: { [N in EventName]: EventDoc<N> } = {
  'user.registered': {
    description: 'A new account became real: a phone or an email address was verified.',
    publisher: 'identity',
    payload: {
      userId: 'The new user.',
      phone: 'E.164 phone, when the account was created by phone.',
      email: 'Email address, when the account was created by email.',
      preferredLanguage: 'en, ar or fr; the language to greet them in.',
    },
  },
  'user.deleted': {
    description:
      'A person deleted their account: it is closed now, and every service must erase their personal data by eraseBy.',
    publisher: 'identity',
    payload: {
      userId: 'The user whose account was deleted.',
      deletedAt: 'ISO-8601 UTC: when it was closed; hide their content from then on.',
      eraseBy: 'ISO-8601 UTC: by when copies of their personal data must be erased.',
    },
  },
  'membership.changed': {
    description: 'A user was given, changed in, or removed from a role in a shop.',
    publisher: 'identity',
    payload: {
      userId: 'The user whose membership changed.',
      shopId: 'The shop.',
      role: 'owner, manager or staff; null when the membership was removed.',
      branchIds: 'Branches a staff member is limited to; empty means every branch.',
    },
  },
  'shop.created': {
    description: 'A seller created a shop (not yet verified or visible in search).',
    publisher: 'shops',
    payload: {
      shopId: 'The new shop.',
      ownerId: 'The user who created it and becomes its owner.',
      name: 'Shop name as entered.',
      slug: 'URL slug, unique across shops.',
    },
  },
  'shop.updated': {
    description: 'A shop’s public details changed; consumers fetch what they need.',
    publisher: 'shops',
    payload: { shopId: 'The shop that changed.' },
  },
  'shop.verified': {
    description: 'An admin decision on a shop’s verification, or a change to what it may sell.',
    publisher: 'shops',
    payload: {
      shopId: 'The shop.',
      verificationStatus: 'verified, rejected or suspended.',
      checkoutEnabled: 'True when the shop may take online payments.',
      codEnabled: 'True when the shop may take cash on delivery.',
    },
  },
  'branch.updated': {
    description: 'A branch was added, moved, edited or removed.',
    publisher: 'shops',
    payload: {
      branchId: 'The branch.',
      shopId: 'The shop it belongs to.',
      deleted: 'True when the branch was removed.',
    },
  },
  'product.upserted': {
    description: 'A product was created or changed.',
    publisher: 'catalog',
    payload: { productId: 'The product.', shopId: 'The shop that sells it.' },
  },
  'product.removed': {
    description: 'A product was removed from sale.',
    publisher: 'catalog',
    payload: { productId: 'The product.', shopId: 'The shop that sold it.' },
  },
  'media.ready': {
    description:
      'An upload passed its checks and was stored: images re-encoded into their sizes, documents kept privately.',
    publisher: 'media',
    payload: {
      mediaId: 'The media item.',
      ownerId: 'The user who uploaded it.',
      purpose: 'avatar, shop_logo, shop_gallery, product_image or trade_license.',
      urls: 'Public URL per generated size (thumb, card, full); empty for private documents.',
    },
  },
  'message.sent': {
    description: 'A chat message was stored.',
    publisher: 'messaging',
    payload: {
      messageId: 'The message.',
      conversationId: 'The conversation it belongs to.',
      senderId: 'The user who sent it.',
      recipientIds: 'The users to notify. The text itself is not in the event.',
    },
  },
  'order.placed': {
    description: 'A customer placed an order.',
    publisher: 'orders',
    payload: {
      orderId: 'The order.',
      shopId: 'The shop it was placed with.',
      customerId: 'The user who placed it.',
      totalFils: 'Order total in fils, VAT included.',
      paymentMethod: 'card (Stripe) or cod (cash on delivery).',
    },
  },
  'order.status_changed': {
    description: 'An order moved from one status to another.',
    publisher: 'orders',
    payload: { orderId: 'The order.', from: 'Status before.', to: 'Status after.' },
  },
  'payment.succeeded': {
    description: 'Stripe confirmed a charge on the shop’s connected account.',
    publisher: 'payments',
    payload: {
      paymentId: 'The payment record.',
      orderId: 'The order that was paid.',
      amountFils: 'Amount charged, in fils.',
      applicationFeeFils: 'The platform commission taken from it, in fils.',
    },
  },
  'payout.sent': {
    description: 'Stripe paid a shop out from its own balance.',
    publisher: 'payments',
    payload: {
      payoutId: 'The payout record.',
      shopId: 'The shop that was paid.',
      amountFils: 'Amount paid out, in fils.',
    },
  },
  'audit.recorded': {
    description:
      'An admin did something that must stay on record (a decision, a document opened, a switch); published in the same transaction as the action.',
    publisher: 'shops, catalog, discovery, media',
    payload: {
      actorId: 'The admin; null when no person acted (a command run on the server).',
      action: 'What was done, from AUDIT_ACTIONS, e.g. shop.listing_suspended.',
      subjectType:
        'What it was done to: shop, product, category, emirate, search, media, country or user.',
      subjectId: "The subject's id, or its code for an emirate or a country.",
      shopId: 'The shop concerned, or null.',
      details: 'Small facts about it (a reason, a document kind); never personal data.',
    },
  },
};

export const EVENT_NAMES = Object.keys(EVENT_CATALOG) as EventName[];

/**
 * The event sections of docs/architecture/events.md, generated so they cannot drift from the
 * types. `node tools/update-events-doc.mjs` rewrites the file.
 */
export function renderEventCatalog(): string {
  const sections = EVENT_NAMES.map((name) => {
    const doc = EVENT_CATALOG[name] as EventDoc<EventName>;
    const fields = Object.entries(doc.payload as Record<string, string>).map(
      ([field, meaning]) => `| \`${field}\` | ${meaning} |`,
    );
    return [
      `### \`${name}\``,
      '',
      `Published by **${doc.publisher}**. ${doc.description}`,
      '',
      '| Field | Meaning |',
      '| ----- | ------- |',
      ...fields,
    ].join('\n');
  });
  return sections.join('\n\n');
}

/** RabbitMQ topic exchange every event is published to; routing key = event name. */
export const EVENTS_EXCHANGE = 'am.events';
