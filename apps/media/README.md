# media service

Phase introduced: **1** (see `docs/directives/`). Design: decision T-27 in `docs/DECISIONS.md`.

|                         |                                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| Owns                    | Uploads, checking and re-encoding files, the three buckets, CDN URLs   |
| Tables (schema `media`) | media_object, media_access_log                                         |
| Publishes               | `media.ready`, `audit.recorded` (admin actions)                        |
| Consumes                | `user.deleted` (deletes the avatar and unused uploads at once)         |
| Ports (dev)             | TCP and HTTP from `SERVICES.media` in `libs/contracts/src/services.ts` |

## How a file gets in

1. `createUpload` (`POST /api/v1/media/uploads`) checks that the caller may upload this purpose
   (avatar: for themselves; shop logo and gallery: shop owner or manager; product image: owner or
   manager, staff when the shop allows it; trade licence: owner) and the per-user limits (20
   waiting, 100 an hour), then returns a **presigned POST** for one server-chosen key in the
   quarantine bucket: 5 minutes, exact content type, size up to what was announced. Storage itself
   refuses anything else.
2. The browser posts the file straight to storage (`uploadMedia` in `@am/api-client`).
3. `confirmUpload` locks the row, reads the file, takes its real type from its bytes (jpeg, png,
   webp; pdf for trade licences; never svg, gif or animations), limits pixels, re-encodes images to
   WebP sizes (thumb 200, card 600, full 1600) without their metadata, stores them, deletes the
   upload and publishes `media.ready`. A file that fails is `rejected` with a reason.

## Buckets

| Bucket  | Written by                 | Read by                          |
| ------- | -------------------------- | -------------------------------- |
| uploads | browsers, one form per key | media only; S3 empties it daily  |
| public  | media only                 | the CDN (MinIO directly locally) |
| private | media only (KMS-encrypted) | media only                       |

## After that

- Objects never change. `attach` binds one to what uses it: only its uploader, for its purpose
  (and its shop), once. `detach` unbinds it; the owning service has checked the caller first.
- Private documents never get a URL a browser sees: `GET /api/v1/admin/media/:id/content` streams
  them to admins, and `media_access_log` records each look.
- `MediaCleanup` (hourly) deletes unconfirmed uploads after a day, stored objects never attached
  after 24 hours and detached ones after 7 days, from storage and the CDN.

Locally `S3_CREATE_BUCKETS=true` makes the three buckets in MinIO and lets anyone read the public
one; it is refused in staging and production, where Terraform owns them.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/media              # watch mode
pnpm nx run @am/media:migration:run
pnpm nx run @am/media:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/media             # test/ needs Postgres and MinIO (pnpm infra:up)
```
