/**
 * TypeORM entities owned by the catalog service (category, product, variant, branch_listing).
 * Extend AppBaseEntity from @am/database. See docs/PLAN.md "Data model" and
 * docs/directives for the phase that introduces each one.
 */
export const entities: Array<new () => unknown> = [];
