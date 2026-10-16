import { randomUUID } from 'node:crypto';
import { KycDecision, KycProvider, KycSession, KycWebhookEvent } from './kyc-provider';

/**
 * Local work and tests (refused in staging and production): every session is approved at once,
 * and "returning" from the hosted page goes straight back to the seller app. The decision says it
 * is a test, so nobody can mistake it for a real check.
 */
export class FakeKycProvider implements KycProvider {
  readonly name = 'fake' as const;
  readonly deleted: string[] = [];
  /** Set by tests to make the next decisions come out differently. */
  outcome: KycDecision['outcome'] = 'passed';

  async createSession(input: { requestId: string; callbackUrl: string }): Promise<KycSession> {
    const url = new URL(input.callbackUrl);
    url.searchParams.set('kyc', 'fake');
    return { sessionId: `fake-${randomUUID()}`, url: url.toString() };
  }

  async getDecision(): Promise<KycDecision> {
    const status = {
      passed: 'Approved',
      failed: 'Declined',
      expired: 'Expired',
      pending: 'In Review',
    }[this.outcome];
    return {
      outcome: this.outcome,
      summary: {
        providerStatus: status,
        documentType: 'Identity Card',
        issuingState: 'ARE',
        nationality: 'NGA',
        documentExpiry: '2030-01-01',
        fullName: 'Test Seller (fake provider)',
        idStatus: status,
        livenessStatus: status,
        livenessScore: 99,
        faceMatchStatus: status,
        faceMatchScore: 99,
        warnings: ['FAKE_PROVIDER'],
      },
      documents: {},
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.deleted.push(sessionId);
  }

  verifyWebhook(): KycWebhookEvent | undefined {
    return undefined;
  }
}
