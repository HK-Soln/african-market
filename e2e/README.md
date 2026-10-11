# End-to-end tests

Playwright tests for the core journeys, each in English and in Arabic (right-to-left). They drive a
real browser against the real web app, gateway and identity service.

## Running them

Once:

```bash
pnpm infra:up                 # Postgres, Redis, RabbitMQ
pnpm build                    # the backend runs from dist/
pnpm migration:run
pnpm exec playwright install chromium
```

Then:

```bash
pnpm e2e                      # all tests, headless
pnpm --filter @am/e2e e2e:ui  # Playwright's UI, to watch and debug
```

Playwright starts its own copy of the stack on its own ports (web 3100, gateway 4100, identity
4111 and 4211), so it runs beside `pnpm dev` without clashing. The web app builds into
`apps/web/.next-e2e`. After changing backend code, run `pnpm build` again: the tests use `dist/`.

To test a stack that is already running, set `E2E_BASE_URL` and `E2E_GATEWAY_URL`.

## How a test gets its sign-in code

The backend is started with `NODE_ENV=test` and `SMS_PROVIDER=memory`. In that mode identity keeps
the last message per phone in memory instead of sending it, and the gateway serves
`GET /api/v1/test/otp?phone=`. The `api.otpFor(phone)` fixture reads it.

That route hands out sign-in codes, so it is guarded twice: the gateway and identity only register
it when `NODE_ENV=test`, and identity refuses to start with `SMS_PROVIDER=memory` under any other
`NODE_ENV`. It is not in the OpenAPI description. It does not exist on staging or in production,
which means these tests cannot sign up there yet (see F0-14 in the directive).

## Writing tests

- Import `test` and `expect` from `./fixtures`, not from `@playwright/test`.
- Find things the way a person does: by role and by the label in their language. `messages.en`
  and `messages.ar` are the web app's own translations.
- `signedIn` gives a browser that is already signed in as a new person, for tests that are not
  about signing in. `api.signUp()` does the same on demand.
- `newPhone()` returns a number nobody has used in this run. Never reuse a number across tests:
  identity limits codes per phone.
- Every journey gets an `/en` and an `/ar` case.
