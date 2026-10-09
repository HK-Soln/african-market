# payments service

Phase introduced: **3** (see `docs/directives/`).

|                            |                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Owns                       | Stripe Connect onboarding, payment intents (direct charges + application fee), webhook mirror, refunds, payout status |
| Tables (schema `payments`) | connected_account, payment, ledger_entry (read-only Stripe mirror), payout, stripe_webhook_event                      |
| Publishes                  | `payment.succeeded`, `payout.sent`                                                                                    |
| Consumes                   | `order.placed`                                                                                                        |
| Ports (dev)                | TCP and HTTP from `SERVICES.payments` in `libs/contracts/src/services.ts`                                             |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/payments              # watch mode
pnpm nx run @am/payments:migration:run
pnpm nx run @am/payments:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/payments
```
