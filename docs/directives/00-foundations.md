# Phase 0: Foundations

**Outcome:** a customer can sign up and sign in by phone OTP or email and password, in English and
Arabic, on a staging environment in AWS me-central-1, deployed by CI. Shared design system, PWA shell,
testing infrastructure and the event bus are proven.

**Gate to exit:** sign-up works in English and Arabic on staging.

**Already in the scaffold (verified 2026-10-09):** pnpm + Nx workspace, all libs, gateway with guards,
Swagger and `/api/v1/health/services`, nine services booting as TCP + HTTP health apps, an initial
migration per service (schema, outbox, processed_event), three Next.js apps with next-intl (en/ar/fr)
and RTL, Tailwind v4 theme, a basic PWA manifest and service worker, docker compose, CI for lint,
typecheck, test and build. The outbox → RabbitMQ → idempotent consumer path was checked by hand
(a rolled-back event is never published, a committed one is handled exactly once, a duplicate
delivery is ignored); F0-10 turns that into automated tests.

---

- [x] **F0-01 Verify the scaffold locally**
      `pnpm install`, `pnpm infra:up`, `cp .env.example .env`, `pnpm build`, `pnpm migration:run`,
      `pnpm dev`. Confirm `GET http://localhost:4000/api/v1/health/services` reports identity `ok` with
      postgres and rabbitmq `up`, and web/seller/admin render at `/en` and `/ar` (Arabic is right-to-left).
      Fix anything that does not work on a fresh clone and note it here.

  > Note: verified 2026-10-10 on Windows 11 with Node 24 (the pinned major is 22; nothing failed
  > because of it). Fixed for a fresh clone: (1) `minio/minio` no longer exists on Docker Hub, so
  > compose now uses `cgr.dev/chainguard/minio`; (2) MinIO rejects a root user shorter than 3
  > characters, so `am` became `am-minio` (compose, `.env.example`, root README); (3) Postgres and
  > Redis host ports are overridable with `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` for machines where
  > 5432 / 6379 are taken; (4) `NODE_ENV` removed from `.env.example`, because Nx loads `.env` for
  > every task and it forced a non-production `NODE_ENV` onto `next build`.
  > Note: machine-specific, not fixed in the repo: on Windows, `pnpm install` fails with `EPERM`
  > renames while a VS Code window is open on the repo (its extension host holds every `node_modules`
  > folder open), so install from a plain terminal with that window closed. `@swc/core` (pulled in by
  > next-intl) refuses its default cache when other local accounts can write to the user profile; set
  > `SWC_NATIVE_BINDING_CACHE` in `.env` to a folder only the current user can write to.
  > Note: the gateway logs one harmless `Unsupported route path: "/api/*"` warning at boot; it comes
  > from a dependency, not from our routes, and Nest converts it automatically.

- [x] **F0-02 Identity data model** (depends on F0-01)
      Entities in `apps/identity`: `user` (phone E.164 unique nullable, email citext unique nullable,
      name, preferred_language, avatar_media_id, roles text[] default `{customer}`, status
      active/suspended/deleted, phone_verified_at, email_verified_at, marketing_consent_at,
      terms_accepted_at), `credential` (user_id, type password/google/apple, secret_hash or
      provider_subject, unique (type, provider_subject)), `otp_challenge` (target, channel sms/whatsapp/email,
      purpose signup/login/verify, code_hash, expires_at, attempts, consumed_at), `session` (user_id,
      family_id, refresh_token_hash, user_agent, ip, expires_at, revoked_at, replaced_by),
      `shop_member` (user_id, shop_id, role owner/manager/staff, branch_ids uuid[]), `address`
      (user_id, label, emirate, area, building, flat, makani, location geography Point, notes).
      Generate one migration. Partial unique indexes ignore soft-deleted rows.

  > Note: enumerated columns (status, roles, credential type, OTP channel and purpose, shop role,
  > emirate, language) are `text` with CHECK constraints, not Postgres enum types, so adding a value
  > later is a one-line migration. F0-04 will need to add a `reset` OTP purpose that way.
  > Note: beyond the unique indexes the directive names, a user can hold one live credential per
  > type, one live membership per shop, and refresh token hashes are unique. `credential` enforces
  > "hash for password, subject for social" with a CHECK.
  > Note: the integration test (`apps/identity/test/data-model.spec.ts`) runs the real migrations
  > in a throwaway database on the Postgres in `DATABASE_URL`, so `pnpm test` now needs
  > `pnpm infra:up` locally and the CI verify job has a PostGIS service. F0-11 swaps this for the
  > shared Testcontainers helper. It also fails if the entities and migrations ever drift apart.

- [x] **F0-03 OTP sign-up and sign-in by phone** (depends on F0-02)
      Patterns `IdentityPatterns.requestOtp` / `verifyOtp`. Normalise phones with `libphonenumber-js`
      (default region AE; accept international numbers too, since many users keep home-country numbers
      for WhatsApp). 6-digit code, argon2 or HMAC-SHA256 hash, 5-minute expiry, 5 attempts, resend
      cooldown 30 s, limits per phone (5/hour) and per IP (20/hour) in Redis. `SmsProvider` interface
      with `ConsoleSmsProvider` (logs to stdout, dev/test) and a stub for a UAE-licensed aggregator /
      Twilio with a registered sender ID. Verifying a new phone creates the user and publishes
      `user.registered` through the outbox. Never log the code.

  > Note: after the owner's decision P-09, WhatsApp is the default channel (`sms` only when the
  > caller asks) and the resend wait doubles with each code sent in the hour: 30 s, 1 min,
  > 2 min, 4 min, capped at 15 min. `requestOtp` returns the wait as `resendAfterSeconds`.
  > Note: codes are hashed with HMAC-SHA256 keyed by `OTP_HMAC_SECRET` and bound to the challenge
  > id. The service refuses to start in staging or production with the development secret or with
  > the console SMS provider.
  > Note: creating an account requires `termsAccepted: true` on `verifyOtp` (UAE PDPL consent); the
  > check happens before the code is consumed, so the client can retry. `requestOtp` answers the
  > same way whether or not the phone is registered.
  > Note: the Twilio / UAE aggregator sender is a stub that returns `SMS_PROVIDER_NOT_CONFIGURED`
  > until a sender ID is registered (a non-engineering task listed at the end of this file).
  > Note: `DatabaseModule` is now global so feature modules can inject `OutboxService`; a new
  > `app-module.spec.ts` builds the real module graph so wiring mistakes fail in CI. The CI verify
  > job gained a Redis service for the rate-limit tests. The HTTP routes are F0-06.

- [ ] **F0-04 Email and password** (depends on F0-02)
      Register with email + password (argon2id, min 10 chars, breached-password check optional),
      email verification by OTP sent through an `EmailProvider` (SMTP adapter pointing at Mailpit
      locally; SES adapter for production). Password reset by email OTP. Login with email + password.

- [ ] **F0-05 Sessions and tokens** (depends on F0-03)
      Access token: HS256 JWT with `AccessTokenClaims` from `@am/auth` (sub, roles, shops memberships,
      locale), 15 minutes, secret `JWT_ACCESS_SECRET` shared with the gateway. Refresh token: 32 random
      bytes, stored hashed in `session`, 30 days, rotated on every refresh; reuse of a rotated token
      revokes the whole family. Patterns `refreshSession`, `logout`, `getMe`, `updateMe`. Memberships in
      the token are refreshed on each refresh (and after `membership.changed`).

- [ ] **F0-06 Gateway auth module** (depends on F0-05)
      `apps/gateway/src/auth`: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/register`,
      `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `PATCH /me`. Set
      `am_at` (access, 15 min) and `am_rt` (refresh, path `/api/v1/auth`, 30 days) as httpOnly, Secure
      in non-dev, SameSite=Lax cookies; also return the access token in the body for future native apps.
      Named throttles on OTP and login routes. DTOs with class-validator and Swagger decorators.
      Regenerate `@am/api-client`. Integration test of the full OTP flow through the gateway.

- [x] **F0-07 Design system** (no dependency)
      Replace placeholder brand tokens in `libs/ui/theme.css` (ask the human for brand colours and logo;
      until then keep the placeholders). Load Inter and Noto Sans Arabic with `next/font` in all three
      apps and switch font by direction. Components in `libs/ui`: Button (exists), Input, Select,
      PhoneInput (country picker defaulting to +971), OtpInput, Card, Badge (verified, sponsored, open now),
      Sheet/Modal, Tabs, Toast, EmptyState, Skeleton. All RTL-safe with logical properties. A simple
      `/[locale]/dev/ui` page in `apps/web` (not linked, `noindex`) showing every component in en and ar.

  > Note: built from the owner's Claude Design system instead of placeholders (T-17). Fonts are
  > Plus Jakarta Sans and IBM Plex Sans Arabic, as the design specifies, not Inter and Noto.
  > Note: ported now: Logo, Icon, Button, LinkButton, IconButton, Input, Select, PhoneInput,
  > OtpInput, Checkbox, Radio, Toggle, Tabs, Chip, Badge, OriginBadge, Price, Card, Skeleton,
  > Stepper, Toast, EmptyState, BottomSheet, Modal, LanguageSwitcher. The design's shop, product,
  > map, chat, table and chart components are styled already and get their React ports in the
  > phase that first uses them.
  > Note: unlike the design bundle, components take every label as a prop (no English defaults),
  > PhoneInput and OtpInput can be controlled, and dialogs trap focus and close on Escape.
  > Note: the country picker sheet behind PhoneInput, and flag images in place of emoji flags
  > (which show as letters on Windows), are left for F0-08 and Phase 1.

- [ ] **F0-08 Auth screens in web and seller** (depends on F0-06, F0-07)
      Sign up / sign in with phone OTP (primary) and email (secondary), consent checkboxes (terms and
      privacy, optional marketing) recorded on the user, profile completion (name, preferred language).
      Seller app requires sign-in and grants the `seller` role on first shop creation (Phase 1).
      Language preference syncs with the URL locale. Every string in en/ar/fr.

- [ ] **F0-09 PWA shell** (depends on F0-07)
      Replace `apps/web/public/sw.js` with a Serwist build (`@serwist/next`): precache the app shell,
      network-first for pages, stale-while-revalidate for images, offline fallback page in en/ar.
      PNG icons 192/512 + maskable, Apple touch icon, splash colours. Lighthouse PWA installability passes.

- [ ] **F0-10 Event bus hardening** (depends on F0-01)
      Integration tests (Testcontainers: Postgres+PostGIS and RabbitMQ) proving: an event enqueued in a
      transaction that rolls back is never published; an event enqueued while RabbitMQ is down is
      published after it comes back; a duplicate delivery is handled once by `IdempotentConsumer`.
      Add delayed retry before dead-lettering (retry queue with TTL, 3 attempts with backoff, then DLQ)
      and a periodic cleanup of published outbox rows older than 7 days. Add a `libs/contracts` contract
      test that every `EventName` has a documented payload.

- [ ] **F0-11 Testing infrastructure** (no dependency)
      Testcontainers helper in `libs/database/src/testing` (start PostGIS, run a service's migrations,
      return a DataSource). Playwright project at `e2e/` with a fixture that signs in through the API,
      running against `pnpm dev` locally and staging in CI. First e2e: sign up by phone OTP in `/en` and
      `/ar` (read the OTP from the console SMS provider via a test-only endpoint enabled only when
      `NODE_ENV=test`).

- [ ] **F0-12 Containers** (depends on F0-01)
      One multi-stage Dockerfile for Nest services (build arg `APP`) and one for Next apps (standalone
      output), both using `pnpm deploy` or Nx-pruned lockfiles, non-root user, healthcheck on `/health`.
      `docker compose --profile apps up` runs the whole stack in containers.

- [ ] **F0-13 Terraform for staging** (depends on F0-12)
      `infra/terraform` with modules for: VPC (3 AZs, private subnets), ECR, ECS Fargate cluster and one
      service per app (internal Cloud Map names for TCP between gateway and services), ALB for gateway and
      the Next apps, RDS PostgreSQL 16 Multi-AZ with PostGIS, ElastiCache Redis, Amazon MQ (RabbitMQ),
      S3 buckets (public media behind CloudFront, private KYC), Secrets Manager, SES identity, CloudWatch
      log groups. Region `me-central-1`. Remote state in S3 with locking. `staging` environment only; a
      `production` environment reuses the modules later. Do not apply; produce a plan and a README with
      the bootstrap steps. Applying needs human-provided AWS credentials.

- [ ] **F0-14 CI/CD** (depends on F0-11, F0-12)
      Extend `.github/workflows/ci.yml`: Nx affected with remote cache optional, Playwright e2e against the
      compose stack, container image builds for affected apps, push to ECR and deploy to staging on
      `stage` and to production on `main` behind a manual approval (OIDC role, no long-lived AWS
      keys), run migrations as a one-off ECS task before the new task definitions roll out. Container
      scanning (Trivy) as non-blocking at first. Add the `staging` required deployment to the `main`
      ruleset. The branch flow, required checks, secret scan and dependency audit already exist
      (T-16, `docs/architecture/branching-and-cicd.md`).

- [ ] **F0-15 Observability** (depends on F0-01)
      OpenTelemetry SDK in `libs/core` (HTTP, Nest, pg, amqplib instrumentation), trace id propagated
      gateway → TCP → events (`correlationId`), OTLP exporter configured by env. Sentry in the gateway,
      services and the three Next apps (DSN by env, disabled when empty).

- [ ] **F0-16 Privacy basics (UAE PDPL)** (depends on F0-08)
      Privacy policy and terms pages in en/ar (placeholder legal text, clearly marked for legal review),
      cookie/consent notice, `GET /me/export` (JSON of the user's identity data) and `DELETE /me`
      (soft-delete + anonymise PII after 30 days via a scheduled job; publishes `user.deleted`, add it to
      contracts). Record consent versions on the user.

- [ ] **F0-17 Staging sign-off** (depends on all above)
      Deploy to staging. Walk sign-up by phone and by email in English and Arabic on a phone browser,
      install the PWA. Record the result here. **This closes the Phase 0 gate.**

**Non-engineering tasks to start now (owner: Henson):** company trade licence with an e-commerce
activity, corporate bank account, Stripe account and a written request to Stripe about Connect for a
UAE platform with UAE connected accounts using direct charges and application fees, a WhatsApp
Business account with an approved authentication (one-time code) template (P-09), SMS sender ID
registration with a UAE-licensed provider only if the SMS fallback is kept, Google Maps Platform
billing account, Google and Facebook (Meta) OAuth apps for social sign-in (P-10).
