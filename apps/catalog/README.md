# catalog service

Phase introduced: **1** (see `docs/directives/`).

|                           |                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Owns                      | Categories, products and services, variants, prices, branch availability           |
| Tables (schema `catalog`) | category, product, variant, branch_listing, known_shop, known_branch               |
| Publishes                 | `product.upserted`, `product.removed`                                              |
| Consumes                  | `shop.created`, `shop.verified` (only verified shops are public), `branch.updated` |
| Ports (dev)               | TCP and HTTP from `SERVICES.catalog` in `libs/contracts/src/services.ts`           |

Products go `draft` → `active`, or through `pending_review` when the category is food or
restricted (or an admin rejected it before); admins approve or reject with a reason. Owners and
managers edit products, prices and listings; staff change stock at their branches only.
`known_shop` and `known_branch` are this service's copy of what the shops service announced
(decision T-30). The category tree is seeded by the `Catalogue` migration in en, ar and fr.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/catalog              # watch mode
pnpm nx run @am/catalog:migration:run
pnpm nx run @am/catalog:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/catalog
```
