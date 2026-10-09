# discovery service

Phase introduced: **1** (see `docs/directives/`).

|                             |                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Owns                        | Denormalised geo search read model (branches joined with shop and product data), ranking, filters |
| Tables (schema `discovery`) | search_branch, search_product (read model only; rebuilt from events)                              |
| Publishes                   | none                                                                                              |
| Consumes                    | `shop.*`, `branch.updated`, `product.*`                                                           |
| Ports (dev)                 | TCP and HTTP from `SERVICES.discovery` in `libs/contracts/src/services.ts`                        |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/discovery              # watch mode
pnpm nx run @am/discovery:migration:run
pnpm nx run @am/discovery:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/discovery
```
