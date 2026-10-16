# discovery service

Phase introduced: **1** (see `docs/directives/`).

|                             |                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Owns                        | Denormalised geo search read model (branches joined with shop and product data), ranking, filters |
| Tables (schema `discovery`) | search_branch, search_product, search_category, search_media (read model only)                    |
| Publishes                   | none                                                                                              |
| Consumes                    | `shop.*`, `branch.updated`, `product.*`, `media.ready`                                            |
| Ports (dev)                 | TCP and HTTP from `SERVICES.discovery` in `libs/contracts/src/services.ts`                        |

Each event names what changed; discovery then reads the owner's current state over TCP (shops'
and catalog's `search` patterns, decision T-31) and writes it, never letting an older snapshot
overwrite a newer row. `discovery.search.rebuild` (admins) reads every verified shop again.
Text search uses the `discovery.am_simple` configuration (accents and case ignored).

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/discovery              # watch mode
pnpm nx run @am/discovery:migration:run
pnpm nx run @am/discovery:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/discovery
```
