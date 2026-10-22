import type { components } from '@am/api-client';
import { AUDIT_ACTIONS, type AuditAction } from '@am/contracts';

export type AuditEntry = components['schemas']['AuditEntryDto'];

/** The actions in groups, as the filter offers them. */
export const ACTION_GROUPS: Array<{ area: string; actions: AuditAction[] }> = [
  'shop',
  'product',
  'category',
  'emirate',
  'search',
  'document',
  'country',
  'user',
].map((area) => ({ area, actions: AUDIT_ACTIONS.filter((a) => a.startsWith(`${area}.`)) }));

/** The audit list query: newest first, of one action and one shop if asked. */
export function auditQuery(action: string, shopId: string | null, cursor?: string) {
  return {
    ...(action ? { 'filter[action]': action } : {}),
    ...(shopId ? { 'filter[shopId]': shopId } : {}),
    sort: '-occurredAt',
    limit: 50,
    ...(cursor ? { cursor } : {}),
  };
}

/** Where in the console the entry's subject is, if anywhere. */
export function subjectHref(entry: Pick<AuditEntry, 'subjectType' | 'subjectId' | 'shopId'>) {
  switch (entry.subjectType) {
    case 'shop':
      return `/shops/${entry.subjectId}`;
    case 'category':
      return '/categories';
    case 'emirate':
    case 'search':
      return '/emirates';
    case 'country':
      return '/countries';
    default:
      // A product or a document belongs to a shop.
      return entry.shopId ? `/shops/${entry.shopId}` : null;
  }
}
