# Engineering conventions

The short version is in `CLAUDE.md`. This file has the detail and the examples.

## 1. Adding a feature end to end

Example: "seller creates a branch".

1. **Contract** (`libs/contracts`): add `ShopsPatterns.upsertBranch` (exists), request/response
   interfaces in `libs/contracts/src/dto/shops.ts`, and the `branch.updated` payload if it changes.
2. **Entity + migration** (`apps/shops/src/entities/branch.entity.ts`), export it from
   `entities/index.ts`, `pnpm nx build @am/shops`, then
   `pnpm nx run @am/shops:migration:generate src/migrations/AddBranch`. Review the SQL: check the
   GiST index on `location`/`service_area`, foreign keys inside the schema only, `NOT NULL`s.
3. **Service handler** (`apps/shops/src/branches/branches.controller.ts` with `@MessagePattern`,
   logic in `branches.service.ts`). Write the row and `outbox.enqueue(manager, 'branch.updated', …)`
   in one `dataSource.transaction`.
4. **Gateway** (`apps/gateway/src/shops/…`): DTO with class-validator + `@ApiProperty`, controller
   route `POST /api/v1/shops/:shopId/branches` with `@ShopRoles('owner','manager')`, calls
   `ServiceCaller.call('shops', ShopsPatterns.upsertBranch, {...dto, actorId: user.id})`.
5. **Client**: `pnpm nx run @am/gateway:openapi && pnpm nx run @am/api-client:generate`.
6. **UI** (`apps/seller`): page + form, strings in `messages/en.json`, `ar.json`, `fr.json`; check `/ar`.
7. **Consumers**: `discovery` subscribes to `branch.updated` and upserts its read model, wrapped in
   `IdempotentConsumer.handle`.
8. **Tests**: unit test the service logic; integration test the handler against PostGIS with
   Testcontainers; e2e if the step is part of a core journey.

## 2. Services

- Folder per module inside a service: `src/<module>/{<module>.controller.ts, <module>.service.ts, dto.ts}`.
- Controllers in services only have `@MessagePattern` handlers (plus the shared `/health`).
- Every handler receives an `actorId` (and `roles`) from the gateway and re-checks ownership.
  The gateway guard is the first check, not the only one.
- Service-specific env keys: extend `ServiceCoreModule.forRoot({ name, envSchema })` with a zod schema
  and add them to `.env.example`.
- Provider integrations (SMS, email, push, Stripe, Google Maps geocoding, S3, KYC) are interfaces with
  a real adapter and a fake adapter selected by env. Fakes are the default in development and tests.

## 3. Events

- Envelope: `EventEnvelope` in `libs/contracts/src/events.ts` (`id`, `name`, `source`, `occurredAt`,
  `correlationId`, `payload`).
- Payloads are additive-only. A breaking change is a new event name with a `.v2` suffix; publish both
  until every consumer moved.
- Publish only via the outbox. Never call `EventBus.publish` from request handlers.
- Consumers must tolerate out-of-order delivery: compare `occurredAt` or a version column before
  overwriting read-model rows.
- A consumer that throws dead-letters the message to `<service>.events.dlq`. Phase 0 adds a delayed
  retry (see directive F0-10); until then, fix and replay from the DLQ via the RabbitMQ UI.

## 4. Database

- Primary keys `uuid` (`gen_random_uuid()` via TypeORM). Human-facing numbers (order numbers) are
  separate columns.
- Soft delete with `deleted_at`; unique indexes that must ignore deleted rows use
  `WHERE deleted_at IS NULL`.
- Money: `int`/`bigint` `*_fils` + `currency char(3) default 'AED'`.
- Text search: `tsvector` generated columns using an `unaccent`-based configuration plus `pg_trgm`
  GIN indexes for fuzzy matching (create the text search configuration in the discovery migration).
- Geo: `geography(Point,4326)` for locations, `geography(MultiPolygon,4326)` for drawn service
  areas, plus `service_radius_m int` for radius areas. Queries use `withinMeters`, `coversPoint`,
  `distanceMeters` from `@am/geo` with bound parameters.
- Migrations are generated, then read and edited by hand if needed, never edited after merge.

## 5. Gateway API

- Base path `/api/v1`. Resource-oriented routes, plural nouns, kebab-case.
- **Lists** all take the same query and return the same page (decision T-21, F0-19):

  ```
  GET /api/v1/shops?filter[emirate][in]=DXB,SHJ&filter[rating][gte]=4&sort=-rating,name&limit=20&cursor=...
  → { items, nextCursor, prevCursor }
  ```

  - `filter[<field>]=<value>` is equality; `filter[<field>][<op>]=` with eq, ne, in
    (comma-separated), gte, lte, gt, lt, like (contains, case-insensitive). `sort` is
    comma-separated, `-` for descending; the id is always the last key. `limit` defaults to 20,
    never more than 100. `cursor` is opaque and only valid for the sort it came with.
  - **Cursor (keyset) pagination only, never offset**: a page starts after the last row's sort
    values, so it is as fast at page 1,000 as at page 1 and does not skip or repeat rows when
    others are added. No total count unless an endpoint has a cheap one.
  - Every list declares a `ListSpec` in `@am/contracts` (which fields may be filtered, with which
    operators, and sorted); anything else is a 400 `LIST_QUERY_INVALID` with `details.param`.
    Sortable fields are non-null and, on large tables, indexed together with the id.
  - Gateway: `@ApiListQuery(SPEC)` documents the parameters, `@ListQueryParams(SPEC)` reads and
    checks them, and the route sends `{ query }` to the service. Service: `listQueryFromPayload`
    (`@am/core`) checks it again, `findPage` (`@am/database`) runs it. Example: the country lists
    (identity `countries.service.ts`).
  - No route returns a whole table that can grow. Small, fixed reference data still uses the
    format; one page of 100 is enough there.

- Errors: `{ statusCode, code, message, details? }`. `code` is stable and translated in the frontend.
- `Accept-Language` decides the language of server-produced text.
- Rate limits: global 120/min per IP; stricter named throttles on OTP request/verify, login, contact
  logging and chat send.

## 6. Frontends

- Server components by default; client components only for interactivity (map, forms, chat).
- Data fetching on the server with `api(locale, accessToken)` from `src/lib/api.ts`; the access token
  comes from the `am_at` cookie. Browser calls go to the gateway with `credentials: 'include'`.
- Shop and product pages: SSR + `generateMetadata` with Open Graph tags (title, image, price in AED)
  so WhatsApp previews look right; `hreflang` alternates for en/ar/fr.
- Maps go through `apps/web/src/lib/maps/` adapter (`MapProvider` interface; Google Maps
  implementation first). Never import the Google SDK directly in a page.
- Accessibility: labelled inputs, focus states, 4.5:1 contrast, tap targets ≥ 44px.

## 7. Security baseline

- OWASP ASVS level 1 as the checklist for every feature PR.
- argon2id for passwords; OTPs are 6 digits, hashed, 5-minute expiry, 5 attempts, rate limited per
  phone and per IP in Redis.
- Refresh tokens: opaque, stored hashed, rotated on every use; reuse of an old token revokes the whole
  family.
- Audit log (admin actions, verification decisions, payout and checkout setting changes, refunds) as
  append-only rows in the owning service.
- File uploads: presigned PUT to S3 with content-type and size limits; KYC documents go to a private
  bucket and are only readable by admins through short-lived presigned GETs.

## 8. Git and CI

- Branch per task cut from `dev`, conventional commits, PR per task or small group of tasks.
- Flow: feature branch → `dev` (squash) → `stage` (merge commit) → `main` (merge commit, production).
  No direct pushes to the three long-lived branches. Details, required checks and the branch rules
  are in [`branching-and-cicd.md`](branching-and-cicd.md).
- CI (`.github/workflows/`) runs format, `nx affected -t lint typecheck test build`, all migrations
  against an empty PostGIS database, a secret scan and a dependency audit on every pull request.
  Phase 0 adds e2e, image builds and scanning, and deploys (`stage` → staging, `main` → production).
