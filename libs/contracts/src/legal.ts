/**
 * The versions of the legal texts people agree to (F0-16). Identity records the versions current
 * when someone accepts the terms, so it is known later which text they saw. Change a version
 * whenever its text changes; the web app shows it on the page.
 *
 * Both are drafts awaiting legal review (see apps/web/src/legal). The reviewed texts get new
 * versions.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-10-16',
  privacy: '2026-10-16',
} as const;

/**
 * Days between someone deleting their account and their personal data being erased. Until then
 * the account is closed (no sign-in, hidden from others), so a mistaken or fraudulent deletion
 * can still be looked into; after it, only an anonymous row is left.
 */
export const ACCOUNT_ERASURE_DAYS = 30;
