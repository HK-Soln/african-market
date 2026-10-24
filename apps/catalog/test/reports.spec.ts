import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActorClaims, parseListQuery, REPORT_LIST_SPEC, ReportErrors } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { ProductsService } from '../src/catalog/products.service';
import { ShopEvents } from '../src/catalog/shop-events';
import { Category, Product, ProductReport } from '../src/entities';
import { ReportsService } from '../src/reports/reports.service';
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

describe('product reports (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let products: ProductsService;
  let shopEvents: ShopEvents;
  let reports: ReportsService;
  let categoryId: string;

  const query = (raw: Record<string, unknown>) => parseListQuery(raw, REPORT_LIST_SPEC);

  /** A product of a shop the catalogue heard about, public unless asked otherwise. */
  async function product(options: { active?: boolean; verified?: boolean } = {}) {
    const owner = person(['customer', 'seller']);
    const shopId = randomUUID();
    await shopEvents.shopCreated(db.manager, {
      shopId,
      ownerId: owner.userId,
      name: 'Mama Africa',
      slug: `mama-${shopId.slice(0, 6)}`,
    });
    if (options.verified !== false)
      await shopEvents.shopVerified(
        db.manager,
        { shopId, verificationStatus: 'verified', checkoutEnabled: false, codEnabled: false },
        new Date(),
      );
    const { product: made } = await products.upsert({
      actor: owner,
      shopId,
      categoryId,
      title: { en: 'Shea butter', ar: 'زبدة الشيا' },
      variants: [{ options: {}, priceFils: 2_500 }],
    });
    if (options.active !== false)
      await db.getRepository(Product).update({ id: made.id }, { status: 'active' });
    return { shopId, productId: made.id };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    const outbox = new OutboxService('catalog');
    products = new ProductsService(db, outbox);
    shopEvents = new ShopEvents(outbox);
    reports = new ReportsService(db, outbox);
    const category = await db.manager.findOneByOrFail(Category, { slug: 'hair-wigs' });
    categoryId = category.id;
  }, 60_000);

  afterAll(() => testDb?.drop());

  it('keeps one open report per visitor and product, with its shop', async () => {
    const { shopId, productId } = await product();
    const report = { productId, reason: 'counterfeit' as const, sessionId: 'visitor-aaaa1111' };
    expect(await reports.submit(report)).toEqual({ recorded: true });
    expect(await reports.submit(report)).toEqual({ recorded: false });
    const kept = await db.getRepository(ProductReport).findBy({ productId });
    expect(kept).toHaveLength(1);
    expect(kept[0].shopId).toBe(shopId);
  });

  it('takes reports on public products only', async () => {
    const draft = await product({ active: false });
    const unverified = await product({ verified: false });
    for (const { productId } of [draft, unverified])
      expect(
        await codeOf(reports.submit({ productId, reason: 'fraud', sessionId: 'visitor-bbbb2222' })),
      ).toBe(ReportErrors.listingNotFound);
  });

  it('lists reports with the product, and closes them together', async () => {
    const { shopId, productId } = await product();
    await reports.submit({ productId, reason: 'prohibited', sessionId: 'visitor-cccc3333' });
    await reports.submit({
      productId,
      reason: 'misleading',
      details: 'The photo is a different product',
      sessionId: 'visitor-dddd4444',
      userId: randomUUID(),
    });

    const page = await reports.list({
      actor: admin,
      query: query({ 'filter[shopId]': shopId, 'filter[status]': 'open' }),
    });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      productId,
      shopId,
      productTitle: { en: 'Shea butter', ar: 'زبدة الشيا' },
      reason: 'prohibited',
      signedIn: false,
    });
    expect(page.items[1].signedIn).toBe(true);

    // A product removed since keeps its reports in the queue.
    await db.getRepository(Product).softDelete({ id: productId });
    const [first] = (
      await reports.list({ actor: admin, query: query({ 'filter[shopId]': shopId }) })
    ).items;
    expect(first.productTitle.en).toBe('Shea butter');

    expect(
      await reports.decide({ actor: admin, reportId: first.id, outcome: 'dismissed' }),
    ).toEqual({ closed: 2 });
    const audit = (await db.getRepository(OutboxMessage).findBy({ name: 'audit.recorded' })).filter(
      (m) => (m.envelope as { payload: { subjectId: string } }).payload.subjectId === productId,
    );
    expect(audit.map((m) => (m.envelope as { payload: unknown }).payload)).toEqual([
      expect.objectContaining({
        action: 'product.report_dismissed',
        subjectType: 'product',
        shopId,
        details: { reports: 2, reasons: 'misleading,prohibited' },
      }),
    ]);
    expect(
      await codeOf(reports.decide({ actor: person(), reportId: first.id, outcome: 'resolved' })),
    ).toBe(ReportErrors.adminOnly);
  });
});
