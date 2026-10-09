# media service

Phase introduced: **1** (see `docs/directives/`).

|                         |                                                                        |
| ----------------------- | ---------------------------------------------------------------------- |
| Owns                    | Presigned uploads to S3/MinIO, image resizing, CDN URLs                |
| Tables (schema `media`) | media_object                                                           |
| Publishes               | `media.ready`                                                          |
| Consumes                | none                                                                   |
| Ports (dev)             | TCP and HTTP from `SERVICES.media` in `libs/contracts/src/services.ts` |

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/media              # watch mode
pnpm nx run @am/media:migration:run
pnpm nx run @am/media:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/media
```
