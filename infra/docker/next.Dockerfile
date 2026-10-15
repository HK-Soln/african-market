# syntax=docker/dockerfile:1.7
#
# One image per Next.js app (web, seller, admin), from Next's standalone output. Build from the
# repository root:
#
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=web \
#     --build-arg NEXT_PUBLIC_GATEWAY_URL=https://api.example.ae -t am/web .
#
# NEXT_PUBLIC_* values are compiled into the browser code, so they are build arguments and an
# image is built per environment. GATEWAY_URL (used on the server) is read at run time.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NX_DAEMON=false \
    NX_NO_CLOUD=true \
    NX_SKIP_NX_CACHE=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
ARG APP
RUN test -n "$APP" || (echo "Build with --build-arg APP=<web|seller|admin>" && exit 1)
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000
ARG NEXT_PUBLIC_WEB_URL=http://localhost:3000
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY=
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# Names this build, so a new deploy replaces the pages the service worker precached.
ARG BUILD_ID=
ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL} \
    NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL} \
    NEXT_PUBLIC_GOOGLE_MAPS_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_KEY} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    BUILD_ID=${BUILD_ID}
# Builds the libs the app depends on, then `next build` (standalone output).
RUN pnpm nx run "@am/${APP}:build" --output-style=static
# The standalone server does not include static assets; put them where it looks for them.
RUN cp -r "apps/${APP}/.next/static" "apps/${APP}/.next/standalone/apps/${APP}/.next/static" \
 && if [ -d "apps/${APP}/public" ]; then \
      cp -r "apps/${APP}/public" "apps/${APP}/.next/standalone/apps/${APP}/public"; \
    fi

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP=${APP} \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# The standalone folder mirrors the repository: node_modules at the top, the server under apps/.
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --chown=node:node infra/docker/healthcheck.cjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "healthcheck.cjs"]
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
