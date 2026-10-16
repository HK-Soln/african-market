import type { ListQuery, ListSpec, Page } from '../list-query';
import type { ActorClaims } from './actor';
import type { ShopDto } from './shops';

/**
 * Seller verification (F1-03, decision T-28). Identity documents and selfies are captured on
 * Didit's hosted page and stay with Didit; we keep the session id, the status and a summary.
 * Admins see the documents through the gateway. The listing is approved by an admin.
 */

export type VerificationType = 'kyc' | 'trade_license';
export type VerificationStatus = 'started' | 'pending' | 'approved' | 'rejected' | 'expired';

/** What the provider found, without images: enough for an admin to decide. */
export interface KycSummary {
  /** The provider's decision: Approved, Declined, In Review, ... */
  providerStatus: string;
  documentType: string | null;
  issuingState: string | null;
  nationality: string | null;
  /** `YYYY-MM-DD`. */
  documentExpiry: string | null;
  fullName: string | null;
  idStatus: string | null;
  livenessStatus: string | null;
  livenessScore: number | null;
  faceMatchStatus: string | null;
  faceMatchScore: number | null;
  warnings: string[];
}

/** The images an admin can open for a KYC request; each is fetched fresh from the provider. */
export const KYC_DOCUMENT_KINDS = ['id_front', 'id_back', 'portrait', 'selfie'] as const;
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number];

export interface VerificationRequestDto {
  id: string;
  shopId: string;
  type: VerificationType;
  status: VerificationStatus;
  /** Admins only; null for the seller and for trade licences. */
  kyc: KycSummary | null;
  /** Trade licence: the document in the media service's private bucket (admins only). */
  documentMediaId: string | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Where a shop stands: what its owner sees, and what an admin reviews. */
export interface VerificationOverviewDto {
  shop: ShopDto;
  requests: VerificationRequestDto[];
}

/** The owner starts KYC: a hosted page to send them to. Resumes an unfinished one. */
export interface StartKycRequest {
  actor: ActorClaims;
  shopId: string;
  /** en, ar or fr: the language of the hosted page. */
  locale?: string;
  correlationId?: string;
}

export interface StartKycResponse {
  requestId: string;
  /** The provider's page; send the browser there. */
  url: string;
}

/** Asks the provider for the latest decision, when the owner comes back from the hosted page. */
export interface RefreshKycRequest {
  actor: ActorClaims;
  shopId: string;
  correlationId?: string;
}

/** A provider webhook as received: the exact body and its headers, for the signature check. */
export interface KycWebhookRequest {
  rawBody: string;
  headers: Record<string, string>;
  correlationId?: string;
}

export interface SubmitTradeLicenseRequest {
  actor: ActorClaims;
  shopId: string;
  legalName: string;
  licenseNumber: string;
  issuingAuthority: string;
  /** `YYYY-MM-DD`. */
  expiry: string;
  /** A `trade_license` upload, attached by the gateway. */
  documentMediaId: string;
  correlationId?: string;
}

/** The owner asks for the shop to be listed. */
export interface SubmitForVerificationRequest {
  actor: ActorClaims;
  shopId: string;
  correlationId?: string;
}

export interface GetVerificationRequest {
  actor: ActorClaims;
  shopId: string;
}

export type ListingDecision = 'approve' | 'reject' | 'suspend' | 'reinstate';

export interface DecideListingRequest {
  actor: ActorClaims;
  shopId: string;
  decision: ListingDecision;
  /** Required to reject or suspend; shown to the seller. */
  reason?: string;
  correlationId?: string;
}

export interface DecideTradeLicenseRequest {
  actor: ActorClaims;
  shopId: string;
  requestId: string;
  decision: 'approve' | 'reject';
  reason?: string;
  correlationId?: string;
}

/** Shops waiting for an admin, oldest first. */
export interface ListVerificationQueueRequest {
  actor: ActorClaims;
  query: ListQuery;
}

export const VERIFICATION_QUEUE_LIST_SPEC: ListSpec = {
  filters: {
    verificationStatus: {
      type: 'enum',
      values: ['pending', 'verified', 'rejected', 'suspended'],
      ops: ['eq', 'in'],
    },
    kycStatus: { type: 'enum', values: ['none', 'pending', 'passed', 'failed'], ops: ['eq', 'in'] },
  },
  sorts: ['submittedAt', 'name'],
  defaultSort: 'submittedAt',
};

export type VerificationQueuePage = Page<ShopDto>;

/** Admins only: one KYC image, for the gateway to stream. Every call is audit-logged. */
export interface KycDocumentAccessRequest {
  actor: ActorClaims;
  shopId: string;
  requestId: string;
  kind: KycDocumentKind;
  correlationId?: string;
}

export interface KycDocumentAccessResponse {
  /** A short-lived provider link, for the gateway only; it never reaches a browser. */
  url: string;
  filename: string;
}

export const VerificationErrors = {
  /** Only the shop's owner verifies their identity or submits the shop. */
  ownerOnly: 'VERIFICATION_OWNER_ONLY',
  adminOnly: 'VERIFICATION_ADMIN_ONLY',
  /** The shop is missing what a listing needs; `details.missing`. */
  incomplete: 'VERIFICATION_SHOP_INCOMPLETE',
  /** The listing cannot be approved before identity verification passed. */
  kycNotPassed: 'VERIFICATION_KYC_NOT_PASSED',
  /** This decision does not apply to the shop's current status. */
  invalidTransition: 'VERIFICATION_INVALID_TRANSITION',
  reasonRequired: 'VERIFICATION_REASON_REQUIRED',
  requestNotFound: 'VERIFICATION_REQUEST_NOT_FOUND',
  /** The provider has no such image (yet, or any more). */
  documentUnavailable: 'VERIFICATION_DOCUMENT_UNAVAILABLE',
  /** The webhook's signature or time did not check out. */
  webhookRejected: 'VERIFICATION_WEBHOOK_REJECTED',
  /** The identity provider could not be reached; try again. */
  providerUnavailable: 'VERIFICATION_PROVIDER_UNAVAILABLE',
} as const;

export type VerificationErrorCode = (typeof VerificationErrors)[keyof typeof VerificationErrors];
