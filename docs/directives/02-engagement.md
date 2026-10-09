# Phase 2: Engagement

**Outcome:** customers and sellers chat in-app with a shared inbox per branch, notifications arrive by
push and email, customers keep favourites, shops invite staff, reviews tied to chats, the app is
available in French, and contact-only sellers can buy Boosts.

**Gate to exit (business):** the company's trade licence, corporate bank account and Stripe's written
confirmation of Connect support are all in hand. Engineering for Phase 3 can be prepared in a branch,
but checkout must not go live before this gate.

---

- [ ] **F2-01 Messaging service** (no dependency)
      Entities `conversation` (customer_id, shop_id, branch_id nullable, subject_type
      product/order/none, subject_id, last_message_at, customer_last_read_at, shop_last_read_at,
      status open/archived/blocked), `message` (conversation_id, sender_id, sender_side customer/shop,
      body text ≤ 2000, attachments media ids, created_at, deleted_at); plan monthly partitioning of
      `message` (document the switch-over, implement when the table passes ~10M rows). One conversation
      per (customer, shop), optionally pinned to a branch/product. Staff see conversations of their
      branches (`canAccessBranch`), owners and managers see all. Publishes `message.sent`.

- [ ] **F2-02 Real-time chat transport** (depends on F2-01)
      Socket.IO gateway in `messaging` with the Redis adapter; clients connect through the gateway at
      `/ws` (namespace `/chat`) using the access-token cookie. Events: `message:new`, `message:read`,
      `typing`. REST fallbacks in the gateway for history (cursor), send, mark read. Rate limit sends
      (e.g. 20/min per user), block and report, profanity/abuse hook (no-op adapter now).

- [ ] **F2-03 Chat UI** (depends on F2-02)
      Web: "Chat" button on shop/product pages opens a conversation pre-filled with the product card;
      inbox list and thread views, image attachments via media, read receipts, optimistic sends,
      reconnection. Seller app: shared inbox per branch with filters (unread, assigned branch), quick
      replies. RTL bubbles mirror correctly.

- [ ] **F2-04 Notifications service** (depends on F2-01)
      Entities `notification`, `notification_preference` (per user per category per channel),
      `push_subscription` (web push via FCM), `template` (key, channel, locale, subject, body with
      variables). Channels behind adapters: push (FCM), email (SES / Postmark; Mailpit locally), SMS
      (aggregator), WhatsApp (stub for Phase 4). Consumes `user.registered`, `shop.verified`,
      `message.sent` (push immediately if recipient offline; email digest if still unread after 30 min),
      later `order.*`. Move the Phase 1 verification emails here. Quiet hours for non-urgent messages
      (TDRA guidance for promotional SMS). Delivery log with provider ids.

- [ ] **F2-05 Web push in the PWA** (depends on F2-04)
      Permission prompt only after a meaningful action (first chat sent or favourite added). Service
      worker handles push and notification click to deep-link to the conversation.

- [ ] **F2-06 Favourites and recently viewed** (no dependency)
      Favourite shops and products (identity or discovery-owned table; choose discovery and note it),
      recently viewed list stored client-side and synced when signed in. "Your favourites near you" on home.

- [ ] **F2-07 Staff invites and permissions** (no dependency)
      Owner invites by phone or email to role manager/staff with branch scope; invite link with expiry;
      accept creates `shop_member` and publishes `membership.changed`. Manager cannot change payouts or
      ownership. Remove staff revokes access on next token refresh (max 15 min) and immediately on the
      socket.

- [ ] **F2-08 Ratings and reviews (chat-based)** (depends on F2-01)
      A customer who had a conversation with a shop with at least one shop reply can leave one review per
      shop per 90 days (rating 1-5, text). Reviews go through moderation (auto-publish, admin can hide).
      Shop reply to review. Aggregate published to discovery for ranking. Phase 3 adds verified-purchase
      reviews from orders, ranked above chat reviews. Owning service: `orders` does not exist yet, so put
      reviews in `messaging` for now behind a `reviews` module and note the planned move in DECISIONS.

- [ ] **F2-09 French** (no dependency)
      Complete `fr.json` for all apps, French category names, language switcher shows French, French
      e2e smoke run.

- [ ] **F2-10 Boosts (sponsored placement)** (depends on Phase 1 discovery)
      Read DECISIONS T-13 and P-08. Entity `boost` (shop_id, branch_ids, category_id, emirate + area or
      radius around a branch, starts_at, ends_at, status scheduled/active/ended/cancelled, price_fils,
      invoice_ref, created_by). Owner: `shops` service (module `boosts`), published to discovery as
      `boost.changed` (add to contracts). Discovery inserts at most 2 sponsored results at the top of a
      results page when the boost matches the query's category and location, labelled "Sponsored" /
      "مُموَّل" / "Sponsorisé", never hides organic results, and never boosts unverified shops. Admin
      console creates boosts against an offline invoice. Seller app shows active boosts with impressions,
      clicks and contact taps (from contact events). Stripe Checkout on the platform's own account is a
      Phase 3 follow-up (F3-12).

- [ ] **F2-11 Phase 2 e2e and gate check**
      Playwright: chat between a customer and a branch staff member in en and ar; favourites; boost
      appears labelled in results. Confirm the business gate items with Henson and record the answer here.
