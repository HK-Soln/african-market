# Phase 3: Commerce

**Outcome:** a customer orders from one shop, chooses pickup at a branch or delivery inside the
branch's service area, and pays by card, Apple Pay, Google Pay or cash on delivery. Card payments are
**Stripe Connect direct charges** on the shop's own connected account with the platform's commission
as an application fee. Orders are tracked, refunded and reviewed; sellers see payouts mirrored from
Stripe.

**Hard prerequisites (must be confirmed before any of this goes live):** company trade licence,
corporate bank account, platform Stripe account, Stripe's written confirmation that a UAE platform can
use Connect with UAE connected accounts, direct charges and application fees. If Stripe says no, stop:
online checkout does not ship and shops remain contact-only plus COD (DECISIONS P-01).

**Gate to exit:** the first paid orders are settled in the shops' Stripe balances, the application
fees reach the platform account, and payouts appear correctly in the seller dashboard.

Read `docs/PLAN.md` "Checkout and payments" before starting. Never implement destination charges,
separate charges and transfers, or any balance the platform holds.

---

- [ ] **F3-01 Payments service: connected accounts** (no dependency)
      Entity `connected_account` (shop_id unique, stripe_account_id, type `standard`, country AE,
      charges_enabled, payouts_enabled, details_submitted, requirements jsonb, updated_from_stripe_at).
      Onboarding with Stripe-hosted Account Links (Standard accounts, so the shop is liable for refunds,
      disputes and Stripe fees). `StripeGateway` adapter (stripe-node pinned API version) with a fake for
      tests. Pattern to create the onboarding link and to read status. Mirror `account.updated` webhooks.

- [ ] **F3-02 Webhooks** (depends on F3-01)
      Gateway route `POST /webhooks/stripe` (raw body, `@Public`, no throttling) forwards to payments.
      Verify signatures for both platform and Connect endpoints, store every event in
      `stripe_webhook_event` (event id unique) and process idempotently. Handle `account.updated`,
      `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`,
      `charge.dispute.created`, `charge.dispute.closed`, `payout.paid`, `payout.failed`,
      `application_fee.refunded`.

- [ ] **F3-03 Checkout eligibility** (depends on F3-01)
      `checkout_enabled` can be switched on only when: KYC passed, trade licence validated by an admin and
      not expired, connected account `charges_enabled` and `payouts_enabled`. Shops service owns the flag;
      payments publishes `connected_account.updated` (add to contracts) and shops re-evaluates. Licence
      expiry job disables checkout and notifies the seller 30/7/1 days ahead. `cod_enabled` can be on for
      any verified shop. Admin overrides are audit-logged.

- [ ] **F3-04 Orders service: cart** (no dependency)
      Single-shop cart (`cart`, `cart_item`): adding an item from another shop asks to replace the cart.
      Prices snapshot at add time and re-validated at checkout. Fulfilment choice pickup (branch) or
      delivery (address must be inside the branch service area, checked with `coversPoint` or radius via a
      shops pattern), delivery fee and minimum order from the branch.

- [ ] **F3-05 Order placement and stock** (depends on F3-04)
      `order` per the plan (number like `AM-24-000123`, customer, shop, branch, fulfilment, address
      snapshot, status, subtotal, delivery_fee, vat (inclusive, informational), total, payment_method
      card/cod, commission_fils, fulfilment_provider = `seller`), `order_item` snapshots,
      `stock_reservation` (variant, branch, qty, expires_at). Reserve stock in a transaction with
      `pessimistic_write` on `branch_listing` rows (via catalog pattern, or a stock table owned by
      orders; decide and record it). Release reservations on payment timeout (15 min) by a scheduled job.
      Publishes `order.placed`.

- [ ] **F3-06 Card payments: direct charges** (depends on F3-02, F3-05)
      Create the PaymentIntent **on the connected account** (`stripeAccount` header) with
      `application_fee_amount = commission`, `amount = total`, currency `aed`, automatic payment methods,
      metadata order id. Commission = platform rate (env `PLATFORM_COMMISSION_BPS`, overridable per
      category or shop by admin) applied to the subtotal; COD orders have zero commission (P-07).
      Frontend uses Stripe Payment Element initialised with the connected account id. Apple Pay domain
      registered for each connected account through the API. On `payment_intent.succeeded`: mark payment
      captured, publish `payment.succeeded`; orders moves `pending_payment → paid`.

- [ ] **F3-07 Order lifecycle** (depends on F3-05)
      State machine exactly as the plan: `pending_payment → paid | cod_confirmed → accepted →
ready_for_pickup | out_for_delivery → completed`, plus `cancelled` and `refunded`. Allowed
      transitions per actor (customer, shop staff for that branch, admin, system). Every transition
      publishes `order.status_changed` and is audit-logged. `DeliveryProvider` interface with
      `SellerDeliveryProvider` (manual status updates) so future couriers plug in.

- [ ] **F3-08 Refunds, cancellations and disputes** (depends on F3-06, F3-07)
      Shop or admin can refund fully or partially (refund on the connected account; `refund_application_fee`
      true when the order is cancelled before fulfilment). Mirror refunds and disputes into `payment` and
      `ledger_entry` (read-only mirror of Stripe objects, never a balance). Dispute notices to the shop.

- [ ] **F3-09 Payouts mirror** (depends on F3-02)
      `payout` rows from `payout.*` events on connected accounts; seller dashboard shows payouts,
      fees and a link to the shop's own Stripe dashboard. No payout initiation from our side.

- [ ] **F3-10 Checkout UI** (depends on F3-06, F3-07)
      Web: cart drawer, checkout (pickup vs delivery with address picker on map, saved addresses), payment
      step (Payment Element, Apple Pay/Google Pay, COD where enabled), confirmation, order tracking page
      with status timeline and chat with the shop. Seller app: order queue per branch with sound/push,
      accept/ready/out-for-delivery/complete, refunds, payouts page, checkout settings and onboarding to
      Stripe. VAT-inclusive prices in AED everywhere, receipts by email (notifications consumes order
      events).

- [ ] **F3-11 Checkout incentives and trust** (depends on F3-10)
      Verified-purchase reviews from completed orders (move reviews to `orders`, migrate the Phase 2
      chat reviews and keep their label), "Order online" button ranked above WhatsApp on shops with
      checkout, ranking boost for checkout shops in discovery, chat warning when a message asks the
      customer to pay outside the platform for a shop that has checkout.

- [ ] **F3-12 Boost payments on the platform account** (depends on F3-02)
      Sellers buy Boosts with Stripe Checkout on the **platform's own** Stripe account (this is platform
      revenue for an advertising service, not a marketplace charge). Webhook activates the boost. VAT
      invoice to the shop once the platform is VAT-registered.

- [ ] **F3-13 Buy journey e2e and go-live** (depends on all above)
      Playwright with Stripe test mode in en and ar: card, Apple Pay (where testable), COD, refund.
      Run real low-value orders with friendly shops in production, confirm settlement, fees and payouts
      with Stripe reports and record the result here. **Closes the Phase 3 gate.**
