# Events

Services tell each other what happened through events on RabbitMQ. This page is how that works
and what every event carries.

## How an event travels

1. **Written with the change.** A service calls `OutboxService.enqueue(manager, name, payload)`
   inside the same database transaction as the state change. If the transaction rolls back, the
   event never existed.
2. **Published by the relay.** `OutboxRelay` polls the service's `outbox` table (every 500 ms)
   and publishes unpublished rows to the topic exchange `am.events`, with the event name as the
   routing key. A row is marked published only after RabbitMQ confirms it. If RabbitMQ is down the
   rows wait and go out, in order, when it is back.
3. **Delivered to each subscriber.** Every service has one durable queue, `<service>.events`,
   bound to the event names it subscribed to with `eventBus.subscribe(name, handler)`.
4. **Handled once.** Handlers run inside `IdempotentConsumer.handle(event, '<service>.<purpose>', fn)`,
   which records the event id and the handler's changes in one transaction.

## What can go wrong, and what happens

| Situation                                      | What happens                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The transaction rolls back                     | Nothing is published.                                                                                                                                                    |
| RabbitMQ is down                               | Rows stay in the outbox; the relay retries every tick. The business request is unaffected.                                                                               |
| The service stops between "publish" and "mark" | The event is published a second time. `IdempotentConsumer` ignores the copy.                                                                                             |
| A handler throws                               | The event waits in `<service>.events.retry.<ms>` and comes back: after 5 s, then 30 s, then 2 min (`EVENT_RETRY_DELAYS_MS`). Only the service that failed gets it again. |
| It still fails after the last wait             | It goes to `<service>.events.dlq` with `x-attempt` and `x-last-error` headers and stays there until someone looks.                                                       |
| The message cannot be parsed                   | Straight to `<service>.events.dlq`; retrying cannot fix it.                                                                                                              |

Delivery is **at least once**, and order is kept per publishing service but not across retries.
A handler must therefore be safe to run twice and must not depend on seeing events in order:
carry ids in the payload and read the current state when order matters.

Published outbox rows are deleted after 7 days. Unpublished rows are never deleted.

## Rules for events

- Names are `<aggregate>.<past_tense_verb>` and never change once shipped. A breaking payload
  change gets a new name (`shop.verified.v2`).
- Payloads carry ids and the fields consumers need to build their read models. Never secrets,
  tokens, one-time codes, card data or the text of a message.
- A new event needs its payload type in `EventPayloads` and its entry in `EVENT_CATALOG`
  (`libs/contracts/src/events.ts`); the compiler insists on both. Then run
  `pnpm nx build @am/contracts && node tools/update-events-doc.mjs && pnpm format` to update the
  list below.

## The dead-letter queue

A message in `<service>.events.dlq` is a bug or an outage that outlasted the retries. Look at
`x-last-error`, fix the cause, then move the message back to `<service>.events` with the
RabbitMQ management UI (shovel or "Move messages"). The handler's idempotency makes replaying
safe. Alerting on a non-empty dead-letter queue comes with F0-15.

## Every event

<!-- events:start (generated from EVENT_CATALOG) -->

### `user.registered`

Published by **identity**. A new account became real: a phone or an email address was verified.

| Field               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `userId`            | The new user.                                         |
| `phone`             | E.164 phone, when the account was created by phone.   |
| `email`             | Email address, when the account was created by email. |
| `preferredLanguage` | en, ar or fr; the language to greet them in.          |

### `user.deleted`

Published by **identity**. A person deleted their account: it is closed now, and every service must erase their personal data by eraseBy.

| Field       | Meaning                                                             |
| ----------- | ------------------------------------------------------------------- |
| `userId`    | The user whose account was deleted.                                 |
| `deletedAt` | ISO-8601 UTC: when it was closed; hide their content from then on.  |
| `eraseBy`   | ISO-8601 UTC: by when copies of their personal data must be erased. |

### `membership.changed`

Published by **identity**. A user was given, changed in, or removed from a role in a shop.

| Field       | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `userId`    | The user whose membership changed.                               |
| `shopId`    | The shop.                                                        |
| `role`      | owner, manager or staff; null when the membership was removed.   |
| `branchIds` | Branches a staff member is limited to; empty means every branch. |

### `shop.created`

Published by **shops**. A seller created a shop (not yet verified or visible in search).

| Field     | Meaning                                        |
| --------- | ---------------------------------------------- |
| `shopId`  | The new shop.                                  |
| `ownerId` | The user who created it and becomes its owner. |
| `name`    | Shop name as entered.                          |
| `slug`    | URL slug, unique across shops.                 |

### `shop.updated`

Published by **shops**. A shop’s public details changed; consumers fetch what they need.

| Field    | Meaning                |
| -------- | ---------------------- |
| `shopId` | The shop that changed. |

### `shop.verified`

Published by **shops**. An admin decision on a shop’s verification, or a change to what it may sell.

| Field                | Meaning                                       |
| -------------------- | --------------------------------------------- |
| `shopId`             | The shop.                                     |
| `verificationStatus` | verified, rejected or suspended.              |
| `checkoutEnabled`    | True when the shop may take online payments.  |
| `codEnabled`         | True when the shop may take cash on delivery. |

### `branch.updated`

Published by **shops**. A branch was added, moved, edited or removed.

| Field      | Meaning                           |
| ---------- | --------------------------------- |
| `branchId` | The branch.                       |
| `shopId`   | The shop it belongs to.           |
| `deleted`  | True when the branch was removed. |

### `product.upserted`

Published by **catalog**. A product was created or changed.

| Field       | Meaning                 |
| ----------- | ----------------------- |
| `productId` | The product.            |
| `shopId`    | The shop that sells it. |

### `product.removed`

Published by **catalog**. A product was removed from sale.

| Field       | Meaning                |
| ----------- | ---------------------- |
| `productId` | The product.           |
| `shopId`    | The shop that sold it. |

### `media.ready`

Published by **media**. An uploaded image passed its checks and its sizes were generated.

| Field     | Meaning                                                |
| --------- | ------------------------------------------------------ |
| `mediaId` | The media item.                                        |
| `ownerId` | The user or shop that uploaded it.                     |
| `urls`    | Public URL per generated size, e.g. thumb, card, full. |

### `message.sent`

Published by **messaging**. A chat message was stored.

| Field            | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `messageId`      | The message.                                              |
| `conversationId` | The conversation it belongs to.                           |
| `senderId`       | The user who sent it.                                     |
| `recipientIds`   | The users to notify. The text itself is not in the event. |

### `order.placed`

Published by **orders**. A customer placed an order.

| Field           | Meaning                                  |
| --------------- | ---------------------------------------- |
| `orderId`       | The order.                               |
| `shopId`        | The shop it was placed with.             |
| `customerId`    | The user who placed it.                  |
| `totalFils`     | Order total in fils, VAT included.       |
| `paymentMethod` | card (Stripe) or cod (cash on delivery). |

### `order.status_changed`

Published by **orders**. An order moved from one status to another.

| Field     | Meaning        |
| --------- | -------------- |
| `orderId` | The order.     |
| `from`    | Status before. |
| `to`      | Status after.  |

### `payment.succeeded`

Published by **payments**. Stripe confirmed a charge on the shop’s connected account.

| Field                | Meaning                                         |
| -------------------- | ----------------------------------------------- |
| `paymentId`          | The payment record.                             |
| `orderId`            | The order that was paid.                        |
| `amountFils`         | Amount charged, in fils.                        |
| `applicationFeeFils` | The platform commission taken from it, in fils. |

### `payout.sent`

Published by **payments**. Stripe paid a shop out from its own balance.

| Field        | Meaning                   |
| ------------ | ------------------------- |
| `payoutId`   | The payout record.        |
| `shopId`     | The shop that was paid.   |
| `amountFils` | Amount paid out, in fils. |

<!-- events:end -->
