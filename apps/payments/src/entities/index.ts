/**
 * TypeORM entities owned by the payments service (connected_account, payment, ledger_entry (read-only Stripe mirror), payout, stripe_webhook_event).
 * Extend AppBaseEntity from @am/database. See docs/PLAN.md "Data model" and
 * docs/directives for the phase that introduces each one.
 */
export const entities: Array<new () => unknown> = [];
