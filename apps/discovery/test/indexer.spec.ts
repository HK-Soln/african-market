import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  CategoryDto,
  ProductSearchSnapshot,
  ShopProductSnapshotsResponse,
  ShopSearchSnapshot,
} from '@am/contracts';
import { completenessScore, pathOf, SearchIndexer } from '../src/search/indexer';
import { SearchOwners } from '../src/search/owners';
import { createTestDatabase, TestDatabase } from './support/test-database';

const FOOD = randomUUID();
const GRAINS = randomUUID();
const BEAUTY = randomUUID();
const CATEGORIES: CategoryDto[] = [
  {
    id: FOOD,
    parentId: null,
    slug: 'groceries-food',
    name: { en: 'Groceries & Food', ar: 'البقالة والأطعمة' },
    kind: 'product',
    isRestricted: false,
    requiresDeclaration: true,
    checkoutAllowed: true,
    sort: 0,
    active: true,
  },
  {
    id: GRAINS,
    parentId: FOOD,
    slug: 'grains-flours',
    name: { en: 'Grains & flours', ar: 'الحبوب والدقيق' },
    kind: 'product',
    isRestricted: false,
    requiresDeclaration: true,
    checkoutAllowed: true,
    sort: 0,
    active: true,
  },
  {
    id: BEAUTY,
    parentId: null,
    slug: 'beauty-hair',
    name: { en: 'Beauty & Hair', ar: 'الجمال والشعر' },
    kind: 'product',
    isRestricted: false,
    requiresDeclaration: false,
    checkoutAllowed: true,
    sort: 10,
    active: true,
  },
];

/** The owners as the tests set them: a shop and its products, and when each was read. */
class FakeOwners implements SearchOwners {
  shops = new Map<string, ShopSearchSnapshot>();
  products = new Map<string, ProductSearchSnapshot>();
  categoryReads = 0;

  async shop(id: string) {
    return this.shops.get(id) ?? null;
  }
  async verifiedShopIds(after: string | undefined, limit: number) {
    return [...this.shops.values()]
      .filter((s) => s.verified)
      .map((s) => s.shopId)
      .sort()
      .filter((id) => !after || id > after)
      .slice(0, limit);
  }
  async product(id: string) {
    return this.products.get(id) ?? null;
  }
  async shopProducts(shopId: string): Promise<ShopProductSnapshotsResponse> {
    return {
      products: [...this.products.values()].filter((p) => p.shopId === shopId),
      observedAt: new Date().toISOString(),
    };
  }
  async categories() {
    this.categoryReads++;
    return CATEGORIES;
  }
}

let clock = Date.UTC(2026, 9, 1, 8);
const tick = () => new Date((clock += 1000)).toISOString();

function shopSnapshot(overrides: Partial<ShopSearchSnapshot> = {}): ShopSearchSnapshot {
  const shopId = overrides.shopId ?? randomUUID();
  return {
    shopId,
    verified: true,
    slug: `lagos-kitchen-${shopId.slice(0, 4)}`,
    name: 'Lagos Kitchen',
    description: { en: 'Égusi, ogbono and palm oil from Nigeria' },
    logoMediaId: null,
    galleryCount: 0,
    categoryIds: [BEAUTY],
    originCountries: ['NG'],
    hasContact: true,
    branches: [
      {
        id: randomUUID(),
        name: 'Al Nahda',
        emirate: 'DXB',
        area: 'Al Nahda',
        location: { lat: 25.2897, lng: 55.3712 },
        serviceArea: null,
        serviceRadiusM: 5000,
        pickup: true,
        delivery: true,
        openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }],
        specialHours: [],
        contactWhatsapp: '+971501234567',
        contactPhone: null,
      },
    ],
    observedAt: tick(),
    ...overrides,
  };
}

function productSnapshot(
  shop: ShopSearchSnapshot,
  overrides: Partial<ProductSearchSnapshot> = {},
): ProductSearchSnapshot {
  return {
    productId: randomUUID(),
    shopId: shop.shopId,
    status: 'active',
    title: { en: 'Poundo yam flour', ar: 'دقيق اليام' },
    description: {},
    categoryId: GRAINS,
    originCountry: 'NG',
    imageMediaIds: [],
    minPriceFils: 2_500,
    branchIds: [shop.branches[0].id],
    observedAt: tick(),
    ...overrides,
  };
}

describe('search read model (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let owners: FakeOwners;
  let indexer: SearchIndexer;

  const branchRow = async (branchId: string) =>
    (
      await db.query(
        `SELECT *, ST_Y(location::geometry) AS lat FROM discovery.search_branch WHERE branch_id = $1`,
        [branchId],
      )
    )[0];
  const productRow = async (productId: string) =>
    (
      await db.query(`SELECT * FROM discovery.search_product WHERE product_id = $1`, [productId])
    )[0];
  const indexShop = (shopId: string) => db.transaction((m) => indexer.indexShop(m, shopId));
  const indexProduct = (p: { productId: string; shopId: string }) =>
    db.transaction((m) => indexer.indexProduct(m, p.productId, p.shopId));

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
  }, 60_000);

  beforeEach(() => {
    owners = new FakeOwners();
    indexer = new SearchIndexer(db, owners);
  });

  afterAll(() => testDb?.drop());

  it('indexes a verified shop’s branches with its products’ categories and their parents', async () => {
    const shop = shopSnapshot();
    owners.shops.set(shop.shopId, shop);
    const flour = productSnapshot(shop);
    owners.products.set(flour.productId, flour);
    await indexShop(shop.shopId);

    const row = await branchRow(shop.branches[0].id);
    expect(row).toMatchObject({
      shop_id: shop.shopId,
      shop_name: 'Lagos Kitchen',
      emirate: 'DXB',
      service_radius_m: 5000,
      verified: true,
      contact_whatsapp: '+971501234567',
      contact_phone: null,
    });
    expect(Number(row.lat)).toBeCloseTo(25.2897, 4);
    expect([...row.category_ids].sort()).toEqual([BEAUTY, FOOD, GRAINS].sort());
    expect(row.hours.weekly).toEqual([{ weekday: 1, opensAt: '09:00', closesAt: '21:00' }]);
    expect(row.completeness_score).toBe(completenessScore(shop, 1));
    expect(await productRow(flour.productId)).toMatchObject({
      min_price_fils: 2_500,
      title_text: 'Poundo yam flour دقيق اليام',
    });
  });

  it('matches text without accents or case, in shop and product text and category names', async () => {
    const shop = shopSnapshot();
    owners.shops.set(shop.shopId, shop);
    const flour = productSnapshot(shop);
    owners.products.set(flour.productId, flour);
    await indexShop(shop.shopId);

    const branchMatches = (q: string) =>
      db.query(
        `SELECT 1 FROM discovery.search_branch WHERE branch_id = $1 AND searchable @@ plainto_tsquery('discovery.am_simple', $2)`,
        [shop.branches[0].id, q],
      );
    expect(await branchMatches('egusi')).toHaveLength(1);
    expect(await branchMatches('GRAINS')).toHaveLength(1);
    expect(await branchMatches('الحبوب')).toHaveLength(1);
    const productMatches = await db.query(
      `SELECT 1 FROM discovery.search_product WHERE product_id = $1 AND searchable @@ plainto_tsquery('discovery.am_simple', 'poundo')`,
      [flour.productId],
    );
    expect(productMatches).toHaveLength(1);
    // Typos are caught by trigram similarity on the titles.
    const [{ sim }] = await db.query(
      `SELECT similarity(title_text, 'pounda yam') AS sim FROM discovery.search_product WHERE product_id = $1`,
      [flour.productId],
    );
    // 0.3 is pg_trgm's own threshold for the % operator.
    expect(sim).toBeGreaterThanOrEqual(0.3);
  });

  it('drops a shop that is no longer verified, and ignores an older snapshot that arrives late', async () => {
    const shop = shopSnapshot();
    owners.shops.set(shop.shopId, shop);
    const flour = productSnapshot(shop);
    owners.products.set(flour.productId, flour);
    await indexShop(shop.shopId);

    const older = {
      ...shop,
      name: 'Old name',
      observedAt: new Date(Date.parse(shop.observedAt) - 60_000).toISOString(),
    };
    owners.shops.set(shop.shopId, older);
    await indexShop(shop.shopId);
    expect((await branchRow(shop.branches[0].id)).shop_name).toBe('Lagos Kitchen');

    owners.shops.set(shop.shopId, { ...shop, verified: false, observedAt: tick() });
    await indexShop(shop.shopId);
    expect(await branchRow(shop.branches[0].id)).toBeUndefined();
    expect(await productRow(flour.productId)).toBeUndefined();
  });

  it('removes branches that are gone and keeps only active products of held shops', async () => {
    const shop = shopSnapshot();
    const second = {
      ...shop.branches[0],
      id: randomUUID(),
      name: 'Deira',
      location: { lat: 25.27, lng: 55.31 },
    };
    owners.shops.set(shop.shopId, { ...shop, branches: [...shop.branches, second] });
    await indexShop(shop.shopId);
    expect(await branchRow(second.id)).toBeDefined();

    owners.shops.set(shop.shopId, { ...shop, observedAt: tick() });
    await indexShop(shop.shopId);
    expect(await branchRow(second.id)).toBeUndefined();

    const hidden = productSnapshot(shop, { status: 'hidden' });
    owners.products.set(hidden.productId, hidden);
    await indexProduct(hidden);
    expect(await productRow(hidden.productId)).toBeUndefined();

    // A product of a shop discovery does not hold (not verified) is not indexed.
    const stranger = shopSnapshot({ verified: false });
    const elsewhere = productSnapshot(stranger);
    owners.products.set(elsewhere.productId, elsewhere);
    await indexProduct(elsewhere);
    expect(await productRow(elsewhere.productId)).toBeUndefined();
  });

  it('follows product changes and removals, updating the branch categories', async () => {
    const shop = shopSnapshot({ categoryIds: [] });
    owners.shops.set(shop.shopId, shop);
    await indexShop(shop.shopId);
    expect((await branchRow(shop.branches[0].id)).category_ids).toEqual([]);

    const flour = productSnapshot(shop);
    owners.products.set(flour.productId, flour);
    await indexProduct(flour);
    expect([...(await branchRow(shop.branches[0].id)).category_ids].sort()).toEqual(
      [FOOD, GRAINS].sort(),
    );

    owners.products.delete(flour.productId);
    await indexProduct(flour);
    expect(await productRow(flour.productId)).toBeUndefined();
    expect((await branchRow(shop.branches[0].id)).category_ids).toEqual([]);
  });

  it('fills image URLs from media.ready, before or after the row exists', async () => {
    const logo = randomUUID();
    const photo = randomUUID();
    await db.transaction((m) =>
      indexer.mediaReady(m, {
        mediaId: logo,
        ownerId: randomUUID(),
        purpose: 'shop_logo',
        urls: { thumb: 'https://cdn/l-thumb.webp', card: 'https://cdn/l-card.webp' },
      }),
    );
    const shop = shopSnapshot({ logoMediaId: logo });
    owners.shops.set(shop.shopId, shop);
    const flour = productSnapshot(shop, { imageMediaIds: [photo] });
    owners.products.set(flour.productId, flour);
    await indexShop(shop.shopId);
    expect((await branchRow(shop.branches[0].id)).logo_url).toBe('https://cdn/l-card.webp');
    expect((await productRow(flour.productId)).image_url).toBeNull();

    await db.transaction((m) =>
      indexer.mediaReady(m, {
        mediaId: photo,
        ownerId: randomUUID(),
        purpose: 'product_image',
        urls: { card: 'https://cdn/p-card.webp' },
      }),
    );
    expect((await productRow(flour.productId)).image_url).toBe('https://cdn/p-card.webp');
  });

  it('rebuilds from the owners, dropping shops that are gone', async () => {
    await db.query(`DELETE FROM discovery.search_branch`);
    await db.query(`DELETE FROM discovery.search_product`);
    const kept = shopSnapshot();
    const gone = shopSnapshot();
    owners.shops.set(kept.shopId, kept);
    owners.shops.set(gone.shopId, gone);
    owners.products.set('x', productSnapshot(kept, { productId: randomUUID() }));
    await indexShop(gone.shopId);
    owners.shops.delete(gone.shopId);

    const result = await indexer.rebuild();
    expect(result).toEqual({ shops: 1, branches: 1, products: 1, removed: 1 });
    expect(await branchRow(gone.branches[0].id)).toBeUndefined();
    expect(await branchRow(kept.branches[0].id)).toBeDefined();
  });
});

describe('pathOf', () => {
  it('lists the parents, root first, and stops at a loop', () => {
    expect(pathOf(CATEGORIES[1], CATEGORIES)).toEqual([FOOD, GRAINS]);
    const a = { ...CATEGORIES[0], id: 'a', parentId: 'b' };
    const b = { ...CATEGORIES[0], id: 'b', parentId: 'a' };
    expect(pathOf(a, [a, b])).toEqual(['b', 'a']);
  });
});
