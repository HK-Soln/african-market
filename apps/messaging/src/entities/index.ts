/**
 * TypeORM entities owned by the messaging service (conversation, conversation_participant, message).
 * Extend AppBaseEntity from @am/database. See docs/PLAN.md "Data model" and
 * docs/directives for the phase that introduces each one.
 */
export const entities: Array<new () => unknown> = [];
