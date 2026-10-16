import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  ActorClaims,
  MultiPolygonDto,
  parseListQuery,
  MY_SHOPS_LIST_SPEC,
  ShopErrors,
} from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { Shop } from '../src/entities';
import { BranchesService } from '../src/shops/branches.service';
import { ShopsService, MAX_SHOPS_PER_OWNER } from '../src/shops/shops.service';
import { slugify } from '../src/shops/slug';
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
const withRole = (shopId: string, role: 'owner' | 'manager' | 'staff'): ActorClaims => ({
  userId: randomUUID(),
  roles: ['customer', 'seller'],
  shops: [{ shopId, role }],
});

// Al Nahda, Dubai, and a small square around it.
const NAHDA = { lat: 25.2897, lng: 55.3712 };
const r = (n: number) => Math.round(n * 1e7) / 1e7;
const square = (lng: number, lat: number, d: number): MultiPolygonDto => ({
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [r(lng - d), r(lat - d)],
        [r(lng + d), r(lat - d)],
        [r(lng + d), r(lat + d)],
        [r(lng - d), r(lat + d)],
        [r(lng - d), r(lat - d)],
      ],
    ],
  ],
});

describe('slugify', () => {
  it.each([
    ['Mama Africa Store', 'mama-africa-store'],
    ['Café Ébène & Spices', 'cafe-ebene-and-spices'],
    ['  --Lagos   Kitchen--  ', 'lagos-kitchen'],
    ['متجر أفريقيا', 'shop'],
  ])('%s → %s', (name, slug) => expect(slugify(name)).toBe(slug));
});

describe('shops and branches (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let shops: ShopsService;
  let branches: BranchesService;

  const events = async (name: string, field: string, id: string) =>
    (await db.getRepository(OutboxMessage).findBy({ name })).filter(
      (e) => (e.envelope as { payload: Record<string, unknown> }).payload[field] === id,
    );

  /** A new shop with one branch in Al Nahda. */
  async function shopWithBranch(owner = person()) {
    const shop = await shops.create({
      actor: owner,
      name: `Mama Africa ${randomUUID().slice(0, 6)}`,
    });
    const branch = await branches.upsert({
      actor: owner,
      shopId: shop.id,
      name: 'Al Nahda',
      emirate: 'DXB',
      location: NAHDA,
    });
    return { owner, shop, branch };
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    const outbox = new OutboxService('shops');
    shops = new ShopsService(db, outbox);
    branches = new BranchesService(db, outbox);
  }, 60_000);

  afterAll(() => testDb?.drop());

  describe('a shop', () => {
    it('is created as a draft owned by its creator, with a free slug, and announced', async () => {
      const owner = person();
      const first = await shops.create({
        actor: owner,
        name: 'Lagos Kitchen',
        contactWhatsapp: '050 123 4567',
        contactEmail: ' Hello@LagosKitchen.ae ',
        originCountries: ['ng', 'GH'],
      });
      expect(first).toMatchObject({
        name: 'Lagos Kitchen',
        slug: 'lagos-kitchen',
        verificationStatus: 'draft',
        ownerId: owner.userId,
        contactWhatsapp: '+971501234567',
        contactEmail: 'Hello@LagosKitchen.ae',
        originCountries: ['NG', 'GH'],
        branches: [],
      });
      const second = await shops.create({ actor: person(), name: 'Lagos Kitchen' });
      expect(second.slug).toMatch(/^lagos-kitchen-[0-9a-f]{4}$/);

      expect(await events('shop.created', 'shopId', first.id)).toEqual([
        expect.objectContaining({
          envelope: expect.objectContaining({
            payload: {
              shopId: first.id,
              ownerId: owner.userId,
              name: 'Lagos Kitchen',
              slug: 'lagos-kitchen',
            },
          }),
        }),
      ]);
    });

    it('refuses a contact that is not a phone number, and a sixth shop', async () => {
      const owner = person();
      expect(await codeOf(shops.create({ actor: owner, name: 'X', contactPhone: '12' }))).toBe(
        ShopErrors.validationFailed,
      );
      for (let i = 0; i < MAX_SHOPS_PER_OWNER; i++)
        await shops.create({ actor: owner, name: `Shop ${i}` });
      expect(await codeOf(shops.create({ actor: owner, name: 'One more' }))).toBe(
        ShopErrors.tooManyShops,
      );
    });

    it('is changed by its owner (even before their token knows) and managers only', async () => {
      const owner = person();
      const shop = await shops.create({ actor: owner, name: 'Edit me' });
      const ok = await shops.update({
        actor: owner,
        shopId: shop.id,
        description: { en: 'Fresh egusi', ar: 'إيغوسي طازج' },
      });
      expect(ok.shop.description).toEqual({ en: 'Fresh egusi', ar: 'إيغوسي طازج' });
      await shops.update({ actor: withRole(shop.id, 'manager'), shopId: shop.id, name: 'Edited' });

      expect(
        await codeOf(
          shops.update({ actor: withRole(shop.id, 'staff'), shopId: shop.id, name: 'No' }),
        ),
      ).toBe(ShopErrors.forbidden);
      // Someone with no role learns nothing, not even that it exists.
      expect(await codeOf(shops.update({ actor: person(), shopId: shop.id, name: 'No' }))).toBe(
        ShopErrors.notFound,
      );
      expect(
        await codeOf(shops.update({ actor: person(['admin']), shopId: shop.id, name: 'No' })),
      ).toBe(ShopErrors.forbidden);
      expect((await shops.get({ actor: owner, shopId: shop.id })).name).toBe('Edited');
      expect(await events('shop.updated', 'shopId', shop.id)).toHaveLength(2);
    });

    it('tells the gateway which media the change released', async () => {
      const owner = person();
      const shop = await shops.create({ actor: owner, name: 'Pictures' });
      const [logo, newLogo, g1, g2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await shops.update({
        actor: owner,
        shopId: shop.id,
        logoMediaId: logo,
        galleryMediaIds: [g1, g2],
      });
      const result = await shops.update({
        actor: owner,
        shopId: shop.id,
        logoMediaId: newLogo,
        galleryMediaIds: [g2],
      });
      expect(result.releasedMediaIds.sort()).toEqual([logo, g1].sort());
    });

    it('is shown publicly by slug only once verified', async () => {
      const { shop } = await shopWithBranch();
      expect(await codeOf(shops.getBySlug({ slug: shop.slug }))).toBe(ShopErrors.notFound);
      await db.getRepository(Shop).update({ id: shop.id }, { verificationStatus: 'verified' });
      const shown = await shops.getBySlug({ slug: shop.slug });
      expect(shown.branches).toHaveLength(1);
    });

    it('lists the shops a person owns or works in, a page at a time', async () => {
      const owner = person();
      const mine = await shops.create({ actor: owner, name: 'Mine' });
      const other = await shops.create({ actor: person(), name: 'Where I manage' });
      const me = { ...owner, shops: [{ shopId: other.id, role: 'manager' as const }] };
      const page = await shops.listMine({
        actor: me,
        query: parseListQuery({ sort: 'name' }, MY_SHOPS_LIST_SPEC),
      });
      expect(page.items.map((s) => s.id)).toEqual([mine.id, other.id]);
      const drafts = await shops.listMine({
        actor: me,
        query: parseListQuery({ 'filter[verificationStatus]': 'verified' }, MY_SHOPS_LIST_SPEC),
      });
      expect(drafts.items).toEqual([]);
    });
  });

  describe('branches', () => {
    it('stores the pin, makes the first branch primary and announces each change', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      expect(branch).toMatchObject({
        name: 'Al Nahda',
        emirate: 'DXB',
        location: NAHDA,
        isPrimary: true,
        pickup: true,
      });

      const second = await branches.upsert({
        actor: owner,
        shopId: shop.id,
        name: 'Deira',
        emirate: 'DXB',
        location: { lat: 25.2711, lng: 55.3075 },
        makani: '30123 45678',
      });
      expect(second).toMatchObject({ isPrimary: false, makani: '3012345678' });

      await branches.upsert({
        actor: owner,
        shopId: shop.id,
        branchId: second.id,
        isPrimary: true,
      });
      const reread = await shops.get({ actor: owner, shopId: shop.id });
      expect(reread.branches.map((b) => [b.name, b.isPrimary])).toEqual([
        ['Deira', true],
        ['Al Nahda', false],
      ]);
      expect(await events('branch.updated', 'shopId', shop.id)).toHaveLength(3);
    });

    it('refuses a pin outside the UAE, and delivery with nowhere to deliver', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      expect(
        await codeOf(
          branches.upsert({
            actor: owner,
            shopId: shop.id,
            name: 'Lagos',
            emirate: 'DXB',
            location: { lat: 6.5244, lng: 3.3792 },
          }),
        ),
      ).toBe(ShopErrors.outsideUae);
      expect(
        await codeOf(
          branches.upsert({ actor: owner, shopId: shop.id, branchId: branch.id, delivery: true }),
        ),
      ).toBe(ShopErrors.deliveryAreaMissing);
      const radius = await branches.upsert({
        actor: owner,
        shopId: shop.id,
        branchId: branch.id,
        delivery: true,
        serviceRadiusM: 5000,
      });
      expect(radius).toMatchObject({ delivery: true, serviceRadiusM: 5000 });
    });

    it('takes a drawn delivery area when it is a real area of a sensible size in the UAE', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      const area = square(NAHDA.lng, NAHDA.lat, 0.02);
      const saved = await branches.upsert({
        actor: owner,
        shopId: shop.id,
        branchId: branch.id,
        delivery: true,
        serviceArea: area,
      });
      expect(saved.serviceArea).toEqual(area);

      // The area really covers the branch's neighbourhood, as search will ask it.
      const [covered] = await db.query(
        `SELECT ST_Covers(service_area, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS hit FROM shops.branch WHERE id = $3`,
        [NAHDA.lng, NAHDA.lat, branch.id],
      );
      expect(covered.hit).toBe(true);

      const bowtie: MultiPolygonDto = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [55.36, 25.28],
              [55.38, 25.3],
              [55.38, 25.28],
              [55.36, 25.3],
              [55.36, 25.28],
            ],
          ],
        ],
      };
      const error = branches.upsert({
        actor: owner,
        shopId: shop.id,
        branchId: branch.id,
        serviceArea: bowtie,
      });
      await expect(error).rejects.toMatchObject({
        error: { code: ShopErrors.serviceAreaInvalid, details: { reason: 'not_valid' } },
      });

      const huge = square(55.0, 24.5, 0.5);
      await expect(
        branches.upsert({ actor: owner, shopId: shop.id, branchId: branch.id, serviceArea: huge }),
      ).rejects.toMatchObject({
        error: { code: ShopErrors.serviceAreaInvalid, details: { reason: 'too_large' } },
      });
    });

    it('keeps the weekly hours as given, with breaks and late nights', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      const hours = [
        { weekday: 5, opensAt: '14:00', closesAt: '22:00' },
        { weekday: 1, opensAt: '09:00', closesAt: '13:00' },
        { weekday: 1, opensAt: '16:00', closesAt: '21:00' },
        { weekday: 6, opensAt: '18:00', closesAt: '02:00' },
      ];
      const saved = await branches.setOpeningHours({
        actor: owner,
        shopId: shop.id,
        branchId: branch.id,
        hours,
      });
      expect(saved.openingHours).toEqual([hours[1], hours[2], hours[0], hours[3]]);

      const cleared = await branches.setOpeningHours({
        actor: owner,
        shopId: shop.id,
        branchId: branch.id,
        hours: [],
      });
      expect(cleared.openingHours).toEqual([]);
    });

    it('keeps special days, changes them and removes them', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      const base = { actor: owner, shopId: shop.id, branchId: branch.id, date: '2027-03-10' };
      await branches.setSpecialHours({
        ...base,
        closed: true,
        opensAt: null,
        closesAt: null,
        label: { en: 'Eid al-Fitr', ar: 'عيد الفطر' },
      });
      const late = await branches.setSpecialHours({
        ...base,
        closed: false,
        opensAt: '20:00',
        closesAt: '03:00',
        label: null,
      });
      expect(late.specialHours).toEqual([
        { date: '2027-03-10', closed: false, opensAt: '20:00', closesAt: '03:00', label: null },
      ]);
      expect(
        await codeOf(
          branches.setSpecialHours({
            ...base,
            closed: false,
            opensAt: null,
            closesAt: null,
            label: null,
          }),
        ),
      ).toBe(ShopErrors.validationFailed);
      const gone = await branches.deleteSpecialHours(base);
      expect(gone.specialHours).toEqual([]);
    });

    it('hands the primary role on when the primary branch is deleted', async () => {
      const { owner, shop, branch } = await shopWithBranch();
      const other = await branches.upsert({
        actor: owner,
        shopId: shop.id,
        name: 'Sharjah',
        emirate: 'SHJ',
        location: { lat: 25.3463, lng: 55.4209 },
      });
      await branches.delete({ actor: owner, shopId: shop.id, branchId: branch.id });
      const left = await shops.get({ actor: owner, shopId: shop.id });
      expect(left.branches.map((b) => [b.id, b.isPrimary])).toEqual([[other.id, true]]);
      expect(
        (await events('branch.updated', 'branchId', branch.id)).some(
          (e) => (e.envelope as { payload: { deleted: boolean } }).payload.deleted,
        ),
      ).toBe(true);
    });

    it('lets only owners and managers change branches', async () => {
      const { shop, branch } = await shopWithBranch();
      const staff = withRole(shop.id, 'staff');
      expect(
        await codeOf(
          branches.upsert({ actor: staff, shopId: shop.id, branchId: branch.id, name: 'X' }),
        ),
      ).toBe(ShopErrors.forbidden);
      expect(
        await codeOf(branches.delete({ actor: person(), shopId: shop.id, branchId: branch.id })),
      ).toBe(ShopErrors.notFound);
      expect(
        await codeOf(
          branches.upsert({
            actor: withRole(shop.id, 'manager'),
            shopId: shop.id,
            branchId: randomUUID(),
            name: 'X',
          }),
        ),
      ).toBe(ShopErrors.branchNotFound);
    });
  });
});
