# catalog service

Phase introduced: **1** (see `docs/directives/`).

|                           |                                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| Owns                      | Categories, products and services, variants, prices, branch availability |
| Tables (schema `catalog`) | category, product, variant, branch_listing                               |
| Publishes                 | `product.upserted`, `product.removed`                                    |
| Consumes                  | `shop.verified` (hide products of suspended shops), `branch.updated`     |
| Ports (dev)               | TCP and HTTP from `SERVICES.catalog` in `libs/contracts/src/services.ts` |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/catalog              # watch mode
pnpm nx run @am/catalog:migration:run
pnpm nx run @am/catalog:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/catalog
```
