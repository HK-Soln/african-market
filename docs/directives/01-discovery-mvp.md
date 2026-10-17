# Phase 1: Discovery MVP (public launch)

**Outcome:** sellers register shops with branches, opening hours and service areas, list products and
services, pass basic KYC and admin verification. Customers find verified shops and products near
them on a map and list, filter, open SSR shop and product pages, and contact sellers by WhatsApp, call
or email. Sellers see contact analytics. Admins verify, moderate and manage categories. No payments.

**Gate to exit:** in each emirate where search is opened, there are enough verified shops that a
first search returns results. Opening search is an admin switch per emirate (F1-13).

Read `docs/PLAN.md` sections: Users and core journeys, Feature scope, Services, Data model,
Location discovery and search, Contact, UAE specifics.

---

## Backend

- [x] **F1-01 Media service** (no dependency; design: decision T-27)
      Only the media service touches storage. Three buckets: `uploads` (quarantine; browsers write
      there only, through a single-use presigned POST for one server-chosen key, 5 minutes, exact
      content type and size range; expires after 1 day), `public` (processed images; written by media
      only, read by the CDN only) and `private` (KMS-encrypted documents; media only).
      `media_object` (owner_id, purpose avatar/shop_logo/shop_gallery/product_image/trade_license,
      shop_id for shop purposes, visibility, status pending/ready/rejected/deleted, size, width,
      height, variants jsonb, attached_type/attached_id, attached_at, detached_at) and
      `media_access_log`. `createUpload` checks the purpose against the caller (table in T-27) and
      per-user limits. `confirmUpload` locks the row, reads the real type from the bytes (jpeg, png,
      webp; pdf only for trade licences; never svg or animated images), limits pixels, re-encodes
      images to webp variants with `sharp` (thumb 200, card 600, full 1600; EXIF and GPS gone),
      deletes the upload, sets `ready` and publishes `media.ready`. Objects are immutable: replacing
      is a new upload. `attach` / `detach` bind an object to what uses it (only its uploader, for its
      purpose, once). Private objects are never given a URL: admins get the bytes through the gateway,
      each view logged. A cleanup job removes unconfirmed uploads after a day, unattached objects after
      24 hours and detached ones after 7 days. Gateway: `POST /media/uploads`,
      `POST /media/uploads/:id/confirm`, `GET /admin/media/:id/content`.

  > Note: owner's review (2026-10-16) asked for security first; the design is decision T-27,
  > and differs from the first draft of this task: a quarantine bucket, a presigned POST instead of
  > a PUT (a PUT cannot limit size), immutable objects, attach/detach, and documents streamed to
  > admins instead of presigned GETs.
  > Note: HEIC is not accepted: sharp's prebuilt binaries cannot decode it. Pages that ask for
  > jpeg, png or webp make iPhones convert photos to JPEG before upload.
  > Note: KYC documents are not here at all: they stay with Didit (T-28). The private bucket holds
  > trade licences.
  > Note: staff upload of product images waits for the shop setting (F1-02); the gateway sends
  > `staffMayUpload: false` until then.
  > Note: also fixed: EventBus crashed the process when the app stopped while its RabbitMQ channel
  > was still being set up (an `error` event with no listener).

- [x] **F1-02 Shops: shop and branch model** (depends on F1-01)
      Entities per the plan: `shop` (name, slug unique, description LocalizedText, logo_media_id, gallery
      media ids, category_ids, origin_countries text[] ISO-3166 alpha-2, legal_name, trade_license_no,
      license_expiry, license_media_id, kyc_status none/pending/passed/failed, verification_status
      draft/pending/verified/rejected/suspended, contact_whatsapp, contact_phone, contact_email,
      checkout_enabled false, cod_enabled false, stripe_account_id null,
      staff_can_upload_product_images false (decision T-29)), `branch` (shop_id, name,
      emirate code, area, address_line, makani, location geography Point (GiST), service_area
      geography MultiPolygon nullable (GiST), service_radius_m nullable, pickup, delivery,
      delivery_fee_fils, min_order_fils, contact overrides, is_primary), `opening_hours` (branch_id,
      weekday 0-6, opens_at, closes_at; several rows per day allowed), `special_hours` (branch_id, date,
      closed or hours, label e.g. Eid). Validate pins with `isInUae`. Owner creating a shop gets an
      `owner` membership (identity consumes `shop.created`, publishes `membership.changed`) and the
      `seller` role. Patterns for create/update/get/list mine/upsert branch/delete branch/set hours.
      Events: `shop.created`, `shop.updated`, `branch.updated`.

  > Note: the service checks every change itself. The owner comes from `shop.owner_id` (so a new
  > shop is usable before identity grants the membership and the next token carries it);
  > managers and staff come from the token, which can be up to 15 minutes old.
  > Note: the gateway routes, attaching logo and gallery media, and the staff-upload lookup are
  > part of F1-08 (the gateway APIs); `update` already returns the media ids to detach.
  > Note: limits for now: 5 shops a person, 50 branches a shop, delivery areas up to 5,000 km².
  > Slugs are made from the name (an Arabic-only name gives `shop` plus a suffix) and are not
  > editable yet.
  > Note: trade licence and verification fields exist on `shop` but are not editable here; F1-03.

- [x] **F1-03 Basic KYC and verification workflow** (depends on F1-02; design: decision T-28)
      `verification_request` (shop_id, type kyc|trade_license, submitted_by, provider session id or
      document media ids, status pending/approved/rejected, reviewer_id, reason, decided_at). KYC =
      government ID (Emirates ID or passport) + selfie through a `KycProvider` interface: `DiditKycProvider`
      (hosted Didit session; signed webhook to the gateway) and a manual fake for local use and tests.
      ID documents and selfies **stay with Didit**: store only the session id, status and a decision
      summary, never Didit's media links. Admins see the documents through the gateway, which asks
      Didit for fresh links and streams the bytes (no-store, admin only, every view audited). Sellers
      never see their own KYC documents. The Didit session is deleted when the account is erased.
      Trade licence (number, issuing authority, expiry, document in our private bucket) is optional in
      Phase 1 and becomes required for checkout in Phase 3. Shop goes `pending` on submission and
      `verified` when KYC passes and an admin approves the listing. Only verified, non-suspended shops
      are public. Publish `shop.verified` on every status change. Audit-log every decision. Notify the
      seller by email (SMS optional) through a temporary direct call to the email adapter until Phase 2
      notifications.

  > Note: owner's decision (2026-10-16): Didit's hosted page, not our own capture pages. Building
  > our own would have put ID documents in our storage and given up Didit's camera-side liveness
  > checks, and we would have come back to the hosted page later.
  > Note: the webhook body is not trusted beyond its signature and session id; the decision is
  > fetched from Didit. The same fetch runs when the seller returns, so the flow works without
  > webhooks (locally).
  > Note: the seller is not emailed yet: `shop.verified` carries every decision, and Phase 2's
  > notifications service consumes it, instead of a temporary SMTP client in shops. The seller app
  > shows the status and the reason meanwhile.
  > Note: the owner's and admins' routes (start, refresh, submit, licence, queue, decisions, images)
  > come with the gateway APIs (F1-08); the webhook route is here, because Didit calls it.

- [x] **F1-04 Catalogue** (depends on F1-02)
      `category` tree (parent_id, slug, name LocalizedText, kind product/service, is_restricted,
      requires_declaration, sort). Seed via migration: Groceries & Food (Grains & flours, Spices & soup
      ingredients, Snacks, Drinks, Frozen), Beauty & Hair (Hair & wigs, Skin care, Cosmetics), Fashion
      (Ankara & fabrics, Ready-to-wear, Tailoring), Home & Culture (Art & crafts, Books & music),
      Services (Hair salons & braiding, Tailoring, Events & catering, Money transfer agents (listing only),
      Cargo & shipping, Restaurants). Names in en, ar, fr. `product` (shop_id, category_id, type
      product/service, title LocalizedText, description LocalizedText, origin_country, image media ids,
      status draft/active/hidden/rejected, food_declaration jsonb for food categories), `variant`
      (product_id, sku, options jsonb, price_fils, compare_at_fils), `branch_listing` (branch_id,
      variant_id, in_stock, quantity nullable, price_override_fils). Food and restricted categories go to
      admin review before `active`. Events `product.upserted`, `product.removed`. Catalogue hides products
      of shops that are not verified (consume `shop.verified`).

  > Note: statuses add `pending_review` (waiting for an admin). A product an admin rejected is
  > reviewed again before it shows, whatever its category; changing the reviewed parts of an active
  > food or restricted product sends it back to review (decision T-30).
  > Note: restricted at launch: Skin care, Cosmetics and Money transfer agents; the declaration
  > covers Groceries & Food (packaged and labelled, not fresh meat, unlabelled goods or herbal
  > medicine, storage, maker, registration number). Money transfer agents also carry
  > `checkout_allowed = false` for Phase 3. Fashion's Tailoring (made to measure) and the Tailoring
  > service are two categories (`tailoring`, `tailoring-services`).
  > Note: a variant's price may be empty only for a service (priced on request). Staff update stock
  > at their own branches; owners and managers set listings and branch prices.
  > Note: catalog learns shops and branches from events (`known_shop`, `known_branch`); shops that
  > existed before catalog first ran are picked up by F1-05's rebuild. Gateway routes come with F1-08.

- [x] **F1-05 Discovery read model** (depends on F1-02, F1-04)
      Tables `search_branch` (branch_id pk, shop_id, shop_slug, shop_name, logo url, category_ids,
      origin_countries, emirate, area, location, service_area, service_radius_m, pickup, delivery,
      verified, rating_avg, rating_count, completeness_score, hours jsonb (weekly + special, for open-now),
      searchable tsvector, boost fields reserved for Phase 2, updated_from_event_at) and `search_product`
      (product_id, shop_id, branch_ids, title LocalizedText, category_id, origin_country, min_price_fils,
      image url, searchable tsvector). Built only from events (`shop.*`, `branch.updated`,
      `product.*`), fetching full details from the owning service over TCP when the payload is thin.
      Idempotent and order-safe. Admin-only `discovery.rebuild` pattern that replays from the owners.
      Create an `unaccent`-based text search configuration (`am_simple`) in the migration and GIN indexes
      on `searchable` plus `pg_trgm` on names.

  > Note: every event makes discovery read the owner's current state (decision T-31): a shop event
  > re-reads the shop, its branches and its products; a product event the product. Snapshots carry
  > the owner's read time, and older ones never overwrite newer rows.
  > Note: only verified shops have rows, so `verified` is always true for now (kept for a later
  > "unverified but listed" option). `category_ids` holds the shop's and its in-stock products'
  > categories with every parent, so a filter on a parent category is one array match.
  > Note: `completeness_score` (0-100): logo 15, description 15, gallery 10, a contact 15, weekly
  > hours 15, an area 5, at least one product 25. Ratings stay 0 until reviews (Phase 2).
  > Note: the rebuild runs in the request and answers with counts; shops that are not verified or
  > gone are dropped. It also picks up shops that existed before catalog or discovery first ran.

- [x] **F1-06 Nearby search** (depends on F1-05)
      `DiscoveryPatterns.searchNearby`: input point (lat,lng), mode `delivery` (ST_Covers service_area or
      distance ≤ service_radius_m) or `pickup` (ST_DWithin location, travel radius default 10 km),
      optional query text, filters (category incl. descendants, origin country, open now in Asia/Dubai,
      delivers to me, emirate), `limit` ≤ 50, `cursor`. Ranking score = weighted distance decay, open now,
      verified, rating (Bayesian), completeness, text rank when `q` present; deterministic tie-break on
      branch id; cursor encodes (score, id). Returns branches with distance and, when `q` matches
      products, the top matching products per branch. `searchMap`: bounding box + zoom; returns individual
      pins at high zoom, server-side clusters (ST_SnapToGrid or ST_ClusterDBSCAN) at low zoom. Integration
      tests on PostGIS with fixture shops around Deira, Al Nahda, International City, Sharjah and Ajman.
      p95 under 150 ms for 10k branches locally (add a seed script).

  > Note: weights, the cursor and the speed measures are in decision T-32. Measured locally over
  > 10,000 branches with products: p50 about 43 ms, p95 about 55 ms
  > (`SEARCH_PERF=1 pnpm nx test @am/discovery -- search.spec`, seeding in `test/support/fixtures.ts`).
  > Note: "origin country" matches the shop's countries or a product in stock at the branch;
  > pickup takes a travel radius (default 10 km, 0.5-50 km) and an optional "delivers to me".
  > Note: the map takes a bounding box and zoom; from zoom 14 it returns pins, below that clusters
  > (a cluster of one is returned as a pin), at most 500 markers with a `truncated` flag.

- [x] **F1-07 Contact events** (depends on F1-02)
      `contact_event` (shop_id, branch_id, product_id nullable, channel whatsapp/call/email, user_id
      nullable, anonymous session id, source page, created_at), partition-ready (monthly). Pattern
      `ShopsPatterns.recordContact`; gateway `POST /contact-events` is public, rate limited and
      de-duplicated per session/shop/channel within 10 minutes. Seller analytics pattern: counts by day,
      channel and product for the last 7/30/90 days.

  > Note: partitioned for real (monthly), with partitions made ahead by the service (decision T-33).
  > Only verified shops take taps; the visitor id is the app's random id; the user id comes from
  > the token and is cleared on account deletion. The analytics pattern is `shops.contact.stats`;
  > its seller route comes with F1-08.

- [x] **F1-08 Gateway public and seller APIs** (depends on F1-02 to F1-07)
      Public: `GET /search/nearby`, `GET /search/map`, `GET /shops/:slug`, `GET /shops/:slug/products`,
      `GET /products/:id`, `GET /categories`, `GET /emirates` (with search-open flag). Seller (auth,
      `@ShopRoles`): shops CRUD, branches CRUD + hours, products CRUD, uploads, submit for verification,
      analytics. Admin (`@Roles('admin')`): verification queue + decisions, product moderation, category
      CRUD, emirate search switches, shop suspend. Regenerate the api-client.

  > Note: delivered in three pull requests (decision T-34). Part 1, public: search nearby and map,
  > emirates with the search switch, shop by slug and its products, product, categories.
  > Part 2, seller (decision T-35): `/seller/shops` (list, create, get, change with logo and
  > gallery), branches, weekly and special hours, contact analytics, verification (status, start and
  > refresh KYC, submit, trade licence), products (list, create with images, change, status,
  > listings, remove) and branch stock; staff image uploads follow the shop's setting.
  > Part 3, admin: shop queue and search (`filter[search][like]` on name and slug), verification
  > overview, listing decisions (approve, reject, suspend, reinstate), trade licence decisions, KYC
  > images streamed from the provider (images only, never the link), product review queue and
  > decisions, categories (list with inactive, add, change), emirate search switches with counts,
  > and the search rebuild.

- [x] **F1-09 Social sign-in** (depends on Phase 0)
      Google and Facebook sign-in on web and seller (decision P-10; Apple is dropped): verify the
      Google ID token and the Facebook access token server-side in identity, link to existing
      accounts by verified email, `credential` rows of type google/facebook (a one-line migration
      adds `facebook` to the type CHECK). Behind env flags so local dev works without client ids.
  > Note: linking and account rules in decision T-36. `SOCIAL_PROVIDERS` is empty locally and in CI;
  > the apps show Google's own button and a Facebook button only for providers switched on
  > (`GET /auth/social/providers`). A new person accepts the terms on the profile screen, as with
  > phone sign-up. Terraform takes `google_client_ids` and `facebook_app_id`; the Facebook app
  > secret goes in Secrets Manager (`FACEBOOK_APP_SECRET`), readable by identity only.
  > Note: also fixed in Terraform: shops and catalog now accept calls from the backend group,
  > which discovery's reads (F1-05) need in AWS.

## Web app (customer PWA)

- [x] **F1-10 Location and map** (depends on F1-08)
      `MapProvider` adapter in `apps/web/src/lib/maps` with a Google Maps JS implementation (`@vis.gl/react-google-maps`)
      and a no-key fallback (static list only) when `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is empty. Location: ask
      for GPS permission only on user action; fall back to a chosen emirate + area (Places autocomplete
      restricted to AE), then IP-based city. Remember the chosen location in a cookie so SSR can use it.

  > Note: decision T-37. Places is the new Places API (autocomplete plus `fetchFields`); the
  > legacy Autocomplete widget is closed to new projects. Advanced Markers need a map id, so
  > `NEXT_PUBLIC_GOOGLE_MAP_ID` is required with the key (`DEMO_MAP_ID` locally).
  > Note: the IP guess reads CloudFront's viewer headers; nothing in front of the site adds them
  > yet (the ALB serves it directly), so in AWS it stays off until CloudFront arrives with the
  > domain. No geo-IP service or database was added: it would send or keep visitors' IPs.
  > Note: the cookie holds the point to about 110 m, only after the visitor chooses; the privacy
  > draft and the cookie notice (version 2) say so, and the privacy draft now lists Google Maps.
  > Note: the map itself appears with the search screens (F1-11); this task ships the adapter, the
  > place search and the location choice on the home page. The web app now has Jest unit tests.

- [ ] **F1-11 Search experience** (depends on F1-10)
      Home with search bar, "near me" results, emirate and category chips. Results page with list/map
      toggle synced to URL params, filters (category, origin country flag picker, open now, delivers to
      me, pickup/delivery), infinite scroll by cursor, empty states that suggest widening the radius.
      Every result card: logo, name, verified badge, distance, open-now, category, origin flags, and
      WhatsApp/Call buttons that log contact events.

- [ ] **F1-12 Shop and product pages** (depends on F1-08)
      SSR `/[locale]/s/[slug]` and `/[locale]/p/[id]-[slug]`: gallery, description, branches with map,
      hours (today highlighted, special hours), service area summary, products grid by category, contact
      buttons per branch, report-listing link. Show the seller's legal name and licence number when
      provided (Federal Decree-Law 14 of 2023). Open Graph image and description, JSON-LD
      (LocalBusiness/Product), `hreflang`, canonical URLs, sitemap generated from discovery.
      WhatsApp prefilled message names the product and links back to the page.

## Seller and admin apps

- [ ] **F1-13 Seller onboarding and dashboard** (depends on F1-08)
      Guided onboarding: shop details → first branch with map pin (drag to adjust), address, Makani
      optional, hours editor (copy to all days, split shifts, special hours), service area as radius slider
      or drawn polygon → contact numbers (validate WhatsApp numbers) → logo/gallery uploads → KYC upload →
      submit. Dashboard: verification status with reasons, branches, catalogue (product form with
      variants, per-branch stock/price, images, food declaration), contact analytics charts, settings.
      Fully usable on a phone. Arabic RTL checked.

- [ ] **F1-14 Admin console** (depends on F1-08)
      Admin sign-in restricted to `admin` role (no self-registration; seed the first admin from env).
      Verification queue with document viewer (private presigned URLs) and approve/reject with reason,
      product moderation queue for food/restricted categories, reports queue, category tree editor
      (en/ar/fr names), emirate search switches with live verified-shop counts, shop search and suspend,
      audit log viewer.

- [ ] **F1-15 Report listing** (depends on F1-12)
      Public "report this shop/product" (reason enum + text, optional sign-in), stored in the owning
      service, surfaced in the admin reports queue.

## Launch readiness

- [ ] **F1-16 End-to-end journeys** (depends on F1-11 to F1-14)
      Playwright in en and ar: (1) find and contact: set location, search, open shop, tap WhatsApp
      (assert link and contact event); (2) list a shop: seller onboarding to submission, admin approval,
      shop appears in search.

- [ ] **F1-17 Performance, SEO and accessibility pass**
      Lighthouse ≥ 90 performance/accessibility/SEO on home, results and shop pages on mobile; images via
      `next/image` from the CDN; search response cached in Redis for 30 s per (rounded point, filters).

- [ ] **F1-18 Production environment and launch**
      Terraform `production` environment, backups and point-in-time recovery verified by a restore test,
      alarms (5xx rate, p95 latency, queue depth, DLQ size, DB CPU), status page. Open search per emirate
      from the admin console as verified shops reach the threshold. **Closes the Phase 1 gate.**
