import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActorClaims, parseListQuery, REPORT_LIST_SPEC, ReportErrors } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { Shop, ShopReport } from '../src/entities';
import { ReportsService } from '../src/reports/reports.service';
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

const person = (roles = ['customer']): ActorClaims => ({ userId: randomUUID(), roles, shops: [] });
const admin = person(['admin']);

describe('shop reports (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let shops: ShopsService;
  let reports: ReportsService;

  const query = (raw: Record<string, unknown>) => parseListQuery(raw, REPORT_LIST_SPEC);

  async function shop(verified = true) {
    const created = await shops.create({
      actor: person(),
      name: `Kumasi Market ${randomUUID().slice(0, 4)}`,
    });
    if (verified)
      await db.getRepository(Shop).update({ id: created.id }, { verificationStatus: 'verified' });
    return created;
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    const outbox = new OutboxService('shops');
    shops = new ShopsService(db, outbox);
    reports = new ReportsService(db, outbox);
  }, 60_000);

  afterAll(() => testDb?.drop());

  it('keeps one open report per visitor and shop', async () => {
    const { id: shopId } = await shop();
    const report = { shopId, reason: 'fraud' as const, sessionId: 'visitor-aaaa1111' };
    expect(await reports.submit(report)).toEqual({ recorded: true });
    expect(await reports.submit({ ...report, reason: 'misleading' })).toEqual({ recorded: false });
    expect(await reports.submit({ ...report, sessionId: 'visitor-bbbb2222' })).toEqual({
      recorded: true,
    });
    expect(await db.getRepository(ShopReport).countBy({ shopId })).toBe(2);
  });

  it('takes reports on listed shops only', async () => {
    const { id: shopId } = await shop(false);
    expect(
      await codeOf(reports.submit({ shopId, reason: 'fraud', sessionId: 'visitor-cccc3333' })),
    ).toBe(ReportErrors.listingNotFound);
  });

  it('lists open reports oldest first, for admins only', async () => {
    const { id: shopId, name } = await shop();
    const user = person();
    await reports.submit({
      shopId,
      reason: 'other',
      details: '  Sells someone else’s photos  ',
      sessionId: 'visitor-dddd4444',
      userId: user.userId,
    });
    await reports.submit({ shopId, reason: 'offensive', sessionId: 'visitor-eeee5555' });

    const page = await reports.list({
      actor: admin,
      query: query({ 'filter[shopId]': shopId, 'filter[status]': 'open' }),
    });
    expect(page.items.map((r) => r.reason)).toEqual(['other', 'offensive']);
    expect(page.items[0]).toMatchObject({
      shopName: name,
      details: 'Sells someone else’s photos',
      signedIn: true,
      status: 'open',
    });
    expect(page.items[1].signedIn).toBe(false);
    // Who sent it is not in what admins see.
    expect(JSON.stringify(page)).not.toContain(user.userId);

    expect(await codeOf(reports.list({ actor: person(), query: query({}) }))).toBe(
      ReportErrors.adminOnly,
    );
  });

  it('closes every open report on the shop with one decision, and records it', async () => {
    const { id: shopId } = await shop();
    await reports.submit({ shopId, reason: 'fraud', sessionId: 'visitor-ffff6666' });
    await reports.submit({ shopId, reason: 'counterfeit', sessionId: 'visitor-gggg7777' });
    const [first] = (
      await reports.list({ actor: admin, query: query({ 'filter[shopId]': shopId }) })
    ).items;

    expect(
      await reports.decide({
        actor: admin,
        reportId: first.id,
        outcome: 'resolved',
        note: 'Suspended the shop',
      }),
    ).toEqual({ closed: 2 });
    const after = await reports.list({
      actor: admin,
      query: query({ 'filter[shopId]': shopId, 'filter[status]': 'resolved' }),
    });
    expect(after.items).toHaveLength(2);
    expect(after.items[0]).toMatchObject({ decisionNote: 'Suspended the shop' });
    expect(after.items[0].decidedAt).not.toBeNull();

    const audit = (await db.getRepository(OutboxMessage).findBy({ name: 'audit.recorded' })).filter(
      (m) => (m.envelope as { payload: { subjectId: string } }).payload.subjectId === shopId,
    );
    expect(audit.map((m) => (m.envelope as { payload: unknown }).payload)).toEqual([
      expect.objectContaining({
        actorId: admin.userId,
        action: 'shop.report_resolved',
        subjectType: 'shop',
        shopId,
        details: { reports: 2, reasons: 'counterfeit,fraud' },
      }),
    ]);

    expect(
      await codeOf(reports.decide({ actor: admin, reportId: first.id, outcome: 'dismissed' })),
    ).toBe(ReportErrors.alreadyClosed);
    // The visitor may report the shop again once theirs is closed.
    expect(
      await reports.submit({ shopId, reason: 'fraud', sessionId: 'visitor-ffff6666' }),
    ).toEqual({ recorded: true });
  });

  it('forgets who reported when their account is deleted', async () => {
    const { id: shopId } = await shop();
    const user = person();
    await reports.submit({
      shopId,
      reason: 'misleading',
      sessionId: 'visitor-hhhh8888',
      userId: user.userId,
    });
    await reports.forgetUser(user.userId);
    const [kept] = await db.getRepository(ShopReport).findBy({ shopId });
    expect(kept.reporterId).toBeNull();
  });
});
