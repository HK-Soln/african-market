import { createHmac } from 'node:crypto';
import { DiditKycProvider, outcomeOf, summarise } from './didit-kyc-provider';
import { KycProviderError } from './kyc-provider';

const settings = {
  apiUrl: 'https://verification.didit.me/',
  apiKey: 'test-key',
  webhookSecret: 'test-webhook-secret',
  workflowId: 'wf-1',
};

/** Didit's decision, cut down to the fields we read (shape from docs.didit.me). */
export const decision = {
  session_id: 'sess-1',
  status: 'Approved',
  vendor_data: 'req-1',
  id_verifications: [
    {
      status: 'Approved',
      document_type: 'Identity Card',
      document_number: '784-1990-1234567-1',
      first_name: 'Adaeze',
      last_name: 'Okafor',
      full_name: 'Adaeze Okafor',
      date_of_birth: '1990-05-01',
      expiration_date: '2029-05-01',
      issuing_state: 'ARE',
      nationality: 'NGA',
      front_image: 'https://didit.example/front.jpg?sig=1',
      back_image: 'https://didit.example/back.jpg?sig=1',
      portrait_image: 'https://didit.example/portrait.jpg?sig=1',
      warnings: [{ risk: 'DOCUMENT_EXPIRES_SOON' }],
    },
  ],
  liveness_checks: [
    {
      status: 'Approved',
      method: 'ACTIVE_3D',
      score: 97.5,
      reference_image: 'https://didit.example/selfie.jpg?sig=1',
    },
  ],
  face_matches: [{ status: 'Approved', score: 91.2 }],
};

const sign = (data: string, secret = settings.webhookSecret) =>
  createHmac('sha256', secret).update(data, 'utf8').digest('hex');
const now = () => String(Math.floor(Date.now() / 1000));

describe('outcomeOf', () => {
  it.each([
    ['Approved', 'passed'],
    ['Declined', 'failed'],
    ['Abandoned', 'expired'],
    ['Expired', 'expired'],
    ['Kyc Expired', 'expired'],
    ['In Review', 'pending'],
    ['In Progress', 'pending'],
    ['Not Started', 'pending'],
    ['Resubmitted', 'pending'],
  ])('%s → %s', (status, outcome) => expect(outcomeOf(status)).toBe(outcome));
});

describe('summarise', () => {
  it('keeps what an admin needs and leaves out the document number and birth date', () => {
    const { summary, documents } = summarise(decision);
    expect(summary).toEqual({
      providerStatus: 'Approved',
      documentType: 'Identity Card',
      issuingState: 'ARE',
      nationality: 'NGA',
      documentExpiry: '2029-05-01',
      fullName: 'Adaeze Okafor',
      idStatus: 'Approved',
      livenessStatus: 'Approved',
      livenessScore: 97.5,
      faceMatchStatus: 'Approved',
      faceMatchScore: 91.2,
      warnings: ['DOCUMENT_EXPIRES_SOON'],
    });
    expect(JSON.stringify(summary)).not.toContain('784-1990');
    expect(JSON.stringify(summary)).not.toContain('1990-05-01');
    expect(documents).toEqual({
      id_front: 'https://didit.example/front.jpg?sig=1',
      id_back: 'https://didit.example/back.jpg?sig=1',
      portrait: 'https://didit.example/portrait.jpg?sig=1',
      selfie: 'https://didit.example/selfie.jpg?sig=1',
    });
  });

  it('copes with a decision whose checks have not run yet', () => {
    const { summary, documents } = summarise({ status: 'In Progress', id_verifications: null });
    expect(summary).toMatchObject({ providerStatus: 'In Progress', fullName: null, warnings: [] });
    expect(documents).toEqual({});
  });
});

describe('DiditKycProvider', () => {
  /** A fetch that records requests and answers with the given status and body. */
  const fakeHttp = (status: number, body: unknown) => {
    const calls: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: unknown;
    }> = [];
    const http = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method!,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { http, calls };
  };

  it('creates a hosted session tied to our request, with the key only in a header', async () => {
    const { http, calls } = fakeHttp(201, {
      session_id: 'sess-1',
      url: 'https://verify.didit.me/session/abc',
      status: 'Not Started',
    });
    const provider = new DiditKycProvider(settings, http);
    const session = await provider.createSession({
      requestId: 'req-1',
      callbackUrl: 'https://seller.test/en/shops/1/verification',
      locale: 'ar',
    });
    expect(session).toEqual({ sessionId: 'sess-1', url: 'https://verify.didit.me/session/abc' });
    expect(calls[0]).toEqual({
      url: 'https://verification.didit.me/v3/session/',
      method: 'POST',
      headers: { 'x-api-key': 'test-key', 'content-type': 'application/json' },
      body: {
        workflow_id: 'wf-1',
        vendor_data: 'req-1',
        callback: 'https://seller.test/en/shops/1/verification',
        language: 'ar',
      },
    });
  });

  it('reads a decision, and deletes a session (already gone is fine)', async () => {
    const read = fakeHttp(200, decision);
    const result = await new DiditKycProvider(settings, read.http).getDecision('sess-1');
    expect(read.calls[0].url).toBe('https://verification.didit.me/v3/session/sess-1/decision/');
    expect(result.outcome).toBe('passed');

    const gone = fakeHttp(404, { detail: 'Not found' });
    await new DiditKycProvider(settings, gone.http).deleteSession('sess-1');
    expect(gone.calls[0]).toMatchObject({
      url: 'https://verification.didit.me/v3/session/sess-1/delete/',
      method: 'DELETE',
    });
  });

  it('reports errors without the response body, which may hold personal data', async () => {
    const { http } = fakeHttp(500, { detail: 'Adaeze Okafor 784-1990' });
    const error = await new DiditKycProvider(settings, http)
      .getDecision('sess-1')
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(KycProviderError);
    expect((error as Error).message).not.toContain('Adaeze');
  });

  describe('webhooks', () => {
    const provider = new DiditKycProvider(settings);
    const body = JSON.stringify({
      event_id: 'evt-1',
      session_id: 'sess-1',
      status: 'Approved',
      vendor_data: 'req-1',
      webhook_type: 'status.updated',
    });

    it('accepts one signed over the raw body, or over the sorted JSON, within five minutes', () => {
      expect(
        provider.verifyWebhook(body, { 'x-signature': sign(body), 'x-timestamp': now() }),
      ).toEqual({
        sessionId: 'sess-1',
        requestId: 'req-1',
        eventId: 'evt-1',
      });
      const canonical =
        '{"event_id":"evt-1","session_id":"sess-1","status":"Approved","vendor_data":"req-1","webhook_type":"status.updated"}';
      expect(
        provider.verifyWebhook(body, { 'x-signature-v2': sign(canonical), 'x-timestamp': now() }),
      ).toBeDefined();
    });

    it('refuses a wrong secret, a changed body, and an old or missing timestamp', () => {
      expect(
        provider.verifyWebhook(body, { 'x-signature': sign(body, 'other'), 'x-timestamp': now() }),
      ).toBeUndefined();
      const changed = body.replace('Approved', 'Declined');
      expect(
        provider.verifyWebhook(changed, { 'x-signature': sign(body), 'x-timestamp': now() }),
      ).toBeUndefined();
      const old = String(Math.floor(Date.now() / 1000) - 600);
      expect(
        provider.verifyWebhook(body, { 'x-signature': sign(body), 'x-timestamp': old }),
      ).toBeUndefined();
      expect(provider.verifyWebhook(body, { 'x-signature': sign(body) })).toBeUndefined();
      expect(
        provider.verifyWebhook('not json', {
          'x-signature': sign('not json'),
          'x-timestamp': now(),
        }),
      ).toBeUndefined();
    });
  });
});
