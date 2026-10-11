# gateway (BFF)

The only HTTP API the frontends call: `http://localhost:4000/api/v1/...`, Swagger UI at `/docs`.

- Global guards: throttling, `JwtAuthGuard` (mark open routes with `@Public()`), `RolesGuard` (`@Roles`, `@ShopRoles`).
- Controllers validate input with class-validator DTOs, then call services through `ServiceCaller.call(service, pattern, data)`.
  Never call a service's database or HTTP port directly.
- Every error is `{ statusCode, code, message, details? }` (`common/http-error.filter.ts`).
- After changing routes: `pnpm nx run @am/gateway:openapi && pnpm nx run @am/api-client:generate`.
- Chat (Phase 2) adds a Socket.IO namespace that proxies to `messaging`; see docs/directives/02-engagement.md.

## Auth routes (F0-06)

| Route                                | What it does                                                     |
| ------------------------------------ | ---------------------------------------------------------------- |
| `POST /api/v1/auth/otp/request`      | Sends a sign-in code to a phone (WhatsApp by default).           |
| `POST /api/v1/auth/otp/verify`       | Checks the code; signs in, creating the account for a new phone. |
| `POST /api/v1/auth/register`         | Registers with email and password; emails a code.                |
| `POST /api/v1/auth/email/resend`     | Sends the email code again.                                      |
| `POST /api/v1/auth/email/verify`     | Confirms the address; signs in.                                  |
| `POST /api/v1/auth/login`            | Signs in with email and password.                                |
| `POST /api/v1/auth/password/forgot`  | Emails a password reset code.                                    |
| `POST /api/v1/auth/password/reset`   | Sets a new password with the code; signs in.                     |
| `POST /api/v1/auth/refresh`          | Swaps the refresh cookie for a new pair of tokens.               |
| `POST /api/v1/auth/logout`           | Signs out on this device and clears the cookies.                 |
| `GET /api/v1/me`, `PATCH /api/v1/me` | The signed-in person's profile and shops.                        |

- A sign-in sets two httpOnly, SameSite=Lax cookies: `am_at` (access token, 15 minutes, path `/`)
  and `am_rt` (refresh token, 30 days, path `/api/v1/auth`). They are `Secure` in staging and
  production. The access token is also in the response body; the refresh token never is.
- The gateway adds the caller's IP, user agent, request id and `Accept-Language` to what it sends
  identity. The user id for `/me` comes from the token, never from the body.
- `COOKIE_DOMAIN` (e.g. `.africanmarket.ae`) and `TRUST_PROXY_HOPS` (1 behind a load balancer) are
  unset locally and must be set when deployed.
