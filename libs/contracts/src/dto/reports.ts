import type { ListQuery, ListSpec, Page } from '../list-query';
import type { ActorClaims, LocalizedString } from './actor';

/**
 * Reports on a public shop or product (F1-15). Anyone may send one, signed in or not; each is
 * kept by the service that owns what it is about (shops, catalog) and read in the admin console's
 * reports queue. The seller never learns who reported.
 */

export const REPORT_REASONS = [
  /** A scam, asks for money up front, impersonates someone. */
  'fraud',
  /** Fake branded goods. */
  'counterfeit',
  /** Something that may not be sold in the UAE. */
  'prohibited',
  /** Wrong prices, photos, address or description. */
  'misleading',
  /** Offensive words or pictures. */
  'offensive',
  /** The shop is closed or the product is no longer sold. */
  'unavailable',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** `resolved`: something was done about it; `dismissed`: nothing was wrong. */
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type ReportOutcome = Exclude<ReportStatus, 'open'>;
export const REPORT_OUTCOMES = ['resolved', 'dismissed'] as const satisfies ReportOutcome[];

export const REPORT_DETAILS_MAX = 1000;
/** "Other" says what is wrong in at least this many characters. */
export const REPORT_OTHER_MIN = 10;

interface ReportSubmission {
  reason: ReportReason;
  details?: string;
  /** The app's random visitor id: one open report per visitor and listing. */
  sessionId: string;
  /** The signed-in person, from the access token; never from the body. */
  userId?: string;
  correlationId?: string;
}

export interface SubmitShopReportRequest extends ReportSubmission {
  shopId: string;
}

export interface SubmitProductReportRequest extends ReportSubmission {
  productId: string;
}

export interface SubmitReportResponse {
  /** False when the visitor already had an open report on it (nothing new was kept). */
  recorded: boolean;
}

interface ReportBase {
  id: string;
  shopId: string;
  reason: ReportReason;
  details: string | null;
  /** Sent while signed in. Who it was is never shown. */
  signedIn: boolean;
  status: ReportStatus;
  /** ISO-8601. */
  createdAt: string;
  decidedAt: string | null;
  /** The admin's note, for other admins only. */
  decisionNote: string | null;
}

export interface ShopReportDto extends ReportBase {
  shopName: string;
  shopSlug: string;
}

export interface ProductReportDto extends ReportBase {
  productId: string;
  productTitle: LocalizedString;
}

export const REPORT_LIST_SPEC: ListSpec = {
  filters: {
    status: { type: 'enum', values: REPORT_STATUSES, ops: ['eq', 'in'] },
    reason: { type: 'enum', values: REPORT_REASONS, ops: ['eq', 'in'] },
    shopId: { type: 'uuid' },
  },
  sorts: ['createdAt'],
  // Oldest first: the one waiting longest.
  defaultSort: 'createdAt',
};

export interface ListReportsRequest {
  actor: ActorClaims;
  query: ListQuery;
}

export type ShopReportPage = Page<ShopReportDto>;
export type ProductReportPage = Page<ProductReportDto>;

/** Admins: closes the report, and every other open report on the same shop or product. */
export interface DecideReportRequest {
  actor: ActorClaims;
  reportId: string;
  outcome: ReportOutcome;
  note?: string;
  correlationId?: string;
}

export interface DecideReportResponse {
  /** How many open reports were closed, this one included. */
  closed: number;
}

export const ReportErrors = {
  validationFailed: 'REPORT_VALIDATION_FAILED',
  /** No public shop or product with that id. */
  listingNotFound: 'REPORT_LISTING_NOT_FOUND',
  notFound: 'REPORT_NOT_FOUND',
  /** It was decided already. */
  alreadyClosed: 'REPORT_ALREADY_CLOSED',
  adminOnly: 'REPORT_ADMIN_ONLY',
} as const;
export type ReportErrorCode = (typeof ReportErrors)[keyof typeof ReportErrors];
