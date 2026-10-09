# gateway (BFF)

The only HTTP API the frontends call: `http://localhost:4000/api/v1/...`, Swagger UI at `/docs`.

- Global guards: throttling, `JwtAuthGuard` (mark open routes with `@Public()`), `RolesGuard` (`@Roles`, `@ShopRoles`).
- Controllers validate input with class-validator DTOs, then call services through `ServiceCaller.call(service, pattern, data)`.
  Never call a service's database or HTTP port directly.
- After changing routes: `pnpm nx run @am/gateway:openapi && pnpm nx run @am/api-client:generate`.
- Chat (Phase 2) adds a Socket.IO namespace that proxies to `messaging`; see docs/directives/02-engagement.md.
