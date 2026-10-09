# orders service

Phase introduced: **3** (see `docs/directives/`).

|                          |                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Owns                     | Carts (single shop), orders, order items, fulfilment status, stock reservations, reviews tied to orders |
| Tables (schema `orders`) | cart, cart_item, order, order_item, stock_reservation, review                                           |
| Publishes                | `order.placed`, `order.status_changed`                                                                  |
| Consumes                 | `payment.succeeded`, `product.*`                                                                        |
| Ports (dev)              | TCP and HTTP from `SERVICES.orders` in `libs/contracts/src/services.ts`                                 |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/orders              # watch mode
pnpm nx run @am/orders:migration:run
pnpm nx run @am/orders:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/orders
```
