# messaging service

Phase introduced: **2** (see `docs/directives/`).

|                             |                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Owns                        | Conversations, messages, attachments, read state, Socket.IO gateway (Redis adapter) |
| Tables (schema `messaging`) | conversation, conversation_participant, message                                     |
| Publishes                   | `message.sent`                                                                      |
| Consumes                    | `membership.changed` (inbox access)                                                 |
| Ports (dev)                 | TCP and HTTP from `SERVICES.messaging` in `libs/contracts/src/services.ts`          |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/messaging              # watch mode
pnpm nx run @am/messaging:migration:run
pnpm nx run @am/messaging:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/messaging
```
