# African Market UAE

Location-first marketplace helping Africans in the UAE find African shops, products and services near
them, contact sellers on WhatsApp, by phone, email or in-app chat, and order online from shops that
enable checkout.

- **Plan:** [docs/PLAN.md](docs/PLAN.md) · **Decisions:** [docs/DECISIONS.md](docs/DECISIONS.md)
- **Build instructions for Claude Code:** [CLAUDE.md](CLAUDE.md) and [docs/directives](docs/directives/README.md)

## Stack

Nx + pnpm monorepo · NestJS 11 microservices (TCP + RabbitMQ events, transactional outbox) ·
PostgreSQL 16 + PostGIS with TypeORM 0.3 (schema per service) · Next.js 15 App Router with next-intl
(English, Arabic RTL, French) and Tailwind v4 · Stripe Connect (direct charges) from Phase 3 ·
AWS me-central-1.

## Quick start

Requirements: Node 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up            # Postgres/PostGIS, Redis, RabbitMQ, MinIO, Mailpit
pnpm build
pnpm migration:run
pnpm dev                 # everything in watch mode
```

Then open:

| URL                                          | What                                         |
| -------------------------------------------- | -------------------------------------------- |
| http://localhost:3000/en and /ar             | Customer web app (PWA)                       |
| http://localhost:3001/en                     | Seller dashboard                             |
| http://localhost:3002/en                     | Admin console                                |
| http://localhost:4000/docs                   | Gateway Swagger UI                           |
| http://localhost:4000/api/v1/health/services | Health of every service in the current phase |
| http://localhost:15672                       | RabbitMQ UI (am / am)                        |
| http://localhost:8025                        | Mailpit (emails, OTPs)                       |
| http://localhost:9001                        | MinIO console (am-minio / am-minio-secret)   |

## Layout

```
apps/   web seller admin (Next.js) · gateway (BFF) · identity shops catalog discovery media
        messaging notifications orders payments (NestJS services)
libs/   contracts core database auth geo i18n ui api-client
docs/   PLAN.md DECISIONS.md directives/ architecture/
infra/  docker/ terraform/
```

## Status

Scaffold only (2026-10-09): every project builds, lints, type-checks and tests; each service boots,
connects to its own schema and answers health checks through the gateway; the event bus is wired.
Feature work starts at `docs/directives/00-foundations.md`.
