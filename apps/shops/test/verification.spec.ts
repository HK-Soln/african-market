import { createHmac, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  ActorClaims,
  parseListQuery,
  ShopErrors,
  VERIFICATION_QUEUE_LIST_SPEC,
  VerificationErrors,
} from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { Shop, VerificationAudit, VerificationRequest } from '../src/entities';
import { DiditKycProvider } from '../src/kyc/didit-kyc-provider';
import { FakeKycProvider } from '../src/kyc/fake-kyc-provider';
import { VerificationService } from '../src/kyc/verification.service';
import { BranchesService } from '../src/shops/branches.service';
import { ShopsService } from '../src/shops/shops.service';
import { createTestDatabase, TestDatabase } from './support/test-database';

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

const SELLER_APP = 'https://seller.test';
const person = (roles = ['customer']): ActorClaims => ({ userId: randomUUID(), roles, shops: [] });
const admin = () => person(['customer', 'admin']);

describe('seller verification (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let shops: ShopsService;
  let branches: BranchesService;
  let fake: FakeKycProvider;
  let verification: VerificationService;
  const outbox = new OutboxService('shops');

  const auditOf = async (shopId: string) =>
    (
      await db
        .getRepository(VerificationAudit)
        .find({ where: { shopId }, order: { createdAt: 'ASC' } })
    ).map((a) => a.action);

  /** A shop ready to be listed, apart from what each test leaves out. */
  async function readyShop(options: { branch?: boolean; contact?: boolean } = {}) {
    const owner = person();
    const shop = await shops.create({
      actor: owner,
      name: `Verify ${randomUUID().slice(0, 6)}`,
      ...(options.contact === false ? {} : { contactWhatsapp: '+971501234567' }),
    });
    if (options.branch !== false) {
      await branches.upsert({
        actor: owner,
        shopId: shop.id,
        name: 'Main',
        emirate: 'SHJ',
        location: { lat: 25.34, lng: 55.42 },
      });
    }
    return { owner, shop };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    shops = new ShopsService(db, outbox);
    branches = new BranchesService(db, outbox);
    fake = new FakeKycProvider();
    verification = new VerificationService(db, outbox, fake, SELLER_APP);
  }, 60_000);

  beforeEach(() => {
    fake.outcome = 'passed';
  });

  afterAll(() => testDb?.drop());

  describe('identity (KYC)', () => {
    it('is started by the owner only, and comes back to the seller app', async () => {
      const { owner, shop } = await readyShop();
      const manager = {
        ...person(['customer', 'seller']),
        shops: [{ shopId: shop.id, role: 'manager' as const }],
      };
      expect(await codeOf(verification.startKyc({ actor: manager, shopId: shop.id }))).toBe(
        VerificationErrors.ownerOnly,
      );
      expect(await codeOf(verification.startKyc({ actor: person(), shopId: shop.id }))).toBe(
        ShopErrors.notFound,
      );

      const started = await verification.startKyc({ actor: owner, shopId: shop.id, locale: 'ar' });
      expect(started.url).toBe(`${SELLER_APP}/ar/shops/${shop.id}/verification?kyc=fake`);
      // Starting again resumes the same request.
      expect((await verification.startKyc({ actor: owner, shopId: shop.id })).requestId).toBe(
        started.requestId,
      );

      const overview = await verification.get({ actor: owner, shopId: shop.id });
      expect(overview.shop.kycStatus).toBe('pending');
      expect(overview.requests).toEqual([
        expect.objectContaining({ type: 'kyc', status: 'started', kyc: null }),
      ]);
    });

    it('takes the provider’s decision when the owner comes back, and shows details to admins only', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      const mine = await verification.refreshKyc({ actor: owner, shopId: shop.id });
      expect(mine.shop.kycStatus).toBe('passed');
      expect(mine.requests[0]).toMatchObject({ status: 'approved', kyc: null });

      const theirs = await verification.get({ actor: admin(), shopId: shop.id });
      expect(theirs.requests[0].kyc).toMatchObject({
        providerStatus: 'Approved',
        fullName: 'Test Seller (fake provider)',
      });
      expect(await auditOf(shop.id)).toEqual(['kyc_started', 'kyc_result']);
      // Passed is final: no second verification.
      expect(await codeOf(verification.startKyc({ actor: owner, shopId: shop.id }))).toBe(
        VerificationErrors.invalidTransition,
      );
    });

    it('lets the owner start again after a declined or abandoned check', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      fake.outcome = 'failed';
      expect(
        (await verification.refreshKyc({ actor: owner, shopId: shop.id })).shop.kycStatus,
      ).toBe('failed');
      const again = await verification.startKyc({ actor: owner, shopId: shop.id });
      fake.outcome = 'expired';
      const back = await verification.refreshKyc({ actor: owner, shopId: shop.id });
      expect(back.shop.kycStatus).toBe('none');
      expect(back.requests.map((r) => [r.id === again.requestId, r.status])).toEqual([
        [true, 'expired'],
        [false, 'rejected'],
      ]);
    });
  });

  describe('the listing', () => {
    it('cannot be submitted until it has a branch, a contact and a started KYC', async () => {
      const { owner, shop } = await readyShop({ branch: false, contact: false });
      const error = verification.submit({ actor: owner, shopId: shop.id });
      await expect(error).rejects.toMatchObject({
        error: {
          code: VerificationErrors.incomplete,
          details: { missing: ['branch', 'contact', 'kyc'] },
        },
      });
    });

    it('goes pending, then an admin approves it once KYC passed, and the change is announced', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      const submitted = await verification.submit({ actor: owner, shopId: shop.id });
      expect(submitted.shop).toMatchObject({
        verificationStatus: 'pending',
        submittedAt: expect.any(String),
      });

      expect(
        await codeOf(
          verification.decideListing({ actor: owner, shopId: shop.id, decision: 'approve' }),
        ),
      ).toBe(VerificationErrors.adminOnly);
      expect(
        await codeOf(
          verification.decideListing({ actor: admin(), shopId: shop.id, decision: 'approve' }),
        ),
      ).toBe(VerificationErrors.kycNotPassed);
      await verification.refreshKyc({ actor: owner, shopId: shop.id });
      const approved = await verification.decideListing({
        actor: admin(),
        shopId: shop.id,
        decision: 'approve',
      });
      expect(approved.shop.verificationStatus).toBe('verified');
      // Now it is public.
      expect((await shops.getBySlug({ slug: shop.slug })).id).toBe(shop.id);

      const events = (
        await db.getRepository(OutboxMessage).findBy({ name: 'shop.verified' })
      ).filter((e) => (e.envelope as { payload: { shopId: string } }).payload.shopId === shop.id);
      expect(events.map((e) => (e.envelope as { payload: unknown }).payload)).toEqual([
        {
          shopId: shop.id,
          verificationStatus: 'verified',
          checkoutEnabled: false,
          codEnabled: false,
        },
      ]);
      expect(await auditOf(shop.id)).toEqual([
        'kyc_started',
        'submitted',
        'kyc_result',
        'listing_approved',
      ]);
    });

    it('needs a reason to reject or suspend, and follows the allowed steps only', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      await verification.refreshKyc({ actor: owner, shopId: shop.id });
      await verification.submit({ actor: owner, shopId: shop.id });

      expect(
        await codeOf(
          verification.decideListing({ actor: admin(), shopId: shop.id, decision: 'reject' }),
        ),
      ).toBe(VerificationErrors.reasonRequired);
      const rejected = await verification.decideListing({
        actor: admin(),
        shopId: shop.id,
        decision: 'reject',
        reason: 'Add a photo of the shop front',
      });
      expect(rejected.shop).toMatchObject({
        verificationStatus: 'rejected',
        verificationReason: 'Add a photo of the shop front',
      });
      expect(
        await codeOf(
          verification.decideListing({
            actor: admin(),
            shopId: shop.id,
            decision: 'suspend',
            reason: 'x',
          }),
        ),
      ).toBe(VerificationErrors.invalidTransition);

      // The seller fixes it and submits again; then it is approved, suspended and reinstated.
      await verification.submit({ actor: owner, shopId: shop.id });
      await verification.decideListing({ actor: admin(), shopId: shop.id, decision: 'approve' });
      const suspended = await verification.decideListing({
        actor: admin(),
        shopId: shop.id,
        decision: 'suspend',
        reason: 'Complaints',
      });
      expect(suspended.shop.verificationStatus).toBe('suspended');
      expect(await codeOf(shops.getBySlug({ slug: shop.slug }))).toBe(ShopErrors.notFound);
      const back = await verification.decideListing({
        actor: admin(),
        shopId: shop.id,
        decision: 'reinstate',
      });
      expect(back.shop).toMatchObject({ verificationStatus: 'verified', verificationReason: null });
    });

    it('shows admins the queue, oldest first', async () => {
      const first = await readyShop();
      await verification.startKyc({ actor: first.owner, shopId: first.shop.id });
      await verification.submit({ actor: first.owner, shopId: first.shop.id });
      const second = await readyShop();
      await verification.startKyc({ actor: second.owner, shopId: second.shop.id });
      await verification.submit({ actor: second.owner, shopId: second.shop.id });

      const query = parseListQuery(
        { 'filter[verificationStatus]': 'pending', limit: '100' },
        VERIFICATION_QUEUE_LIST_SPEC,
      );
      const page = await verification.queue({ actor: admin(), query });
      const ids = page.items.map((s) => s.id);
      expect(ids.indexOf(first.shop.id)).toBeLessThan(ids.indexOf(second.shop.id));
      expect(await codeOf(verification.queue({ actor: first.owner, query }))).toBe(
        VerificationErrors.adminOnly,
      );

      // Admins find a shop by part of its name or slug.
      const found = await verification.queue({
        actor: admin(),
        query: parseListQuery(
          { 'filter[search][like]': second.shop.slug.slice(-6) },
          VERIFICATION_QUEUE_LIST_SPEC,
        ),
      });
      expect(found.items.map((s) => s.id)).toContain(second.shop.id);
    });
  });

  describe('trade licence', () => {
    it('is submitted by the owner and decided by an admin, a newer one replacing a waiting one', async () => {
      const { owner, shop } = await readyShop();
      const licence = {
        actor: owner,
        shopId: shop.id,
        legalName: 'Mama Africa General Trading LLC',
        licenseNumber: 'CN-1234567',
        issuingAuthority: 'Dubai DET',
        expiry: '2027-12-31',
      };
      await verification.submitTradeLicense({ ...licence, documentMediaId: randomUUID() });
      const second = await verification.submitTradeLicense({
        ...licence,
        documentMediaId: randomUUID(),
      });
      expect(second.shop.tradeLicense).toEqual({
        legalName: licence.legalName,
        number: 'CN-1234567',
        issuingAuthority: 'Dubai DET',
        expiry: '2027-12-31',
      });
      expect(second.requests.map((r) => r.status)).toEqual(['pending', 'rejected']);

      const pending = second.requests[0];
      expect(
        await codeOf(
          verification.decideTradeLicense({
            actor: admin(),
            shopId: shop.id,
            requestId: pending.id,
            decision: 'reject',
          }),
        ),
      ).toBe(VerificationErrors.reasonRequired);
      const decided = await verification.decideTradeLicense({
        actor: admin(),
        shopId: shop.id,
        requestId: pending.id,
        decision: 'approve',
      });
      expect(decided.requests[0]).toMatchObject({
        status: 'approved',
        documentMediaId: expect.any(String),
      });
    });
  });

  describe('the seller named on the shop page', () => {
    it('comes only from the latest licence an admin approved, until it expires', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      await verification.submit({ actor: owner, shopId: shop.id });
      await verification.refreshKyc({ actor: owner, shopId: shop.id });
      await verification.decideListing({ actor: admin(), shopId: shop.id, decision: 'approve' });
      const seller = async () => (await shops.getBySlug({ slug: shop.slug })).licensedSeller;
      expect(await seller()).toBeNull();

      const licence = {
        actor: owner,
        shopId: shop.id,
        legalName: 'Mama Africa General Trading LLC',
        licenseNumber: 'CN-1234567',
        issuingAuthority: 'Dubai DET',
        expiry: '2099-12-31',
      };
      const first = await verification.submitTradeLicense({
        ...licence,
        documentMediaId: randomUUID(),
      });
      const pendingLicence = (overview: typeof first) =>
        overview.requests.find((r) => r.type === 'trade_license' && r.status === 'pending')!;
      // Entered but not checked: not shown.
      expect(await seller()).toBeNull();
      await verification.decideTradeLicense({
        actor: admin(),
        shopId: shop.id,
        requestId: pendingLicence(first).id,
        decision: 'approve',
      });
      expect(await seller()).toEqual({
        legalName: 'Mama Africa General Trading LLC',
        licenseNumber: 'CN-1234567',
        issuingAuthority: 'Dubai DET',
      });

      // A newer licence waiting for review replaces the details, so nothing is shown meanwhile.
      const second = await verification.submitTradeLicense({
        ...licence,
        licenseNumber: 'CN-7654321',
        documentMediaId: randomUUID(),
      });
      expect(await seller()).toBeNull();

      await verification.decideTradeLicense({
        actor: admin(),
        shopId: shop.id,
        requestId: pendingLicence(second).id,
        decision: 'approve',
      });
      expect((await seller())?.licenseNumber).toBe('CN-7654321');
      // The same by id, as a product's page asks.
      expect((await shops.getBySlug({ shopId: shop.id })).licensedSeller?.licenseNumber).toBe(
        'CN-7654321',
      );

      await db.getRepository(Shop).update({ id: shop.id }, { licenseExpiry: '2020-01-01' });
      expect(await seller()).toBeNull();
    });
  });

  describe('with Didit (its network stubbed)', () => {
    const secret = 'webhook-secret';
    const sign = (data: string) => createHmac('sha256', secret).update(data, 'utf8').digest('hex');
    const decision = (status: string) => ({
      session_id: 'unused',
      status,
      id_verifications: [
        {
          status,
          full_name: 'Adaeze Okafor',
          front_image: 'https://didit.example/front.jpg?sig=1',
        },
      ],
      liveness_checks: [
        { status, score: 98, reference_image: 'https://didit.example/selfie.jpg?sig=1' },
      ],
      face_matches: [{ status, score: 90 }],
    });

    function didit() {
      let status = 'In Progress';
      let sessions = 0;
      const http = (async (url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          sessions++;
          return new Response(
            JSON.stringify({
              session_id: `sess-${randomUUID()}`,
              url: 'https://verify.didit.me/x',
            }),
            { status: 201 },
          );
        }
        if (url.endsWith('/decision/'))
          return new Response(JSON.stringify(decision(status)), { status: 200 });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;
      const provider = new DiditKycProvider(
        {
          apiUrl: 'https://verification.didit.me',
          apiKey: 'k',
          webhookSecret: secret,
          workflowId: 'wf',
        },
        http,
      );
      return {
        service: new VerificationService(db, outbox, provider, SELLER_APP),
        setStatus: (next: string) => (status = next),
        sessions: () => sessions,
      };
    }

    it('takes a signed webhook, fetches the decision itself, and refuses an unsigned one', async () => {
      const { service, setStatus } = didit();
      const { owner, shop } = await readyShop();
      const { requestId } = await service.startKyc({ actor: owner, shopId: shop.id });
      const request = await db
        .getRepository(VerificationRequest)
        .findOneByOrFail({ id: requestId });

      setStatus('Approved');
      // The body says Declined, but only the signature and the session id are trusted.
      const body = JSON.stringify({
        session_id: request.providerSessionId,
        status: 'Declined',
        vendor_data: requestId,
      });
      const headers = {
        'x-signature': sign(body),
        'x-timestamp': String(Math.floor(Date.now() / 1000)),
      };
      expect(await service.webhook({ rawBody: body, headers })).toEqual({ accepted: true });
      expect((await verification.get({ actor: owner, shopId: shop.id })).shop.kycStatus).toBe(
        'passed',
      );

      expect(
        await codeOf(
          service.webhook({ rawBody: body, headers: { ...headers, 'x-signature': sign('other') } }),
        ),
      ).toBe(VerificationErrors.webhookRejected);
      const unknown = JSON.stringify({ session_id: 'sess-unknown' });
      expect(
        await service.webhook({
          rawBody: unknown,
          headers: { 'x-signature': sign(unknown), 'x-timestamp': headers['x-timestamp'] },
        }),
      ).toEqual({
        accepted: false,
      });
    });

    it('gives admins a fresh link to an identity image, and logs that they looked', async () => {
      const { service, setStatus } = didit();
      const { owner, shop } = await readyShop();
      const { requestId } = await service.startKyc({ actor: owner, shopId: shop.id });
      setStatus('Approved');
      const reviewer = admin();

      expect(
        await codeOf(
          service.kycDocument({ actor: owner, shopId: shop.id, requestId, kind: 'id_front' }),
        ),
      ).toBe(VerificationErrors.adminOnly);
      const access = await service.kycDocument({
        actor: reviewer,
        shopId: shop.id,
        requestId,
        kind: 'id_front',
        correlationId: 'req-7',
      });
      expect(access).toEqual({
        url: 'https://didit.example/front.jpg?sig=1',
        filename: `kyc-id_front-${requestId}`,
      });
      expect(
        await codeOf(
          service.kycDocument({ actor: reviewer, shopId: shop.id, requestId, kind: 'id_back' }),
        ),
      ).toBe(VerificationErrors.documentUnavailable);
      const views = await db
        .getRepository(VerificationAudit)
        .findBy({ shopId: shop.id, action: 'document_viewed' });
      expect(views.map((v) => [v.actorId, v.details, v.correlationId])).toEqual(
        expect.arrayContaining([[reviewer.userId, { kind: 'id_front' }, 'req-7']]),
      );
    });
  });

  describe('when the owner deletes their account', () => {
    it('deletes the provider’s session at erasure time, not before', async () => {
      const { owner, shop } = await readyShop();
      await verification.startKyc({ actor: owner, shopId: shop.id });
      await verification.refreshKyc({ actor: owner, shopId: shop.id });
      const request = await db
        .getRepository(VerificationRequest)
        .findOneByOrFail({ shopId: shop.id });

      await verification.scheduleErasure(owner.userId, new Date(Date.now() + 30 * 86_400_000));
      expect(await verification.eraseDue()).toBe(0);
      expect(
        await verification.eraseDue(new Date(Date.now() + 31 * 86_400_000)),
      ).toBeGreaterThanOrEqual(1);

      expect(fake.deleted).toContain(request.providerSessionId);
      const erased = await db
        .getRepository(VerificationRequest)
        .findOneByOrFail({ id: request.id });
      expect(erased).toMatchObject({ kyc: null, erasedAt: expect.any(Date) });
    });
  });
});
