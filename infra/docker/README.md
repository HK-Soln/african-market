# Containers

Two Dockerfiles build every app. Both build from the repository root, because an app needs the
workspace libs it depends on.

| File                 | Builds                                   | Build argument                       |
| -------------------- | ---------------------------------------- | ------------------------------------ |
| `service.Dockerfile` | the gateway and every NestJS service     | `APP=gateway`, `APP=identity`, ...   |
| `next.Dockerfile`    | the Next.js apps, from standalone output | `APP=web`, `APP=seller`, `APP=admin` |

```bash
docker build -f infra/docker/service.Dockerfile --build-arg APP=identity -t african-market/identity .
docker build -f infra/docker/next.Dockerfile --build-arg APP=web \
  --build-arg NEXT_PUBLIC_GATEWAY_URL=https://api.example.ae -t african-market/web .
```

## How they are built

1. `pnpm fetch` downloads every package in the lockfile. That layer depends only on the lockfile,
   so it is shared by all thirteen images and reused until a dependency changes.
2. `pnpm install --offline`, then `nx run @am/<app>:build`, which builds the libs the app needs
   first.
3. NestJS: `pnpm deploy --prod` gathers the production dependencies, with the workspace libs copied
   in as packages (their `dist`). Next.js: the standalone output, which already contains only the
   files the server uses, plus `.next/static` and `public`.
4. The final image is `node:22-alpine` with only that, running as the `node` user (not root).

## Running them

- **NestJS images** start the app by default. `migrate` applies the service's pending migrations
  and exits; that is the one-off task a deploy runs before new versions roll out (F0-14).
  `migrate-and-start` does both, which is what docker compose uses. See `service-entrypoint.sh`.
- **Next.js images** listen on port 3000 (`PORT`). `NEXT_PUBLIC_*` values are compiled into the
  browser code, so they are build arguments and each environment gets its own build.
  `GATEWAY_URL`, used for calls made on the server, is read at run time.
- **Health:** every image has a `HEALTHCHECK` (`healthcheck.cjs`): `/health` on a service's HTTP
  port, `/api/v1/health` on the gateway, `/health` on a Next.js app.
- NestJS images carry AWS's RDS certificate bundle at `/app/certs/rds-global-bundle.pem`, so
  `DATABASE_URL` in AWS can verify the database (`sslmode=verify-full`).
- `NODE_ENV` is `production` in the image. Identity refuses to start in production with the
  development secrets or the console SMS provider, so set real values, or `NODE_ENV=development`
  as docker compose does.

## The whole stack locally

```bash
pnpm stack:up      # docker compose --profile apps up -d --build
pnpm stack:down
```

Same URLs as `pnpm dev`: web 3000, seller 3001, admin 3002, gateway 4000. Stop `pnpm dev` first;
the ports clash. Phone codes are printed by identity: `docker compose logs identity | grep sms`.
The first build takes several minutes; later builds reuse the dependency layer.

`postgres-init.sql` runs once, when the Postgres volume is created.
