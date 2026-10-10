# identity service

Phase introduced: **0** (see `docs/directives/`).

|                            |                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Owns                       | Users, credentials, OTP, sessions and refresh tokens, roles, shop memberships, saved addresses |
| Tables (schema `identity`) | user, credential, otp_challenge, session (refresh token family), shop_member, address          |
| Publishes                  | `user.registered`, `membership.changed`                                                        |
| Consumes                   | `shop.created` (create the owner membership)                                                   |
| Ports (dev)                | TCP and HTTP from `SERVICES.identity` in `libs/contracts/src/services.ts`                      |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/identity              # watch mode
pnpm nx run @am/identity:migration:run
pnpm nx run @am/identity:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/identity             # includes test/*.spec.ts, which need Postgres (pnpm infra:up)
```
