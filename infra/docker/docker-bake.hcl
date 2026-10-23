# Every image, in one place, for `docker buildx bake`. CI's pull-request build and the deploy use
# it; so can you:
#
#   REGISTRY=<account>.dkr.ecr.me-central-1.amazonaws.com/african-market TAG=<commit> \
#     BUILD_ID=<commit> NEXT_PUBLIC_GATEWAY_URL=https://api.staging.africanmarket.ae \
#     NEXT_PUBLIC_WEB_URL=https://staging.africanmarket.ae \
#     NEXT_PUBLIC_SELLER_URL=https://seller.staging.africanmarket.ae \
#     NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_SENTRY_ENVIRONMENT= \
#     NEXT_PUBLIC_GOOGLE_MAPS_KEY= NEXT_PUBLIC_GOOGLE_MAP_ID= \
#     docker buildx bake -f infra/docker/docker-bake.hcl --push        # or name some targets
#
# Run it from the repository root: the build context is the whole workspace.

# No defaults (decision T-45): every variable is set by whoever builds (CI, the deploy,
# infra/deploy/test-env.sh), empty for a feature that is off. A forgotten required one fails the
# build: an empty REGISTRY or TAG is not a valid image name, and `next build` names any missing
# NEXT_PUBLIC_* it needs (apps/*/src/lib/config.ts).
variable "REGISTRY" {}

variable "TAG" {}

# Compiled into the browser code of the Next apps.
variable "NEXT_PUBLIC_GATEWAY_URL" {}

variable "NEXT_PUBLIC_WEB_URL" {}

variable "NEXT_PUBLIC_SELLER_URL" {}

# Error reports from the Next apps (F0-15); empty means none. The environment names where they
# are filed and is required with a DSN.
variable "NEXT_PUBLIC_SENTRY_DSN" {}

variable "NEXT_PUBLIC_SENTRY_ENVIRONMENT" {}

# Google Maps in the customer site; empty means lists only. The map id is required with a key.
variable "NEXT_PUBLIC_GOOGLE_MAPS_KEY" {}

variable "NEXT_PUBLIC_GOOGLE_MAP_ID" {}

# Names the build (the commit), so a new deploy replaces the pages the service worker precached.
variable "BUILD_ID" {}

# The apps that run in the current phase. Later phases add theirs here.
group "default" {
  targets = ["gateway", "identity", "web", "seller", "admin"]
}

# Phase 1 adds the shops, catalogue, search and media services (test environments run it).
group "phase1" {
  targets = ["gateway", "identity", "shops", "catalog", "discovery", "media", "web", "seller", "admin"]
}

target "_service" {
  context    = "."
  dockerfile = "infra/docker/service.Dockerfile"
}

target "_next" {
  context    = "."
  dockerfile = "infra/docker/next.Dockerfile"
  args = {
    NEXT_PUBLIC_GATEWAY_URL        = NEXT_PUBLIC_GATEWAY_URL
    NEXT_PUBLIC_WEB_URL            = NEXT_PUBLIC_WEB_URL
    NEXT_PUBLIC_SELLER_URL         = NEXT_PUBLIC_SELLER_URL
    NEXT_PUBLIC_SENTRY_DSN         = NEXT_PUBLIC_SENTRY_DSN
    NEXT_PUBLIC_SENTRY_ENVIRONMENT = NEXT_PUBLIC_SENTRY_ENVIRONMENT
    NEXT_PUBLIC_GOOGLE_MAPS_KEY    = NEXT_PUBLIC_GOOGLE_MAPS_KEY
    NEXT_PUBLIC_GOOGLE_MAP_ID      = NEXT_PUBLIC_GOOGLE_MAP_ID
    BUILD_ID                       = BUILD_ID
  }
}

target "gateway" {
  inherits = ["_service"]
  args     = { APP = "gateway" }
  tags     = ["${REGISTRY}/gateway:${TAG}"]
}

target "identity" {
  inherits = ["_service"]
  args     = { APP = "identity" }
  tags     = ["${REGISTRY}/identity:${TAG}"]
}

target "shops" {
  inherits = ["_service"]
  args     = { APP = "shops" }
  tags     = ["${REGISTRY}/shops:${TAG}"]
}

target "catalog" {
  inherits = ["_service"]
  args     = { APP = "catalog" }
  tags     = ["${REGISTRY}/catalog:${TAG}"]
}

target "discovery" {
  inherits = ["_service"]
  args     = { APP = "discovery" }
  tags     = ["${REGISTRY}/discovery:${TAG}"]
}

target "media" {
  inherits = ["_service"]
  args     = { APP = "media" }
  tags     = ["${REGISTRY}/media:${TAG}"]
}

target "messaging" {
  inherits = ["_service"]
  args     = { APP = "messaging" }
  tags     = ["${REGISTRY}/messaging:${TAG}"]
}

target "notifications" {
  inherits = ["_service"]
  args     = { APP = "notifications" }
  tags     = ["${REGISTRY}/notifications:${TAG}"]
}

target "orders" {
  inherits = ["_service"]
  args     = { APP = "orders" }
  tags     = ["${REGISTRY}/orders:${TAG}"]
}

target "payments" {
  inherits = ["_service"]
  args     = { APP = "payments" }
  tags     = ["${REGISTRY}/payments:${TAG}"]
}

target "web" {
  inherits = ["_next"]
  args     = { APP = "web" }
  tags     = ["${REGISTRY}/web:${TAG}"]
}

target "seller" {
  inherits = ["_next"]
  args     = { APP = "seller" }
  tags     = ["${REGISTRY}/seller:${TAG}"]
}

target "admin" {
  inherits = ["_next"]
  args     = { APP = "admin" }
  tags     = ["${REGISTRY}/admin:${TAG}"]
}
