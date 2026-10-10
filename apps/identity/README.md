# identity service

Phase introduced: **0** (see `docs/directives/`).

|                            |                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Owns                       | Users, credentials, OTP, sessions and refresh tokens, roles, shop memberships, saved addresses |
| Tables (schema `identity`) | user, credential, otp_challenge, session (refresh token family), shop_member, address          |
| Publishes                  | `user.registered`, `membership.changed`                                                        |
| Consumes                   | `shop.created` (create the owner membership)                                                   |
| Ports (dev)                | TCP and HTTP from `SERVICES.identity` in `libs/contracts/src/services.ts`                      |

## Phone sign-up and sign-in (F0-03)

| Pattern (`IdentityPatterns`)        | What it does                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `requestOtp` `identity.otp.request` | Normalises the phone to E.164 (default region AE), applies the limits below and sends a six-digit code.                               |
| `verifyOtp` `identity.otp.verify`   | Checks the code. An unknown phone becomes a new user and `user.registered` is queued in the same transaction; a known phone signs in. |

- A code lives 5 minutes, allows 5 wrong attempts and works once. Requesting a new one cancels the old one.
- Limits (Redis): one code per phone every 30 seconds, 5 per phone per hour, 20 per IP per hour.
- Only an HMAC-SHA256 of the code is stored (`OTP_HMAC_SECRET`). Codes are never logged.
- Creating an account requires `termsAccepted: true`; the time is recorded, and marketing consent only when given.
- Messages go through the `SmsProvider` interface. `SMS_PROVIDER=console` prints the message to stdout for
  local use and is refused in staging and production; `twilio` is a placeholder until a sender ID is registered.
- Request and response types and the error codes (`IdentityErrors`) are in `libs/contracts/src/dto/identity.ts`.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/identity              # watch mode
pnpm nx run @am/identity:migration:run
pnpm nx run @am/identity:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/identity             # includes test/*.spec.ts, which need Postgres (pnpm infra:up)
```
