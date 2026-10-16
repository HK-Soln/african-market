import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DiscoveryErrors, SearchNearbyRequest } from '@am/contracts';
import { EmiratesService } from '../src/search/emirates.service';
import { prefixQuery, SearchService } from '../src/search/search.service';
import { insertBranch, insertProduct, PLACES, seedMany, square } from './support/fixtures';
import { createTestDatabase, TestDatabase } from './support/test-database';

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

/** Monday 2026-10-12, 10:00 in Dubai. */
const MONDAY_10AM = new Date('2026-10-12T06:00:00Z');

describe('nearby search (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let search: SearchService;

  const names = async (input: SearchNearbyRequest) =>
    (await search.nearby(input)).items.map((b) => b.shopName);

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    search = new SearchService(db, () => MONDAY_10AM);
    // Search is closed everywhere until an admin opens it; these tests search all of it.
    await db.query(`UPDATE discovery.emirate_search SET search_open = true`);
  }, 60_000);

  beforeEach(async () => {
    await db.query(`DELETE FROM discovery.search_product`);
    await db.query(`DELETE FROM discovery.search_branch`);
  });

  afterAll(() => testDb?.drop());

  describe('pickup', () => {
    it('finds branches within the travel radius, nearest first', async () => {
      await insertBranch(db, { name: 'Nahda Mart', at: PLACES.alNahda });
      await insertBranch(db, { name: 'Deira Spices', at: PLACES.deira });
      await insertBranch(db, { name: 'Majaz Foods', at: PLACES.sharjah, emirate: 'SHJ' });
      await insertBranch(db, { name: 'Dragon Mart Kitchen', at: PLACES.internationalCity });
      await insertBranch(db, { name: 'Ajman Market', at: PLACES.ajman, emirate: 'AJM' });
      await insertBranch(db, { name: 'Delivery Only', at: PLACES.alNahda, pickup: false });

      const page = await search.nearby({ ...PLACES.alNahda, mode: 'pickup' });
      expect(page.items.map((b) => b.shopName)).toEqual([
        'Nahda Mart',
        'Majaz Foods',
        'Deira Spices',
      ]);
      expect(page.items[0].distanceM).toBeLessThan(5);
      expect(page.items[1].distanceM).toBeGreaterThan(3_000);
      expect(page.nextCursor).toBeNull();

      expect(await names({ ...PLACES.alNahda, mode: 'pickup', radiusM: 25_000 })).toHaveLength(5);
      expect(
        await names({ ...PLACES.alNahda, mode: 'pickup', radiusM: 25_000, emirate: 'SHJ' }),
      ).toEqual(['Majaz Foods']);
    });

    it('can keep only branches that would deliver too', async () => {
      await insertBranch(db, { name: 'Delivers', at: PLACES.deira, serviceRadiusM: 10_000 });
      await insertBranch(db, {
        name: 'Too far to deliver',
        at: PLACES.deira,
        serviceRadiusM: 1_000,
      });
      expect(await names({ ...PLACES.alNahda, mode: 'pickup', deliversToMe: true })).toEqual([
        'Delivers',
      ]);
    });
  });

  describe('delivery', () => {
    it('finds branches whose area or radius covers the point', async () => {
      await insertBranch(db, { name: 'Deira 5 km', at: PLACES.deira, serviceRadiusM: 5_000 });
      await insertBranch(db, {
        name: 'City Zone',
        at: PLACES.alNahda,
        serviceRadiusM: null,
        serviceArea: square(PLACES.internationalCity, 0.02),
      });
      await insertBranch(db, {
        name: 'Ajman 40 km',
        at: PLACES.ajman,
        emirate: 'AJM',
        serviceRadiusM: 40_000,
      });
      await insertBranch(db, {
        name: 'Pickup Only',
        at: PLACES.internationalCity,
        delivery: false,
      });

      expect((await names({ ...PLACES.internationalCity, mode: 'delivery' })).sort()).toEqual([
        'Ajman 40 km',
        'City Zone',
      ]);
    });
  });

  describe('filters', () => {
    it('take a category and everything under it, origin countries and open now', async () => {
      const food = randomUUID();
      const grains = randomUUID();
      const nightOwl = [1].map((weekday) => ({ weekday, opensAt: '20:00', closesAt: '02:00' }));
      const grocer = await insertBranch(db, {
        name: 'Grain Store',
        at: PLACES.alNahda,
        categoryIds: [food, grains],
        originCountries: ['GH'],
      });
      await insertBranch(db, { name: 'Food Hall', at: PLACES.alNahda, categoryIds: [food] });
      await insertBranch(db, {
        name: 'Night Kitchen',
        at: PLACES.alNahda,
        categoryIds: [food],
        weekly: nightOwl,
      });
      const nigerian = await insertBranch(db, { name: 'Lagos Shop', at: PLACES.alNahda });
      await insertProduct(db, {
        shopId: nigerian.shopId,
        branchIds: [nigerian.branchId],
        title: 'Garri',
        originCountry: 'NG',
      });

      const base = { ...PLACES.alNahda, mode: 'pickup' as const };
      expect((await names({ ...base, categoryId: food })).sort()).toEqual([
        'Food Hall',
        'Grain Store',
        'Night Kitchen',
      ]);
      expect(await names({ ...base, categoryId: grains })).toEqual(['Grain Store']);
      expect(await names({ ...base, originCountry: 'gh' })).toEqual(['Grain Store']);
      expect(await names({ ...base, originCountry: 'NG' })).toEqual(['Lagos Shop']);
      expect(await names({ ...base, categoryId: food, openNow: true })).not.toContain(
        'Night Kitchen',
      );

      const page = await search.nearby(base);
      expect(page.items.find((b) => b.branchId === grocer.branchId)).toMatchObject({
        openNow: true,
      });
      expect(page.items.find((b) => b.shopName === 'Night Kitchen')).toMatchObject({
        openNow: false,
      });
    });

    it('rank an open branch above a closed one at the same distance', async () => {
      await insertBranch(db, { name: 'Closed Today', at: PLACES.alNahda, weekly: [] });
      await insertBranch(db, { name: 'Open Now', at: PLACES.alNahda });
      expect(await names({ ...PLACES.alNahda, mode: 'pickup' })).toEqual([
        'Open Now',
        'Closed Today',
      ]);
    });
  });

  describe('text', () => {
    it('matches shop names, typos and products, and returns the products that matched', async () => {
      const lagos = await insertBranch(db, {
        name: 'Lagos Kitchen',
        at: PLACES.deira,
        description: 'Nigerian groceries',
      });
      const accra = await insertBranch(db, { name: 'Accra Corner', at: PLACES.deira });
      const egusi = await insertProduct(db, {
        shopId: accra.shopId,
        branchIds: [accra.branchId],
        title: 'Égusi seeds 1 kg',
      });
      await insertProduct(db, {
        shopId: accra.shopId,
        branchIds: [accra.branchId],
        title: 'Palm oil',
      });
      await insertBranch(db, { name: 'Unrelated', at: PLACES.deira });

      const base = { ...PLACES.deira, mode: 'pickup' as const };
      expect(await names({ ...base, q: 'lagos' })).toEqual(['Lagos Kitchen']);
      expect(await names({ ...base, q: 'Lagos Kichen' })).toEqual(['Lagos Kitchen']);
      expect(await names({ ...base, q: 'nigerian' })).toEqual(['Lagos Kitchen']);

      const found = await search.nearby({ ...base, q: 'egusi' });
      expect(found.items).toHaveLength(1);
      expect(found.items[0]).toMatchObject({
        branchId: accra.branchId,
        matchedProducts: [
          { productId: egusi, title: { en: 'Égusi seeds 1 kg' }, minPriceFils: 1500 },
        ],
      });
      expect((await search.nearby(base)).items.every((b) => b.matchedProducts.length === 0)).toBe(
        true,
      );
      void lagos;
    });

    it('builds a prefix query from words only', () => {
      expect(prefixQuery('palm oi')).toBe('palm:* & oi:*');
      expect(prefixQuery("egusi' | !(x)")).toBe('egusi:* & x:*');
      expect(prefixQuery('دقيق اليام')).toBe('دقيق:* & اليام:*');
      expect(prefixQuery('  !!  ')).toBeNull();
    });
  });

  describe('pages', () => {
    it('walk every result once, in score order, and refuse a cursor from another search', async () => {
      for (let i = 0; i < 25; i++)
        await insertBranch(db, {
          name: `Shop ${i}`,
          at: { lat: PLACES.alNahda.lat + i * 0.001, lng: PLACES.alNahda.lng },
          completeness: i % 3 === 0 ? 90 : 40,
        });

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await search.nearby({ ...PLACES.alNahda, mode: 'pickup', limit: 10, cursor });
        seen.push(...page.items.map((b) => b.branchId));
        cursor = page.nextCursor ?? undefined;
        pages++;
      } while (cursor);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(25);

      const first = await search.nearby({ ...PLACES.alNahda, mode: 'pickup', limit: 10 });
      expect(
        await codeOf(
          search.nearby({
            ...PLACES.alNahda,
            mode: 'pickup',
            limit: 10,
            openNow: true,
            cursor: first.nextCursor!,
          }),
        ),
      ).toBe(DiscoveryErrors.cursorInvalid);
      expect(
        await codeOf(search.nearby({ ...PLACES.alNahda, mode: 'pickup', cursor: 'garbage' })),
      ).toBe(DiscoveryErrors.cursorInvalid);
    });
  });

  describe('map', () => {
    it('shows pins when zoomed in and clusters further out', async () => {
      for (let i = 0; i < 6; i++)
        await insertBranch(db, {
          name: `Nahda ${i}`,
          at: { lat: PLACES.alNahda.lat + i * 0.0005, lng: PLACES.alNahda.lng },
        });
      await insertBranch(db, { name: 'Ajman Market', at: PLACES.ajman, emirate: 'AJM' });
      const uae = { minLat: 24.9, minLng: 55.0, maxLat: 25.6, maxLng: 55.8 };

      const far = await search.map({ ...uae, zoom: 9 });
      const clusters = far.markers.filter((m) => m.kind === 'cluster');
      expect(clusters).toEqual([expect.objectContaining({ kind: 'cluster', count: 6 })]);
      expect(far.markers.filter((m) => m.kind === 'pin')).toEqual([
        expect.objectContaining({ shopName: 'Ajman Market' }),
      ]);

      const near = await search.map({
        minLat: 25.28,
        minLng: 55.36,
        maxLat: 25.3,
        maxLng: 55.38,
        zoom: 16,
      });
      expect(near.markers).toHaveLength(6);
      expect(near.markers.every((m) => m.kind === 'pin')).toBe(true);
      expect(near.truncated).toBe(false);
    });
  });

  describe('emirates', () => {
    it('hide an emirate until an admin opens search there, and count its shops for admins', async () => {
      const emirates = new EmiratesService(db);
      await insertBranch(db, { name: 'Majaz Foods', at: PLACES.sharjah, emirate: 'SHJ' });
      const admin = { userId: randomUUID(), roles: ['admin'], shops: [] };
      await emirates.setSearch({ actor: admin, code: 'SHJ', open: false });
      expect(await names({ ...PLACES.sharjah, mode: 'pickup' })).toEqual([]);

      const forAdmin = await emirates.list({ actor: admin });
      expect(forAdmin.items.find((e) => e.code === 'SHJ')).toMatchObject({
        searchOpen: false,
        verifiedShops: 1,
        branches: 1,
        name: { en: 'Sharjah', ar: 'الشارقة' },
      });
      expect((await emirates.list({})).items.find((e) => e.code === 'SHJ')).toMatchObject({
        searchOpen: false,
        verifiedShops: null,
      });

      await emirates.setSearch({ actor: admin, code: 'SHJ', open: true });
      expect(await names({ ...PLACES.sharjah, mode: 'pickup' })).toEqual(['Majaz Foods']);
      expect(
        await codeOf(
          emirates.setSearch({ actor: { ...admin, roles: ['seller'] }, code: 'SHJ', open: false }),
        ),
      ).toBe(DiscoveryErrors.adminOnly);
    });
  });

  describe('open now', () => {
    const isOpen = async (hours: unknown, at: string) =>
      (
        await db.query(`SELECT discovery.is_open($1::jsonb, $2::timestamptz) AS open`, [
          JSON.stringify(hours),
          at,
        ])
      )[0].open;

    it('follows weekly hours, late shifts past midnight and special dates', async () => {
      const late = { weekly: [{ weekday: 5, opensAt: '18:00', closesAt: '02:00' }], special: [] };
      // Friday 2026-10-16 23:00 and Saturday 01:30 in Dubai (UTC+4).
      expect(await isOpen(late, '2026-10-16T19:00:00Z')).toBe(true);
      expect(await isOpen(late, '2026-10-16T21:30:00Z')).toBe(true);
      expect(await isOpen(late, '2026-10-16T22:30:00Z')).toBe(false);
      expect(await isOpen(late, '2026-10-16T10:00:00Z')).toBe(false);

      const eid = {
        weekly: [{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }],
        special: [{ date: '2026-10-12', closed: true, opensAt: null, closesAt: null, label: null }],
      };
      expect(await isOpen(eid, MONDAY_10AM.toISOString())).toBe(false);
      const ramadan = {
        ...eid,
        special: [
          { date: '2026-10-12', closed: false, opensAt: '20:00', closesAt: '03:00', label: null },
        ],
      };
      expect(await isOpen(ramadan, MONDAY_10AM.toISOString())).toBe(false);
      expect(await isOpen(ramadan, '2026-10-12T17:00:00Z')).toBe(true);
    });
  });

  // SEARCH_PERF=1 pnpm nx test @am/discovery -- search.spec: 10,000 branches, p95 under 150 ms.
  const perf = process.env.SEARCH_PERF ? it : it.skip;
  perf(
    'answers within 150 ms (p95) over 10,000 branches',
    async () => {
      await seedMany(db, 10_000);
      const timings: number[] = [];
      const points = Object.values(PLACES);
      const variants: Array<Partial<SearchNearbyRequest>> = [
        {},
        { q: 'egusi' },
        { openNow: true },
        { q: 'palm oil', mode: 'delivery' },
      ];
      for (let i = 0; i < 60; i++) {
        const started = performance.now();
        await search.nearby({
          ...points[i % points.length],
          mode: 'pickup',
          ...variants[i % variants.length],
        } as SearchNearbyRequest);
        timings.push(performance.now() - started);
      }
      timings.sort((a, b) => a - b);
      const p95 = timings[Math.floor(timings.length * 0.95)];
      process.stderr.write(
        `nearby search over 10,000 branches: p50 ${timings[30].toFixed(1)} ms, p95 ${p95.toFixed(1)} ms
`,
      );
      expect(p95).toBeLessThan(150);
    },
    120_000,
  );
});
