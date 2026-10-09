# Phase 4: Growth

Less detailed on purpose: each item gets its own design note in `docs/` before implementation, based
on what Phases 1-3 taught us. Start each with a short written proposal for Henson.

- [ ] **F4-01 Pro plan** — monthly subscription on the platform Stripe account (Stripe Billing): more
      products and branches, staff seats, contact analytics, Pro badge, monthly boost credit; free Pro for
      checkout sellers above a monthly sales level (P-08).
- [ ] **F4-02 Coupons and promotions** — shop-funded coupons applied to the connected-account charge;
      platform-funded promotions need a separate design (they must not route money through the platform).
- [ ] **F4-03 Service bookings** — time-slot booking for salons, braiding and tailoring, with optional
      deposit via direct charge.
- [ ] **F4-04 BNPL** — Tabby / Tamara if they support a marketplace model where the shop is the merchant;
      otherwise skip.
- [ ] **F4-05 WhatsApp Business Platform** — OTP fallback and order-update templates through Meta or a BSP
      (360dialog), behind the notifications WhatsApp adapter.
- [ ] **F4-06 UAE Pass** — sign-in and identity assurance for verified sellers (replaces or complements
      manual KYC through `KycProvider`).
- [ ] **F4-07 Native apps decision** — review PWA install and retention data; if native is justified,
      propose Expo/React Native sharing `@am/api-client`, `@am/i18n`, `@am/contracts`.
- [ ] **F4-08 Delivery product line** — own delivery in selected emirates and third-party couriers behind
      `DeliveryProvider`, seller chooses provider per order.
- [ ] **F4-09 Search engine** — move text search to OpenSearch (me-central-1) when the catalogue passes
      ~100,000 products or Arabic stemming quality becomes a complaint.
- [ ] **F4-10 Dispute centre, analytics, personalised feed, more languages** (Swahili, Amharic if demand
      shows).
