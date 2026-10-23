# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository. Read this file fully before
changing anything, then read the directive for the phase you are working on.

## What we are building

**African Market UAE**: a location-first marketplace where African sellers in the UAE list their
shops, branches and the areas they serve, and customers find them by distance, then contact them
(WhatsApp, call, email), chat in-app, or order and pay online when the shop has checkout enabled.

- Full product and technical plan: [`docs/PLAN.md`](docs/PLAN.md) (snapshot of the agreed plan).
- Confirmed business decisions and technical decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md).
- Work is delivered phase by phase from [`docs/directives/`](docs/directives/README.md).
- Engineering conventions in detail: [`docs/architecture/conventions.md`](docs/architecture/conventions.md).
- Branch flow, required checks and branch rules: [`docs/architecture/branching-and-cicd.md`](docs/architecture/branching-and-cicd.md).

## Non-negotiable product rules

These come from the product owner (Henson). Do not change them without an explicit new decision
recorded in `docs/DECISIONS.md`.

1. **Payments are Stripe Connect only, direct charges.** The shop is merchant of record; money goes
   straight to the shop's connected account and the platform takes an `application_fee_amount`.
   The platform never holds, pools or moves seller funds. No in-house wallet or balance ledger.
   If Stripe Connect cannot be used, online checkout does not ship.
2. **Seller verification:** every seller passes basic KYC (who they are). Turning on checkout also
   requires a trade licence validated by an admin, plus Stripe reporting charges and payouts enabled.
3. **PWA first.** No native apps until Phase 4, and only if usage proves the need.
4. **All seven emirates** at launch. Search opens per emirate once it has verified shops.
5. **Free listings plus commission on checkout orders.** Cash-on-delivery orders are commission-free
   at launch. Contact-only sellers are monetised with Boosts (Phase 2) and a Pro plan (Phase 4),
   never per WhatsApp/call tap.
6. **Sellers deliver themselves.** Keep delivery behind a `DeliveryProvider` interface so a delivery
   product and third-party couriers can plug in later.
7. **English and Arabic (RTL) from the first screen**; French in Phase 2.
8. Personal data stays in a UAE region (AWS me-central-1). Respect UAE PDPL: consent, purpose
   limits, export and delete on request.

## Repository map

```
apps/
  web/ seller/ admin/      Next.js 15 App Router, next-intl (en, ar, fr), Tailwind v4
  gateway/                 NestJS BFF, the only HTTP API the frontends call (port 4000, /api/v1, /docs)
  identity/ shops/ catalog/ discovery/ media/          NestJS services, Phase 0-1
  messaging/ notifications/                            Phase 2
  orders/ payments/                                    Phase 3
libs/
  contracts/   service registry + ports, TCP message patterns, event names + payload types, money, WhatsApp links
  core/        Nest service kit: bootstrapService(), ServiceCoreModule (env, pino logs, health), EventBus (RabbitMQ), AppRpcException
  database/    AppBaseEntity, buildDataSourceOptions(), DatabaseModule, OutboxService, OutboxRelay, IdempotentConsumer, migration helpers
  auth/        JWT claims, @Public/@Roles/@ShopRoles/@CurrentUser, JwtAuthGuard, RolesGuard, canAccessBranch()
  geo/         emirates, LatLng/GeoJSON helpers, PostGIS SQL fragments (withinMeters, coversPoint, distanceMeters)
  i18n/        LOCALES, textDirection(), LocalizedText + pickLocalized(), formatAed(), UAE timezone
  ui/          the design system: tokens (theme.css), component styles (components.css), fonts, logos, React components
  api-client/  openapi-fetch client; src/schema.ts is GENERATED from apps/gateway/openapi.json
infra/docker/  local Postgres init SQL         infra/terraform/  AWS (Phase 0 task)
docs/          PLAN, DECISIONS, directives, architecture conventions
```

Each service has a `README.md` stating what it owns, which events it publishes and consumes, and its phase.

## Commands

```bash
pnpm install
pnpm infra:up                      # Postgres+PostGIS, Redis, RabbitMQ, MinIO, Mailpit (docker compose)
cp .env.example .env               # then adjust; services read process.env
pnpm build                         # nx: builds libs first, then apps
pnpm migration:run                 # every service, against its own schema
pnpm dev                           # all apps and services in watch mode
pnpm dev:api | pnpm dev:web        # backend only | frontends only
pnpm nx dev @am/shops              # one project
pnpm test | pnpm lint | pnpm typecheck
pnpm affected                      # what CI runs (compared with dev)
pnpm nx run @am/gateway:openapi && pnpm nx run @am/api-client:generate   # after any gateway route change
pnpm nx run @am/<svc>:migration:generate src/migrations/<PascalName>       # after entity changes (build first)
```

Local URLs: web 3000, seller 3001, admin 3002, gateway 4000 (`/docs` Swagger), services TCP 41xx / HTTP
`/health` 42xx (see `libs/contracts/src/services.ts`), RabbitMQ UI 15672, MinIO console 9001,
Mailpit 8025. Docker credentials are `am` / `am`, except MinIO: `am-minio` / `am-minio-secret`.
`pnpm stack:up` runs the whole stack in containers on the same ports instead (`infra/docker/README.md`).
Without Docker, run it in a GitHub codespace (made-up data only): see `.devcontainer/README.md`.

## How the pieces talk (do not bypass)

- **Frontend → gateway only**, over REST, using `@am/api-client`. Frontends never call a service.
- **Gateway → service** over Nest TCP with `ServiceCaller.call(service, Pattern, data)`. Patterns are
  constants in `libs/contracts/src/patterns.ts`; add the constant first, then the handler
  (`@MessagePattern(ShopsPatterns.create)`) and the gateway controller.
- **Service → service** only through events: write with `OutboxService.enqueue(manager, 'shop.created', payload)`
  **inside the same transaction** as the state change; `OutboxRelay` publishes to RabbitMQ.
  Consume with `eventBus.subscribe(name, handler)` in `onModuleInit`, always wrapped in
  `IdempotentConsumer.handle(event, '<service>.<purpose>', fn)`.
- **A service never reads another service's schema.** Discovery builds its own read model from events.
  If you need fresh data synchronously, add a TCP pattern on the owning service.
- Services return errors with `AppRpcException` (`status`, stable `code`); the gateway maps them to HTTP.

## Conventions (summary; details in docs/architecture/conventions.md)

- **TypeScript strict** everywhere. No `any` without a comment explaining why.
- **Database:** PostgreSQL 16 + PostGIS, TypeORM 0.3, schema per service, `synchronize: false` always,
  every change is a migration. Entities extend `AppBaseEntity` (uuid, `created_at`, `updated_at`,
  `deleted_at`); snake_case columns via the naming strategy. Geography columns use
  `geographyPointColumn` from `@am/geo` with `@Index({ spatial: true })`.
- **Money:** integer fils (`*_fils` columns, `bigint`/`int`), currency `AED`. Never floats. Prices shown
  VAT-inclusive (5%).
- **Money and stock changes** use explicit transactions with row locks (`pessimistic_write`) or
  `SERIALIZABLE`; never entity listeners/subscribers.
- **Translated content:** `jsonb` `LocalizedText` (`{ en, ar, fr }`); read with `pickLocalized`.
  UI strings live in `apps/*/messages/{en,ar,fr}.json`; every new key goes into all three files
  (fr may be English text until Phase 2, marked in the PR).
- **UI:** build screens from `@am/ui` and its tokens (`bg-surface`, `text-ink-muted`, `bg-clay`); the
  Claude Design system is the source of truth (`libs/ui/README.md`, T-17). Tailwind's default colours
  are switched off. Check new components at `/en/dev/ui` and `/ar/dev/ui`.
- **RTL:** use logical Tailwind utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`).
  Never `ml-`/`mr-`/`left-`/`right-` for layout. Check every screen in `/ar`.
- **Phones:** E.164, validated with `libphonenumber-js`, default region AE. **Time:** store UTC
  (`timestamptz`), display `Asia/Dubai`. Weekend is Saturday-Sunday.
- **Validation:** class-validator DTOs at the gateway; services validate again for anything they persist.
- **Auth:** access JWT 15 min + rotating refresh token in httpOnly cookies. Gateway routes are
  authenticated by default; mark open ones `@Public()`. Shop routes use `:shopId` + `@ShopRoles()`;
  branch-level staff checks use `canAccessBranch()` in the service.
- **Configuration** is read only through zod schemas: `loadEnv` / `APP_ENV` from `@am/core` in the
  backends (a new key goes into `baseEnvSchema` or the service's own schema), and
  `src/lib/config.ts` in each Next app. ESLint rejects `process.env` anywhere else (tests excepted).
  **No defaults, for anything** (decision T-45): every key must be set, or the app stops at start
  (a Next app at `next build`) and names it. A feature that can be off is set to `none`
  (`noneMeansOff` / `listOrNone` from `@am/core`), never left empty: ECS drops empty values.
  `DEPLOY_ENV` names the environment and is read only to refuse unsafe settings in staging and
  production; `NODE_ENV` belongs to Node and Next. A behaviour gets its own switch
  (`COOKIE_SECURE`, `TEST_SUPPORT_ROUTES`, `FAKE_SOCIAL_SIGN_IN`), never "if the environment is X".
  Add a new key to `.env.example`, CI's `env:`, docker compose and Terraform
  (`infra/terraform/modules/platform`) in the same change; tests build env objects from
  `testBaseEnv` (`@am/core/testing`).
- **Lists** take one query format and use cursor (keyset) pagination, never offset:
  `filter[field][op]=`, `sort=-a,b`, `limit` (max 100), `cursor` → `{ items, nextCursor, prevCursor }`.
  Declare a `ListSpec` in `@am/contracts`; use `@ListQueryParams`/`@ApiListQuery` in the gateway and
  `findPage` from `@am/database` in the service. No route returns a whole table that can grow
  (`docs/architecture/conventions.md` §5).
- **Secrets** never in the repo. `.env` is git-ignored; production uses AWS Secrets Manager.
- **Logging and tracing:** pino JSON via `nestjs-pino`. Each app's `main.ts` imports `./instrument` first
  (`startTelemetry`, OpenTelemetry); the trace id is the request id, is on every log line and becomes
  events' `correlationId`. Errors a person must look at go to Sentry through `reportError` (off without a DSN).
  Never log tokens, OTP codes, passwords, full card or ID data.
- **Naming:** packages `@am/<name>`; events `<aggregate>.<past_verb>`; patterns `<service>.<resource>.<verb>`;
  error codes `UPPER_SNAKE` prefixed by domain (`SHOP_NOT_FOUND`).

## Testing

- Unit tests next to code (`*.spec.ts`, Jest + ts-jest).
- Integration tests in `apps/<svc>/test/` against real Postgres+PostGIS (and RabbitMQ where events
  matter) using Testcontainers; geo queries must be tested against PostGIS, never mocked.
  `createTestDatabase` from `@am/database/testing` gives each test file a throwaway database
  with the service's migrations applied; set `TEST_DATABASE_URL` to reuse the Postgres from
  `pnpm infra:up` instead of starting a container.
- Event payload contract tests in `libs/contracts`.
- Playwright end-to-end tests for the three core journeys (find and contact, list a shop, buy) in
  **both English and Arabic**.
- A task is not done until `pnpm affected` (lint, typecheck, test, build) passes.

## How to work in this repo (for Claude Code)

1. Find the current phase: the lowest-numbered file in `docs/directives/` with unchecked tasks.
2. Take the **first unchecked task** whose dependencies are done. Read the referenced sections of
   `docs/PLAN.md` and the service README before writing code.
3. Implement it completely: entities + migration, patterns/events in `@am/contracts`, service handler,
   gateway route + DTO + OpenAPI, regenerated api-client, UI in en/ar (fr keys present), tests.
4. Run `pnpm affected` (or the relevant `nx` targets) until green. Run the migration against the
   local database.
5. Tick the task in the directive (`- [x]`), add a one-line note under it if you made a judgement call,
   and record any new architectural decision in `docs/DECISIONS.md`.
6. Commit on a feature branch cut from `dev` (`feat/branch-service-areas`) with a conventional
   message (`feat(shops): branch service areas`), one task per commit, and open a pull request
   into `dev`. Never commit to or push `dev`, `stage` or `main` directly: code moves
   feature → `dev` → `stage` → `main` by pull request only
   ([`docs/architecture/branching-and-cicd.md`](docs/architecture/branching-and-cicd.md)).

When a directive is ambiguous, choose the option most consistent with `docs/PLAN.md` and the rules
above, note it under the task, and continue. Stop and ask the human only when a choice would change
money flow, legal/regulatory posture, personal-data handling, or something irreversible in production.

## AWS account guardrail

The AWS CLI profile `aws-toolkit` is shared with other projects and can be signed in to another
account. This project's test account is **726228202446** (`eu-north-1`, decision T-43).

- Before any AWS call that creates, changes or deletes something for this project (Terraform,
  the AWS MCP tools, the CLI), confirm `sts:GetCallerIdentity` returns this account; stop if not.
- Terraform enforces it too: every AWS provider has `allowed_account_ids` (the test account in
  `envs/test` and `bootstrap`, a required `aws_account_id` in staging and production), and
  `infra/deploy/test-env.sh` checks the account before it starts.
- Staging and production will be their own accounts; never point them at the test account.

## Things to never do

- Push to `dev`, `stage` or `main`, or open a pull request that skips a step of feature → `dev` →
  `stage` → `main`. `main` is production.
- Hold or move seller funds; build destination charges, separate charges and transfers, or wallets.
- Add a dependency on another service's tables or code (`apps/*` must not import `apps/*`).
- Use `synchronize: true`, edit an already-applied migration, or put business logic in migrations.
- Store card data (Stripe Elements only), raw ID documents outside the media service's private bucket,
  or secrets in code.
- Call Stripe, SMS, email or map providers directly from controllers: go through an adapter interface
  with a fake implementation for local and tests.
- Skip Arabic, or hard-code user-facing strings.
- Upgrade framework majors (Nest 11, Next 15, TypeORM 0.3, TypeScript 5.9, Nx 21) as a side effect of
  a feature; do it as its own task with a DECISIONS entry.
