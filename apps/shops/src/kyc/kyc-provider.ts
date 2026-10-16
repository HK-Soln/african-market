import type { KycDocumentKind, KycSummary } from '@am/contracts';

/** Where a verification stands at the provider, in our terms. */
export type KycOutcome = 'pending' | 'passed' | 'failed' | 'expired';

export interface KycSession {
  sessionId: string;
  /** The hosted page to send the seller to. */
  url: string;
}

export interface KycDecision {
  outcome: KycOutcome;
  summary: KycSummary;
  /** Short-lived links to the images, for the gateway to stream to an admin; never stored. */
  documents: Partial<Record<KycDocumentKind, string>>;
}

/** A webhook that passed its signature check: which session changed. */
export interface KycWebhookEvent {
  sessionId: string;
  /** Our verification request id, sent as `vendor_data` when the session was made. */
  requestId: string | null;
  eventId: string | null;
}

/**
 * An identity verification provider with a hosted page (decision T-28). Documents and selfies
 * stay with the provider; we keep its session id, its status and a summary.
 */
export interface KycProvider {
  readonly name: 'didit' | 'fake';
  createSession(input: {
    requestId: string;
    callbackUrl: string;
    locale?: string;
  }): Promise<KycSession>;
  getDecision(sessionId: string): Promise<KycDecision>;
  /** Deletes the session and everything the provider holds for it. Already gone is fine. */
  deleteSession(sessionId: string): Promise<void>;
  /** Checks a webhook's signature and time; undefined when it does not check out. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): KycWebhookEvent | undefined;
}

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

/** Thrown when the provider cannot be reached or answers with an error. */
export class KycProviderError extends Error {}
