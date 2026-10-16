# shops service

Phase introduced: **1** (see `docs/directives/`).

|                         |                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Owns                    | Shops, branches, opening hours, special hours, service areas, KYC and verification status, contact-tap events |
| Tables (schema `shops`) | shop, branch, opening_hours, special_hours, verification_request, contact_event                               |
| Publishes               | `shop.created`, `shop.updated`, `shop.verified`, `branch.updated`                                             |
| Consumes                | none yet                                                                                                      |
| Ports (dev)             | TCP and HTTP from `SERVICES.shops` in `libs/contracts/src/services.ts`                                        |

## Shops and branches (F1-02)

| Pattern (`ShopsPatterns`)       | What it does                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `create`                        | A draft shop owned by the caller (5 per person); publishes `shop.created`.  |
| `update`                        | Name, description, contacts, media, origins, the staff upload setting.      |
| `get` / `listMine`              | A shop with its branches, for its members and admins; the caller's shops.   |
| `getBySlug`                     | Public: verified shops only.                                                |
| `upsertBranch` / `deleteBranch` | Pin (inside the UAE), address, Makani, delivery area or radius, fees.       |
| `setOpeningHours`               | Replaces the weekly schedule; several periods a day, past midnight allowed. |
| `setSpecialHours` / `delete...` | A date that differs: closed for Eid, open late in Ramadan.                  |

- Who may do what: the owner (known from `shop.owner_id`, so a new shop works before the token
  catches up) and managers change everything; staff and admins only read. Someone with no role
  gets `SHOP_NOT_FOUND`, so they learn nothing.
- A drawn delivery area must be a valid shape inside the UAE, at most 5,000 km² and 2,000 points.
  Delivery needs an area or a radius.
- The first branch is primary; making another primary moves it; deleting the primary hands it to
  the oldest one left.
- `update` answers with `releasedMediaIds` (a replaced logo, gallery images taken out) for the
  gateway to detach. The gateway routes and media attachment come with F1-08.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/shops              # watch mode
pnpm nx run @am/shops:migration:run
pnpm nx run @am/shops:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/shops
```
