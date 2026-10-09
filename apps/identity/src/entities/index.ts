/**
 * TypeORM entities owned by the identity service (user, credential, otp_challenge, session (refresh token family), shop_member, address).
 * Extend AppBaseEntity from @am/database. See docs/PLAN.md "Data model" and
 * docs/directives for the phase that introduces each one.
 */
export const entities: Array<new () => unknown> = [];
