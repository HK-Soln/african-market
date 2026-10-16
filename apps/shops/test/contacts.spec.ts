import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActorClaims, ContactErrors, ShopErrors } from '@am/contracts';
import { OutboxService } from '@am/database';
import { ContactService } from '../src/contacts/contact.service';
import { Shop } from '../src/entities';
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

const person = (): ActorClaims => ({ userId: randomUUID(), roles: ['customer'], shops: [] });

describe('contact taps (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let shops: ShopsService;
  let branches: BranchesService;
  /** Monday 2026-10-12, 10:00 in Dubai, moved by the tests. */
  let now = new Date('2026-10-12T06:00:00Z');
  let contacts: ContactService;

  async function verifiedShop() {
    const owner = person();
    const shop = await shops.create({
      actor: owner,
      name: `Accra Corner ${randomUUID().slice(0, 4)}`,
    });
    const branch = await branches.upsert({
      actor: owner,
      shopId: shop.id,
      name: 'Deira',
      emirate: 'DXB',
      location: { lat: 25.2711, lng: 55.3075 },
    });
    await db.getRepository(Shop).update({ id: shop.id }, { verificationStatus: 'verified' });
    return { owner, shop, branch };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    const outbox = new OutboxService('shops');
    shops = new ShopsService(db, outbox);
    branches = new BranchesService(db, outbox);
    contacts = new ContactService(db, () => now);
    await contacts.ensurePartitions();
  }, 60_000);

  afterAll(() => testDb?.drop());

  it('counts a tap once per visitor, shop and channel in ten minutes', async () => {
    const { shop, branch } = await verifiedShop();
    const tap = {
      shopId: shop.id,
      branchId: branch.id,
      channel: 'whatsapp' as const,
      sessionId: 'visitor-aaaa1111',
    };
    expect(await contacts.record(tap)).toEqual({ recorded: true });
    expect(await contacts.record(tap)).toEqual({ recorded: false });
    expect(await contacts.record({ ...tap, channel: 'call' })).toEqual({ recorded: true });
    expect(await contacts.record({ ...tap, sessionId: 'visitor-bbbb2222' })).toEqual({
      recorded: true,
    });

    now = new Date(now.getTime() + 11 * 60_000);
    expect(await contacts.record(tap)).toEqual({ recorded: true });
  });

  it('counts one of many taps sent at the same moment', async () => {
    const { shop } = await verifiedShop();
    const tap = { shopId: shop.id, channel: 'email' as const, sessionId: 'visitor-race0001' };
    const results = await Promise.all(Array.from({ length: 5 }, () => contacts.record(tap)));
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
  });

  it('only takes taps on verified shops and their own branches', async () => {
    const { shop } = await verifiedShop();
    const other = await verifiedShop();
    const draft = await shops.create({ actor: person(), name: 'Draft' });
    const tap = { channel: 'call' as const, sessionId: 'visitor-cccc3333' };
    expect(await codeOf(contacts.record({ ...tap, shopId: draft.id }))).toBe(
      ContactErrors.shopNotFound,
    );
    expect(
      await codeOf(contacts.record({ ...tap, shopId: shop.id, branchId: other.branch.id })),
    ).toBe(ContactErrors.shopNotFound);
  });

  it('gives owners counts by Dubai day, channel and product, and nobody else', async () => {
    const { owner, shop } = await verifiedShop();
    const wig = randomUUID();
    const oil = randomUUID();
    now = new Date('2026-10-12T19:30:00Z'); // 23:30 in Dubai, Monday the 12th
    await contacts.record({
      shopId: shop.id,
      channel: 'whatsapp',
      sessionId: 'visitor-dddd0001',
      productId: wig,
    });
    now = new Date('2026-10-12T20:30:00Z'); // 00:30 in Dubai, Tuesday the 13th
    await contacts.record({
      shopId: shop.id,
      channel: 'whatsapp',
      sessionId: 'visitor-dddd0002',
      productId: wig,
    });
    await contacts.record({
      shopId: shop.id,
      channel: 'call',
      sessionId: 'visitor-dddd0003',
      productId: oil,
    });
    // Older than the period.
    now = new Date('2026-09-01T08:00:00Z');
    await contacts.record({ shopId: shop.id, channel: 'email', sessionId: 'visitor-dddd0004' });

    now = new Date('2026-10-13T08:00:00Z');
    const week = await contacts.stats({ actor: owner, shopId: shop.id, days: 7 });
    expect(week).toMatchObject({
      from: '2026-10-07',
      to: '2026-10-13',
      total: 3,
      byChannel: { whatsapp: 2, call: 1, email: 0 },
      byProduct: [
        { productId: wig, count: 2 },
        { productId: oil, count: 1 },
      ],
    });
    expect(week.byDay).toHaveLength(7);
    expect(week.byDay.find((d) => d.date === '2026-10-12')).toEqual({
      date: '2026-10-12',
      whatsapp: 1,
      call: 0,
      email: 0,
    });
    expect(week.byDay.find((d) => d.date === '2026-10-13')).toEqual({
      date: '2026-10-13',
      whatsapp: 1,
      call: 1,
      email: 0,
    });
    expect((await contacts.stats({ actor: owner, shopId: shop.id, days: 90 })).total).toBe(4);

    expect(await codeOf(contacts.stats({ actor: person(), shopId: shop.id, days: 7 }))).toBe(
      ShopErrors.notFound,
    );
    const staff: ActorClaims = {
      userId: randomUUID(),
      roles: ['seller'],
      shops: [{ shopId: shop.id, role: 'staff' }],
    };
    expect(await codeOf(contacts.stats({ actor: staff, shopId: shop.id, days: 7 }))).toBe(
      ShopErrors.forbidden,
    );
  });

  it('forgets who tapped when their account is deleted, keeping the count', async () => {
    const { shop } = await verifiedShop();
    const userId = randomUUID();
    await contacts.record({
      shopId: shop.id,
      channel: 'call',
      sessionId: 'visitor-eeee0001',
      userId,
    });
    await contacts.forgetUser(userId);
    const rows = await db.query(`SELECT user_id FROM shops.contact_event WHERE shop_id = $1`, [
      shop.id,
    ]);
    expect(rows).toEqual([{ user_id: null }]);
  });

  it('keeps rows out of the default partition', async () => {
    const [{ n }] = await db.query(`SELECT count(*)::int AS n FROM shops.contact_event_default`);
    // Only the September row, older than the partitions made ahead.
    expect(n).toBe(1);
  });
});
