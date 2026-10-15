# syntax=docker/dockerfile:1.7
#
# One image per NestJS app: the gateway and every service. Build from the repository root:
#
#   docker build -f infra/docker/service.Dockerfile --build-arg APP=identity -t am/identity .
#
# The image runs `node dist/main.js`. Run migrations with the same image:
#
#   docker run --rm -e DATABASE_URL=... am/identity migrate

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NX_DAEMON=false \
    NX_NO_CLOUD=true \
    NX_SKIP_NX_CACHE=true
RUN corepack enable
WORKDIR /repo

# Dependencies: only the lockfile decides what is downloaded, so this layer is shared by every
# app and survives source changes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
ARG APP
RUN test -n "$APP" || (echo "Build with --build-arg APP=<gateway|identity|shops|...>" && exit 1)
# Builds the libs the app depends on, then the app.
RUN pnpm nx run "@am/${APP}:build" --output-style=static
# Production dependencies only, with the workspace libs copied in as packages (their dist).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter "@am/${APP}" deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
    APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/${APP}/dist ./dist
COPY --chown=node:node infra/docker/healthcheck.cjs infra/docker/service-entrypoint.sh ./
# AWS's certificate authorities for RDS, so DATABASE_URL can verify the server
# (sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem). Unused locally.
ADD --chown=node:node --chmod=444 \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "healthcheck.cjs"]
ENTRYPOINT ["sh", "service-entrypoint.sh"]
CMD ["start"]
