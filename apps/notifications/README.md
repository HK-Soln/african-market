# notifications service

Phase introduced: **2** (see `docs/directives/`).

|                                 |                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Owns                            | Email, SMS, push and WhatsApp templates, user preferences, delivery log            |
| Tables (schema `notifications`) | notification, notification_preference, push_subscription, template                 |
| Publishes                       | none                                                                               |
| Consumes                        | `user.registered`, `shop.verified`, `message.sent`, `order.*`, `payment.succeeded` |
| Ports (dev)                     | TCP and HTTP from `SERVICES.notifications` in `libs/contracts/src/services.ts`     |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/notifications              # watch mode
pnpm nx run @am/notifications:migration:run
pnpm nx run @am/notifications:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/notifications
```
