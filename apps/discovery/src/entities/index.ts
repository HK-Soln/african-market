/**
 * TypeORM entities owned by the discovery service (search_branch, search_product (read model only; rebuilt from events)).
 * Extend AppBaseEntity from @am/database. See docs/PLAN.md "Data model" and
 * docs/directives for the phase that introduces each one.
 */
export const entities: Array<new () => unknown> = [];
