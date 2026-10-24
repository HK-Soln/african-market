# shops service

Phase introduced: **1** (see `docs/directives/`).

|                         |                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Owns                    | Shops, branches, opening hours, special hours, service areas, KYC and verification status, contact-tap events, reports on shops |
| Tables (schema `shops`) | shop, branch, opening_hours, special_hours, verification_request, contact_event, shop_report                                    |
| Publishes               | `shop.created`, `shop.updated`, `shop.verified`, `branch.updated`, `audit.recorded` (admin actions)                             |
| Consumes                | `user.deleted` (deletes the provider's identity session at erasure time; forgets who sent taps and reports)                     |
| Ports (dev)             | TCP and HTTP from `SERVICES.shops` in `libs/contracts/src/services.ts`                                                          |

## Shops and branches (F1-02)

| Pattern (`ShopsPatterns`)       | What it does                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `create`                        | A draft shop owned by the caller (5 per person); publishes `shop.created`.                                                            |
| `update`                        | Name, description, contacts, media, origins, the staff upload setting.                                                                |
| `get` / `listMine`              | A shop with its branches, for its members and admins; the caller's shops.                                                             |
| `getBySlug`                     | Public: verified shops only, by slug or id, with the seller named once an admin approved the latest trade licence (until it expires). |
| `upsertBranch` / `deleteBranch` | Pin (inside the UAE), address, Makani, delivery area or radius, fees.                                                                 |
| `setOpeningHours`               | Replaces the weekly schedule; several periods a day, past midnight allowed.                                                           |
| `setSpecialHours` / `delete...` | A date that differs: closed for Eid, open late in Ramadan.                                                                            |

- Who may do what: the owner (known from `shop.owner_id`, so a new shop works before the token
  catches up) and managers change everything; staff and admins only read. Someone with no role
  gets `SHOP_NOT_FOUND`, so they learn nothing.
- A drawn delivery area must be a valid shape inside the UAE, at most 5,000 km² and 2,000 points.
  Delivery needs an area or a radius.
- The first branch is primary; making another primary moves it; deleting the primary hands it to
  the oldest one left.
- `update` answers with `releasedMediaIds` (a replaced logo, gallery images taken out) for the
  gateway to detach. The gateway routes and media attachment come with F1-08.

## Seller verification (F1-03, decision T-28)

1. The owner starts KYC (`startKyc`): a `verification_request` and a session at the provider,
   tied to it by `vendor_data`. The owner goes to the provider's hosted page (camera, liveness,
   documents) and comes back to the seller app.
2. The result comes by webhook (`POST /api/v1/webhooks/didit` at the gateway, passed on with its
   raw body) and when the owner comes back (`refreshKyc`). Either way only the session id is
   taken from outside: the decision is fetched from the provider, and only a summary is kept
   (status, document type, issuing country, expiry, name, liveness and face-match results). No
   images, document numbers or birth dates are stored here.
3. The owner submits the listing (`submitForVerification`): it needs a branch, a contact and KYC
   started. Admins see the queue (`verificationQueue`) and decide (`decideListing`: approve, which
   needs KYC passed; reject or suspend, with a reason; reinstate). Each decision publishes
   `shop.verified`.
4. Admins open the identity images through the gateway (`kycDocument`): a fresh link from the
   provider each time, never stored, and each look written to `verification_audit`.
5. The trade licence is optional: details on the shop, the document in the media service's private
   bucket, approved or rejected by an admin.
6. When the owner deletes their account, the provider session is deleted at erasure time (30
   days later; T-23).

`KYC_PROVIDER=fake` approves at once, for local work and tests (refused in staging and production).
Didit needs `DIDIT_API_URL`, `DIDIT_API_KEY` (scopes to create, read and delete sessions),
`DIDIT_API_SECRET` (the webhook destination's secret) and `DIDIT_WORKFLOW_ID`.

## Reports on shops (F1-15)

| Pattern (`ShopsPatterns`) | What it does                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitReport`            | Public: a reason (`REPORT_REASONS`) and optional details on a verified shop; one open report per visitor and shop.                                          |
| `listReports`             | Admins: reports by status, reason or shop, open ones oldest first (`REPORT_LIST_SPEC`).                                                                     |
| `decideReport`            | Admins: `resolved` or `dismissed` with an optional note; closes every open report on the shop and records `shop.report_resolved` / `shop.report_dismissed`. |

The reporter's account (when signed in) is kept to follow up and is never returned; `user.deleted`
clears it. Reports on products live in the catalog service.

Rules: never read another service's schema; publish events through `OutboxService.enqueue` inside
the same transaction as the change; wrap every consumer in `IdempotentConsumer.handle`; add new
request patterns to `libs/contracts/src/patterns.ts` before writing the handler.

```bash
pnpm nx dev @am/shops              # watch mode
pnpm nx run @am/shops:migration:run
pnpm nx run @am/shops:migration:generate -- src/migrations/AddShopTable   # after build
pnpm nx test @am/shops
```
