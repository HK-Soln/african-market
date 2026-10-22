import type { components } from '@am/api-client';

export type AdminShop = components['schemas']['SellerShopDto'];
export type VerificationOverview = components['schemas']['VerificationOverviewDto'];
export type VerificationRequest = components['schemas']['VerificationRequestDto'];
export type KycSummary = components['schemas']['KycSummaryDto'];
export type ListingDecision = components['schemas']['DecideListingBody']['decision'];

export const QUEUE_VIEWS = ['pending', 'verified', 'rejected', 'suspended', 'all'] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export interface QueueQuery {
  'filter[verificationStatus]'?: string;
  'filter[search][like]'?: string;
  sort: string;
  limit: number;
  cursor?: string;
}

/**
 * The list query for a view of the shops. Waiting shops come oldest first, so none is left
 * behind; the other views show the latest decisions first, and a search across every shop goes
 * by name.
 */
export function queueQuery(view: QueueView, search: string, cursor?: string): QueueQuery {
  const text = search.trim();
  return {
    ...(view === 'all' ? {} : { 'filter[verificationStatus]': view }),
    ...(text ? { 'filter[search][like]': text } : {}),
    sort: view === 'pending' ? 'submittedAt' : view === 'all' && text ? 'name' : '-submittedAt',
    limit: 20,
    ...(cursor ? { cursor } : {}),
  };
}

/** What an admin may do with a listing in this status (the shops service checks again). */
export function listingActions(status: string): ListingDecision[] {
  switch (status) {
    case 'pending':
      return ['approve', 'reject'];
    case 'verified':
      return ['suspend'];
    case 'suspended':
      return ['reinstate'];
    default:
      return [];
  }
}

/** Rejecting and suspending tell the seller why. */
export const needsReason = (decision: ListingDecision | 'approve' | 'reject') =>
  decision === 'reject' || decision === 'suspend';

/** The newest request of a kind, or null. */
export function latest(
  requests: VerificationRequest[],
  type: 'kyc' | 'trade_license',
): VerificationRequest | null {
  return (
    requests
      .filter((r) => r.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export type KycConcern = 'notApproved' | 'documentExpired' | 'idCheck' | 'liveness' | 'faceMatch';

/**
 * What in the provider's findings deserves a second look before approving: a decision other
 * than Approved, an expired document, or a check that did not pass. `today` is `YYYY-MM-DD`.
 */
export function kycConcerns(kyc: KycSummary, today: string): KycConcern[] {
  const concerns: KycConcern[] = [];
  const failed = (status: string | null | undefined) => Boolean(status) && status !== 'Approved';
  if (kyc.providerStatus !== 'Approved') concerns.push('notApproved');
  if (kyc.documentExpiry && kyc.documentExpiry < today) concerns.push('documentExpired');
  if (failed(kyc.idStatus)) concerns.push('idCheck');
  if (failed(kyc.livenessStatus)) concerns.push('liveness');
  if (failed(kyc.faceMatchStatus)) concerns.push('faceMatch');
  return concerns;
}

/** A licence that has expired, expires within 30 days, or is fine. Dates are `YYYY-MM-DD`. */
export function licenseExpiry(expiry: string | null | undefined, today: string) {
  if (!expiry) return null;
  if (expiry < today) return 'expired';
  const days = (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 30 ? 'soon' : 'valid';
}

/** Today in Dubai, `YYYY-MM-DD`. */
export const dubaiToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(now);
