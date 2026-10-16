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

- [x] **F0-04 Email and password** (depends on F0-02)
      Register with email + password (argon2id, min 10 chars, breached-password check optional),
      email verification by OTP sent through an `EmailProvider` (SMTP adapter pointing at Mailpit
      locally; SES adapter for production). Password reset by email OTP. Login with email + password.

  > Note: an email account is created unverified and cannot sign in until its code is confirmed;
  > `user.registered` is published at confirmation. Registering needs `termsAccepted: true`.
  > Note: `verifyEmail` takes the registration password as well as the code. Without it, someone
  > who re-registered a pending address could have their own password confirmed by the inbox
  > owner. There is a test for exactly that.
  > Note: nothing reveals whether an address is registered: register, resend and reset-request
  > always answer the same (an existing owner gets a "you already have an account" email), and
  > a wrong password and an unknown email give the same 401 in the same time.
  > Note: sign-in locks an email for 15 minutes after 5 wrong passwords (30 per IP). Passwords are
  > 10 to 128 characters; the optional breached-password check is not built. A password reset
  > revokes the user's sessions.
  > Note: the SMTP adapter is real and tested against Mailpit, and reaches SES through its SMTP
  > endpoint. The SES API adapter is a stub until the AWS account exists (F0-13).
  > Note: a hand-written migration adds the `reset` OTP purpose (TypeORM does not detect a changed
  > CHECK). Verification and reset codes have separate resend timers. The HTTP routes are F0-06.

- [x] **F0-05 Sessions and tokens** (depends on F0-03)
      Access token: HS256 JWT with `AccessTokenClaims` from `@am/auth` (sub, roles, shops memberships,
      locale), 15 minutes, secret `JWT_ACCESS_SECRET` shared with the gateway. Refresh token: 32 random
      bytes, stored hashed in `session`, 30 days, rotated on every refresh; reuse of a rotated token
      revokes the whole family. Patterns `refreshSession`, `logout`, `getMe`, `updateMe`. Memberships in
      the token are refreshed on each refresh (and after `membership.changed`).

  > Note: every sign-in (`verifyOtp`, `verifyEmail`, `loginWithPassword`, `resetPassword`) now
  > returns `session` with both tokens; the gateway turns them into cookies in F0-06.
  > Note: a replaced refresh token is accepted once more for 10 seconds, so two tabs refreshing
  > at the same moment do not sign the person out everywhere. After that, reuse revokes the
  > family. The 30 days restart at each refresh. Signing out revokes that device's family only;
  > a password reset revokes every session and starts a fresh one.
  > Note: the access token is rebuilt from the database at each refresh, so a new role or shop
  > membership reaches the browser within 15 minutes. Nothing writes `shop_member` yet: the
  > `shop.created` consumer and the `membership.changed` publisher arrive with shops (Phase 1).
  > Note: `updateMe` changes name, language, home emirate and marketing consent. `home_emirate`
  > is a new column, added for the profile screen in the design. Changing phone or email is not
  > here; each needs its own verified flow.
  > Note: identity now reads `JWT_ACCESS_SECRET` and refuses to start in staging or production
  > with the development value. SMTP sends give up after 10 to 15 seconds instead of minutes.

- [x] **F0-06 Gateway auth module** (depends on F0-05)
      `apps/gateway/src/auth`: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/register`,
      `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `PATCH /me`. Set
      `am_at` (access, 15 min) and `am_rt` (refresh, path `/api/v1/auth`, 30 days) as httpOnly, Secure
      in non-dev, SameSite=Lax cookies; also return the access token in the body for future native apps.
      Named throttles on OTP and login routes. DTOs with class-validator and Swagger decorators.
      Regenerate `@am/api-client`. Integration test of the full OTP flow through the gateway.

  > Note: the email flow needs four more routes than the list above, so they are here too:
  > `POST /auth/email/resend`, `/auth/email/verify`, `/auth/password/forgot` and
  > `/auth/password/reset`.
  > Note: the body of a sign-in carries the access token but never the refresh token, which only
  > travels in its cookie. A native app will need its own way to hold one (Phase 4).
  > Note: every error now leaves the gateway as `{ statusCode, code, message, details? }`, including
  > validation (`VALIDATION_FAILED`), throttling (`RATE_LIMITED`) and unknown routes.
  > Note: the per-route throttles (5 a minute to send a code, 10 to check one or sign in) are per
  > IP and held in memory by each gateway instance. They blunt bursts; the limits that matter are
  > identity's, in Redis. `TRUST_PROXY_HOPS` must be set to 1 behind the load balancer (F0-13) or
  > every caller will share the balancer's IP. `COOKIE_DOMAIN` is for the deployed subdomains.
  > Note: the integration test runs HTTP -> gateway -> TCP -> a stand-in identity service, because
  > an app may not import another app. The real pair was checked by hand; an automated test across
  > both arrives with F0-11.
  > Note: request logs now redact the `Authorization`, `Cookie` and `Set-Cookie` headers in every
  > service. Without that, the gateway's logs held live tokens.

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

- [x] **F0-08 Auth screens in web and seller** (depends on F0-06, F0-07)
      Sign up / sign in with phone OTP (primary) and email (secondary), consent checkboxes (terms and
      privacy, optional marketing) recorded on the user, profile completion (name, preferred language).
      Seller app requires sign-in and grants the `seller` role on first shop creation (Phase 1).
      Language preference syncs with the URL locale. Every string in en/ar/fr.

  > Note: built from the SignIn, Otp and Profile screens of the Customer app design. The flow is
  > one shared component, `AuthFlow` in `@am/ui`; each app gives it its words, its API calls and
  > its navigation, at `/<locale>/sign-in`.
  > Note: a new phone account is created on the profile screen, where the terms box is, not when
  > the code is checked. The checked code is held in memory until then; if it runs out (5
  > minutes) the person is sent back for a new one.
  > Note: left out on purpose: passkey, Google and Apple buttons (Phase 1 does Google and
  > Facebook, decision P-10) and "Send by SMS instead" (SMS may be dropped, decision P-09).
  > The email screens (sign in, register, forgot and reset password) have no design yet and
  > follow the same system.
  > Note: the Terms and Privacy policy links lead to placeholder pages in `apps/web`. The real
  > text is a non-engineering task and must be in place before launch (F0-16).
  > Note: signing in moves the person to their account's language; changing language while
  > signed in saves it to the account. The session is checked in the browser (`SessionProvider`):
  > the refresh cookie is only sent to the gateway, so Next's server cannot renew a session.
  > The seller app's gate is therefore in the browser too; the gateway protects the data.
  > Note: the header account control is an icon on phones, and the logo is the mark alone, because
  > the wordmark, a sign-in button and the language switcher do not fit in 390px.
  > Note: fixed in passing: text and phone fields overflowed the screen in Arabic (the fix is in
  > `@am/ui`, and belongs in the design system's stylesheet too).

- [x] **F0-09 PWA shell** (depends on F0-07)
      Replace `apps/web/public/sw.js` with a Serwist build (`@serwist/next`): precache the app shell,
      network-first for pages, stale-while-revalidate for images, offline fallback page in en/ar.
      PNG icons 192/512 + maskable, Apple touch icon, splash colours. Lighthouse PWA installability passes.

  > Note: `apps/web/src/sw.ts` is built into `public/sw.js` by `@serwist/next` in production
  > builds only; the built file is git-ignored. It precaches Next's scripts, styles and fonts and
  > the three offline pages, serves pages network-first (5 s, then the last copy seen) and images
  > stale-while-revalidate. Calls to the gateway are never cached.
  > Note: the offline page exists in French as well as English and Arabic, and reloads by itself
  > when the connection returns. The recently viewed shops in the Offline design need Phase 1.
  > Note: the PNG icons are generated from the SVGs by `node tools/generate-pwa-icons.mjs` and
  > committed. The "Add to your home screen" card from the Install design is included; Safari on
  > iOS has no install event, so people there use the Share menu.
  > Note: Lighthouse dropped its PWA category in version 12, so installability was checked with
  > Chrome's own test instead (no errors), along with offline behaviour with the server stopped.
  > Note: cached pages are safe to keep because page HTML carries no personal data today (the
  > session is loaded in the browser). Revisit the `pages` rule if a page is ever rendered on the
  > server for a signed-in person.

- [x] **F0-10 Event bus hardening** (depends on F0-01)
      Integration tests (Testcontainers: Postgres+PostGIS and RabbitMQ) proving: an event enqueued in a
      transaction that rolls back is never published; an event enqueued while RabbitMQ is down is
      published after it comes back; a duplicate delivery is handled once by `IdempotentConsumer`.
      Add delayed retry before dead-lettering (retry queue with TTL, 3 attempts with backoff, then DLQ)
      and a periodic cleanup of published outbox rows older than 7 days. Add a `libs/contracts` contract
      test that every `EventName` has a documented payload.

  > Note: a failed event waits in `<service>.events.retry.<ms>` and comes back after 5 s, 30 s and
  > 2 min (`EVENT_RETRY_DELAYS_MS`), then goes to `<service>.events.dlq` with the error. Only the
  > service that failed gets it again. How it all works is in `docs/architecture/events.md`.
  > Note: the tests run against the RabbitMQ and Postgres from `pnpm infra:up` (service containers
  > in CI), not Testcontainers: the helper for that is F0-11. "RabbitMQ is down" is a small proxy
  > in the test that cuts the connection and restores it.
  > Note: fixed on the way. Every service's dead-letter queue received every other service's
  > rejected messages; each now gets only its own. A publish failing part-way through a batch
  > rolled the whole batch back and re-sent what had already gone out. A publish made as the
  > connection dropped could hold the outbox transaction open until the broker returned.
  > Note: `EVENT_CATALOG` in `libs/contracts` documents every event and payload field; the compiler
  > requires an entry for each, and a test keeps the list in `events.md` in step with it.
  > Note: only published outbox rows are cleaned up (hourly, older than 7 days). `processed_event`
  > rows are kept: deleting one would let a late duplicate through.

- [x] **F0-11 Testing infrastructure** (no dependency)
      Testcontainers helper in `libs/database/src/testing` (start PostGIS, run a service's migrations,
      return a DataSource). Playwright project at `e2e/` with a fixture that signs in through the API,
      running against `pnpm dev` locally and staging in CI. First e2e: sign up by phone OTP in `/en` and
      `/ar` (read the OTP from the console SMS provider via a test-only endpoint enabled only when
      `NODE_ENV=test`).

  > Note: `createTestDatabase` (`@am/database/testing`) starts one PostGIS container per test run
  > through Jest's global setup, and gives each test file its own migrated database. Identity's
  > tests and the outbox tests use it. `TEST_DATABASE_URL` skips the container and uses a server
  > that is already running. RabbitMQ, Redis and Mailpit still come from `pnpm infra:up` or CI
  > service containers.
  > Note: the e2e stack runs on its own ports with `NODE_ENV=test`, so it runs beside `pnpm dev`
  > rather than against it: `pnpm dev` runs as development, where the code route must not exist.
  > How to run and write tests is in `e2e/README.md`.
  > Note: the route that returns a code is registered only under `NODE_ENV=test`, in the gateway
  > and in identity, and identity refuses `SMS_PROVIDER=memory` under any other `NODE_ENV`. So the
  > tests cannot sign up on staging as written. F0-14 has to decide how they will (for example a
  > fixed code for an allow-listed test number); that is a security decision for the owner.
  > Note: CI runs the e2e tests on the runner in a new job, `E2E (Playwright)`, which is not a
  > required check yet. Three tests: sign up in `/en`, in `/ar`, and sign out.
  > Note: the backend moved to zod 4 (decision T-18). Installing `@serwist/next` had left two zod
  > versions, and locally the web app picked the wrong one and would not start.

- [x] **F0-12 Containers** (depends on F0-01)
      One multi-stage Dockerfile for Nest services (build arg `APP`) and one for Next apps (standalone
      output), both using `pnpm deploy` or Nx-pruned lockfiles, non-root user, healthcheck on `/health`.
      `docker compose --profile apps up` runs the whole stack in containers.

  > Note: `infra/docker/service.Dockerfile` and `next.Dockerfile`, on `node:22-alpine`, run as the
  > `node` user. `pnpm fetch` from the lockfile alone gives one dependency layer shared by all
  > thirteen images. NestJS images use `pnpm deploy --prod --legacy` (the non-legacy deploy needs
  > `inject-workspace-packages`, which would change how the libs are linked in development).
  > Note: one image entrypoint for migrations: `migrate` (the one-off task F0-14 will run before a
  > rollout), `start` (default) and `migrate-and-start` (docker compose only).
  > Note: the Next apps gained `GET /health` outside the locale middleware, and set
  > `outputFileTracingRoot` to the repository root so standalone output includes the hoisted
  > packages. `NEXT_PUBLIC_*` are build arguments, so each environment gets its own web images.
  > Note: successful `GET /health` requests are no longer logged by the backends; container and load
  > balancer probes would otherwise fill the logs every few seconds.
  > Note: the compose stack runs with `NODE_ENV=development` (console SMS, Mailpit, dev secrets) on
  > the same ports as `pnpm dev`; `pnpm stack:up` / `pnpm stack:down`.

- [x] **F0-13 Terraform for staging** (depends on F0-12)
      `infra/terraform` with modules for: VPC (3 AZs, private subnets), ECR, ECS Fargate cluster and one
      service per app (internal Cloud Map names for TCP between gateway and services), ALB for gateway and
      the Next apps, RDS PostgreSQL 16 Multi-AZ with PostGIS, ElastiCache Redis, Amazon MQ (RabbitMQ),
      S3 buckets (public media behind CloudFront, private KYC), Secrets Manager, SES identity, CloudWatch
      log groups. Region `me-central-1`. Remote state in S3 with locking. `staging` environment only; a
      `production` environment reuses the modules later. Do not apply; produce a plan and a README with
      the bootstrap steps. Applying needs human-provided AWS credentials.

  > Note: no AWS credentials yet, so there is no plan. The owner chose to continue without them
  > (2026-10-16): every stack passes `terraform validate` with pinned providers, a new non-required
  > CI job keeps it that way, and the README's bootstrap steps start with the plan. Producing it is
  > the first thing to do once there is an account.
  > Note: the wiring is one `platform` module; `envs/staging` only sets sizes, so production is a
  > second small folder (decision T-19). Only apps of `current_phase` or earlier run; at Phase 0
  > that is gateway, identity, web, seller and admin.
  > Note: hosts are `<domain>`, `seller.`, `admin.` and `api.<domain>` on one load balancer, so the
  > auth cookies share `COOKIE_DOMAIN=.<domain>`. The domain is a variable; none is chosen yet.
  > Note: Postgres connections verify the server certificate (`sslmode=verify-full`); the service
  > images now carry AWS's RDS certificate bundle. Redis and RabbitMQ use TLS too.
  > Note: identity sends email through SES's SMTP endpoint with an IAM access key scoped to the
  > domain, because its SES API provider is not built. Swap it for the task role when it is.
  > Note: the email provider is a setting (`email_provider`: `ses`, or `smtp` for any SMTP
  > provider such as Resend, with `SMTP_URL` set by hand). The owner may use Resend (2026-10-16);
  > not decided. Its data location must be checked against product rule 8 first.
  > Note: phone sign-up cannot work on staging until identity has a real WhatsApp provider; the
  > console provider is refused outside development. That blocks part of F0-17.

- [x] **F0-14 CI/CD** (depends on F0-11, F0-12)
      Extend `.github/workflows/ci.yml`: Nx affected with remote cache optional, Playwright e2e against the
      compose stack, container image builds for affected apps, push to ECR and deploy to staging on
      `stage` and to production on `main` behind a manual approval (OIDC role, no long-lived AWS
      keys), run migrations as a one-off ECS task before the new task definitions roll out. Container
      scanning (Trivy) as non-blocking at first. Add the `staging` required deployment to the `main`
      ruleset. The branch flow, required checks, secret scan and dependency audit already exist
      (T-16, `docs/architecture/branching-and-cicd.md`).

  > Note: owner decisions (2026-10-16): staging end-to-end tests sign in with **test numbers** (a
  > fixed code, never sent, refused in production); production deploys need one approval, by
  > Henson; `E2E (Playwright)` is now required on dev, stage and main; no Nx remote cache until CI
  > gets slow; Multi-AZ Postgres in production only; staging runs only 08:00-20:00 Dubai time,
  > Monday to Friday.
  > Note: the e2e job now runs against the real images (`docker-compose.e2e.yml`, built with
  > Buildx and the GitHub Actions cache), which also proves the images on every pull request.
  > Note: deploys (`deploy.yml`): images tagged with the commit -> new task definitions only
  > (`terraform apply -target`) -> migrations as one-off tasks (`infra/deploy/run-migrations.sh`)
  > -> full `terraform apply` -> wait until stable -> `@smoke` tests on staging. CI applies
  > Terraform, so infrastructure changes deploy the same way as code (decision T-20).
  > Note: AWS access is OIDC to a role per account (`bootstrap/`), trusted only by its GitHub
  > environment; it is an administrator because it applies Terraform. Deploys are skipped, not
  > failed, until the role exists. Nothing has run against AWS yet: no account.
  > Note: Trivy scans the affected images on every pull request (`Images (build · scan)`),
  > non-blocking, with findings in the Security tab. ECR also scans on push.
  > Note: `envs/production` exists (Multi-AZ, NAT and Redis replica per zone, RabbitMQ cluster,
  > deletion protection, no test numbers, always on); production images are rebuilt from `main`
  > rather than copied from staging, since the Next images differ per environment anyway.
  > Note: `main` now requires a successful `staging` deployment, so nothing merges into `main`
  > until staging exists. The rulesets and environments take effect when
  > `infra/github/apply-rulesets.sh` is run after this merges.

- [x] **F0-18 Countries as reference data** (depends on F0-08; added 2026-10-16, done before F0-15)
      Countries in identity's database with what the apps need (names in en/ar/fr, dial code, flag,
      whether new accounts may sign up by phone from there, whether it is offered as an origin, display
      order), editable by admins in the admin app. The phone field takes its countries from there, with
      a placeholder and formatting per country.

  > Note: owner decisions (2026-10-16): identity owns the table; phone sign-up stays limited to the
  > nine countries offered so far; admins edit them in the admin app; built now, before F0-15.
  > Note: the table is seeded with every country that has phone numbers (245; names from CLDR,
  > dial codes from libphonenumber-js), with only the nine enabled, so enabling another is one
  > switch rather than data entry. How numbers are written and validated is not stored: it comes
  > from libphonenumber-js, which follows numbering-plan changes.
  > Note: only **new** phone sign-ups are refused for a country that is not enabled
  > (`PHONE_COUNTRY_NOT_SUPPORTED`); someone already registered keeps signing in if their country
  > is switched off later. Email sign-up is not limited by country.
  > Note: routes: `GET /api/v1/countries` (public, cached 5 minutes), and `GET` / `PATCH
/api/v1/admin/countries[/:code]` (admins). The admin list returns all ~245 rows: reference data
  > that cannot grow large. Lists that can grow get filtering, sorting and cursor pagination
  > instead (owner's point, 2026-10-16; to be its own task).
  > Note: the first admin is made with `pnpm --filter @am/identity grant-role <phone|email> admin`
  > (in AWS: the identity image with that command); nothing in the apps hands out the role.
  > Note: flags are SVG images (country-flag-icons, copied into each app's `public/flags` at dev
  > and build), not emoji: Windows showed emoji flags as two letters.
  > Note: also fixed: web served `/icon.svg` with a 500, because the same file was in both
  > `public/` and `src/app/`.

- [x] **F0-19 List queries: filtering, sorting, cursor pagination** (added 2026-10-16, before F0-15)
      One query format for every list endpoint, checked against a per-endpoint spec, with keyset
      (cursor) pagination; shared code in contracts, gateway, core and database; the country lists
      use it.

  > Note: owner's point (2026-10-16): no endpoint may return a whole table that can grow (orders,
  > shops...), every list takes the same filter/sort/page format, and pagination is by cursor.
  > Decision T-21.
  > Note: Express 5 does not parse `filter[a][b]` into objects, so the parser reads the flat keys
  > itself (and nested objects too). That also gives the generated API client one typed parameter
  > per filter and operator.
  > Note: cursors are base64url JSON of the last row's sort values and id, bound to the sort they
  > were made with; a cursor from another sort is refused. `prevCursor` walks back exactly.
  > Mixed sort directions use the expanded `(a > x) OR (a = x AND b < y) ...` form.
  > Note: no totals by default: counting every row is what pagination avoids. The admin Countries
  > screen lost its "9 of 245" line and gained server-side search and "Load more".

- [x] **F0-15 Observability** (depends on F0-01)
      OpenTelemetry SDK in `libs/core` (HTTP, Nest, pg, amqplib instrumentation), trace id propagated
      gateway → TCP → events (`correlationId`), OTLP exporter configured by env. Sentry in the gateway,
      services and the three Next apps (DSN by env, disabled when empty).

  > Note: decision T-22. One trace runs from the gateway's HTTP request through the TCP call to the
  > service, its Postgres and Redis calls, and every consumer of the events it caused (seen working
  > locally with Jaeger: `docker compose --profile tracing up -d jaeger`). The trace id is the
  > request id, the events' `correlationId`, a field on every log line and the `x-request-id` header.
  > Note: no amqplib instrumentation: it would start each event's trace at the outbox relay, after
  > the request had finished. EventBus and OutboxService carry the trace themselves. Nest TCP has
  > no instrumentation either; ServiceCaller and RpcTraceInterceptor carry it in the payload.
  > Note: in AWS a collector runs beside each backend task and writes to X-Ray in me-central-1, so
  > traces stay in the UAE. Its config was run locally; the AWS side waits for the account.
  > Note: Sentry is built but off: it has no UAE region, so whether error reports may be stored in
  > the EU is the owner's call (pending). Reports carry no user fields, cookies, bodies or query
  > strings. Errors only: no Sentry tracing, no session replay. The Next apps skip
  > `withSentryConfig` for now, so their stack traces stay minified until source-map upload is
  > added (it needs a Sentry auth token).
  > Note: the keys are optional (empty means off) rather than required: observability does not
  > change what an app does, and each app logs at start what is on.

- [x] **F0-16 Privacy basics (UAE PDPL)** (depends on F0-08)
      Privacy policy and terms pages in en/ar (placeholder legal text, clearly marked for legal review),
      cookie/consent notice, `GET /me/export` (JSON of the user's identity data) and `DELETE /me`
      (soft-delete + anonymise PII after 30 days via a scheduled job; publishes `user.deleted`, add it to
      contracts). Record consent versions on the user.

  > Note: decision T-23. The legal texts are drafts written to match what the platform does, in
  > en and ar (fr shows the English until Phase 2), with a banner saying they await legal review;
  > company details, providers, retention periods for orders, the minimum age and the liability
  > clause are [bracketed] for the owner and a lawyer. They are versioned (`LEGAL_VERSIONS`), and
  > accepting the terms records both versions on the user.
  > Note: deleting needs a sign-in from the last 10 minutes (`auth_time` in the access token): a
  > stolen or left-open session cannot erase someone's account. The account closes at once
  > (signed out everywhere, phone and email free again); the 30 days before erasure leave time to
  > look into a mistaken or fraudulent deletion, and are not a way to undo it yourself.
  > Note: `user.deleted` carries `eraseBy`; services that keep personal data (shops, messaging,
  > orders, media for the avatar) must consume it from Phase 1. Orders kept for tax law will need
  > their own retention rule in Phase 3.
  > Note: also deleted: everyone's one-time codes after 7 days (they hold phone numbers and emails
  > and were kept forever).
  > Note: the cookie notice informs rather than asks: only necessary storage is used (sign-in
  > cookies, language, browser notes). It must become a real choice before any analytics or
  > advertising is added. The account page also lets people withdraw marketing consent.

- [ ] **F0-17 Staging sign-off** (depends on all above)
      Deploy to staging. Walk sign-up by phone and by email in English and Arabic on a phone browser,
      install the PWA. Record the result here. **This closes the Phase 0 gate.**

**Non-engineering tasks to start now (owner: Henson):** company trade licence with an e-commerce
activity, corporate bank account, Stripe account and a written request to Stripe about Connect for a
UAE platform with UAE connected accounts using direct charges and application fees, a WhatsApp
Business account with an approved authentication (one-time code) template (P-09), SMS sender ID
registration with a UAE-licensed provider only if the SMS fallback is kept, Google Maps Platform
billing account, Google and Facebook (Meta) OAuth apps for social sign-in (P-10).
