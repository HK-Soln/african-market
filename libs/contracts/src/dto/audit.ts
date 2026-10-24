import type { ListQuery, ListSpec, Page } from '../list-query';
import type { ActorClaims } from './actor';

/**
 * The admin audit log (F1-14, decision T-42). Each service publishes `audit.recorded` in the same
 * transaction as an admin's action; identity, which owns admin accounts, keeps the log. Rows are
 * only ever added.
 */

/** Everything recorded, by the service that records it. */
export const AUDIT_ACTIONS = [
  // shops
  'shop.listing_approved',
  'shop.listing_rejected',
  'shop.listing_suspended',
  'shop.listing_reinstated',
  'shop.license_approved',
  'shop.license_rejected',
  'shop.kyc_document_viewed',
  'shop.report_resolved',
  'shop.report_dismissed',
  // catalog
  'product.approved',
  'product.rejected',
  'product.report_resolved',
  'product.report_dismissed',
  'category.created',
  'category.updated',
  // discovery
  'emirate.search_opened',
  'emirate.search_closed',
  'search.rebuilt',
  // media
  'document.downloaded',
  // identity
  'country.updated',
  'user.role_granted',
  'user.role_revoked',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_SUBJECTS = [
  'shop',
  'product',
  'category',
  'emirate',
  'search',
  'media',
  'country',
  'user',
] as const;
export type AuditSubject = (typeof AUDIT_SUBJECTS)[number];

/** Small facts about the action: a reason, a document kind, what changed. Never personal data. */
export type AuditDetails = Record<string, string | number | boolean | null>;

/** What a service records about one admin action. */
export interface AuditRecord {
  /** The admin; null when the action was not a person's (a command run on the server). */
  actorId: string | null;
  action: AuditAction;
  subjectType: AuditSubject;
  /** The subject's id, or its code for an emirate or a country. */
  subjectId: string;
  /** The shop concerned, so a shop's whole history can be listed. */
  shopId: string | null;
  details: AuditDetails;
}

export interface AuditEntryDto extends AuditRecord {
  id: string;
  /** The service that recorded it. */
  source: string;
  /** The admin's name now, or null (no name, a deleted account, or no person). */
  actorName: string | null;
  /** The request it came from, to find it in the logs. */
  correlationId: string | null;
  /** ISO-8601. */
  occurredAt: string;
}

export const AUDIT_LIST_SPEC: ListSpec = {
  filters: {
    action: { type: 'enum', values: AUDIT_ACTIONS, ops: ['eq', 'in'] },
    subjectType: { type: 'enum', values: AUDIT_SUBJECTS, ops: ['eq', 'in'] },
    subjectId: { type: 'string' },
    shopId: { type: 'uuid' },
    actorId: { type: 'uuid' },
    occurredAt: { type: 'date', ops: ['gte', 'lt'] },
  },
  sorts: ['occurredAt'],
  defaultSort: '-occurredAt',
  defaultLimit: 50,
};

export interface ListAuditRequest {
  actor: ActorClaims;
  query: ListQuery;
}

export type AuditPage = Page<AuditEntryDto>;
