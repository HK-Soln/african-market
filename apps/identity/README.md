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
- Codes go out on WhatsApp unless the caller passes `channel: 'sms'` (decision P-09).
- Limits (Redis): 5 codes per phone per hour and 20 per IP per hour. The wait before a resend
  starts at 30 seconds and doubles with each code sent in the hour (30 s, 1 min, 2 min, 4 min,
  capped at 15 min); `requestOtp` returns it as `resendAfterSeconds`.
- Only an HMAC-SHA256 of the code is stored (`OTP_HMAC_SECRET`). Codes are never logged.
- Creating an account requires `termsAccepted: true`; the time is recorded, and marketing consent only when given.
- Messages go through the `SmsProvider` interface. `SMS_PROVIDER=console` prints the message to stdout for
  local use and is refused in staging and production; `twilio` is a placeholder until a sender ID is registered.
- Request and response types and the error codes (`IdentityErrors`) are in `libs/contracts/src/dto/identity.ts`.

## Email and password (F0-04)

| Pattern (`IdentityPatterns`) | What it does                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `registerWithEmail`          | Creates an unverified account with an argon2id password hash and emails a six-digit code.     |
| `resendEmailCode`            | Sends a fresh code to an address that registered but has not confirmed it.                    |
| `verifyEmail`                | Confirms the address with the code and the registration password; queues `user.registered`.   |
| `loginWithPassword`          | Signs in. An unverified address gets `EMAIL_NOT_VERIFIED`, but only after the right password. |
| `requestPasswordReset`       | Emails a reset code to a verified account.                                                    |
| `resetPassword`              | Sets a new password with the code and revokes the user's sessions.                            |

- Email codes follow the same rules as phone codes (5 minutes, 5 attempts, single use, escalating
  resend delay), with separate timers for verification and reset.
- Nothing reveals whether an address is registered. Register, resend and reset-request always return
  the same shape; an existing owner is told by email instead. A wrong password and an unknown email
  give the same `INVALID_CREDENTIALS` in the same time.
- Sign-in allows 5 wrong passwords per email and 30 per IP in 15 minutes, then `LOGIN_RATE_LIMITED`.
- Passwords are 10 to 128 characters, hashed with argon2id (19 MiB, 2 passes). Hashes made with
  older settings are redone at the next sign-in.
- Emails go through the `EmailProvider` interface, in English, Arabic (right-to-left) and French.
  `EMAIL_PROVIDER=smtp` is Mailpit locally (inbox at http://localhost:8025) and SES through its SMTP
  endpoint in production; `ses` is a placeholder for the API adapter.

## Sessions, tokens and the profile (F0-05)

| Pattern (`IdentityPatterns`) | What it does                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `refreshSession`             | Swaps a refresh token for a new access and refresh token.                            |
| `logout`                     | Signs out the device the refresh token belongs to. Same answer for an unknown token. |
| `getMe`                      | The signed-in person and their shop memberships.                                     |
| `updateMe`                   | Changes name, language, home emirate and marketing consent.                          |

- Every sign-in returns `session`: an HS256 access token (15 minutes, signed with
  `JWT_ACCESS_SECRET`, which the gateway shares) and an opaque refresh token (32 random bytes, 30
  days). Only the SHA-256 of the refresh token is stored.
- A refresh token works once. Using it creates the next one in the same family; a replaced token
  that comes back more than 10 seconds later signs the whole family out (`SESSION_REUSED`). The 10
  seconds let two tabs refresh at the same moment.
- The access token carries `sub`, `roles`, `shops` and `locale`, read from the database each time
  one is issued, so role and membership changes arrive at the next refresh.
- A suspended user cannot refresh, and trying signs that session out.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/identity              # watch mode
pnpm nx run @am/identity:migration:run
pnpm nx run @am/identity:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/identity             # includes test/*.spec.ts, which need Postgres (pnpm infra:up)
```
