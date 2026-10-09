# shops service

Phase introduced: **1** (see `docs/directives/`).

|                         |                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Owns                    | Shops, branches, opening hours, special hours, service areas, KYC and verification status, contact-tap events |
| Tables (schema `shops`) | shop, branch, opening_hours, special_hours, verification_request, contact_event                               |
| Publishes               | `shop.created`, `shop.updated`, `shop.verified`, `branch.updated`                                             |
| Consumes                | `media.ready` (logo and gallery)                                                                              |
| Ports (dev)             | TCP and HTTP from `SERVICES.shops` in `libs/contracts/src/services.ts`                                        |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/shops              # watch mode
pnpm nx run @am/shops:migration:run
pnpm nx run @am/shops:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/shops
```
