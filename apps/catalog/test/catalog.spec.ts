import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  ActorClaims,
  CatalogErrors,
  FoodDeclaration,
  parseListQuery,
  PRODUCT_REVIEW_LIST_SPEC,
  SHOP_PRODUCTS_LIST_SPEC,
} from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { CategoriesService } from '../src/catalog/categories.service';
import { MAX_PRODUCTS_PER_SHOP, ProductsService } from '../src/catalog/products.service';
import { SearchSnapshotService } from '../src/catalog/search-snapshot.service';
import { ShopEvents } from '../src/catalog/shop-events';
import { Category, KnownShop, Product } from '../src/entities';
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
const member = (
  shopId: string,
  role: 'owner' | 'manager' | 'staff',
  branchIds?: string[],
): ActorClaims => ({
  userId: randomUUID(),
  roles: ['customer', 'seller'],
  shops: [{ shopId, role, branchIds }],
});

const DECLARATION: FoodDeclaration = {
  packagedAndLabelled: true,
  noRestrictedItems: true,
  storage: 'ambient',
  manufacturer: 'Olu Foods',
};

describe('catalogue (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let categories: CategoriesService;
  let products: ProductsService;
  let shopEvents: ShopEvents;
  const slugs = new Map<string, string>();

  const events = async (name: string, productId: string) =>
    (await db.getRepository(OutboxMessage).findBy({ name })).filter(
      (e) => (e.envelope as { payload: { productId: string } }).payload.productId === productId,
    );
  const page = (raw: Record<string, unknown> = {}) => parseListQuery(raw, SHOP_PRODUCTS_LIST_SPEC);
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 9, minutes));

  /** A shop the catalogue heard about, with one branch; verified unless asked otherwise. */
  async function shop(options: { verified?: boolean } = {}) {
    const owner = person(['customer', 'seller']);
    const shopId = randomUUID();
    const branchId = randomUUID();
    await shopEvents.shopCreated(db.manager, {
      shopId,
      ownerId: owner.userId,
      name: 'Mama Africa',
      slug: `mama-${shopId.slice(0, 6)}`,
    });
    await shopEvents.branchUpdated(db.manager, { branchId, shopId, deleted: false }, at(0));
    if (options.verified !== false)
      await shopEvents.shopVerified(
        db.manager,
        { shopId, verificationStatus: 'verified', checkoutEnabled: false, codEnabled: false },
        at(1),
      );
    return { owner, shopId, branchId };
  }

  async function product(
    owner: ActorClaims,
    shopId: string,
    category = 'hair-wigs',
    extra: Record<string, unknown> = {},
  ) {
    return (
      await products.upsert({
        actor: owner,
        shopId,
        categoryId: slugs.get(category)!,
        title: { en: 'Brazilian wig', ar: 'باروكة برازيلية' },
        variants: [{ options: { length: '18 in' }, priceFils: 45_000 }],
        ...extra,
      })
    ).product;
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    const outbox = new OutboxService('catalog');
    categories = new CategoriesService(db, outbox);
    products = new ProductsService(db, outbox);
    shopEvents = new ShopEvents(outbox);
    for (const c of await db.manager.find(Category)) slugs.set(c.slug, c.id);
  }, 60_000);

  afterAll(() => testDb?.drop());

  describe('categories', () => {
    it('are seeded as a tree in English, Arabic and French, parents first', async () => {
      const { items } = await categories.list({});
      expect(items).toHaveLength(24);
      expect(items[0]).toMatchObject({
        slug: 'groceries-food',
        parentId: null,
        kind: 'product',
        requiresDeclaration: true,
        name: { en: 'Groceries & Food', ar: 'البقالة والأطعمة', fr: 'Épicerie et alimentation' },
      });
      expect(items[1]).toMatchObject({ slug: 'grains-flours', requiresDeclaration: true });
      for (const c of items)
        expect(c.name).toEqual(
          expect.objectContaining({
            en: expect.any(String),
            ar: expect.any(String),
            fr: expect.any(String),
          }),
        );
      expect(items.find((c) => c.slug === 'money-transfer-agents')).toMatchObject({
        kind: 'service',
        isRestricted: true,
        checkoutAllowed: false,
      });
      expect(items.find((c) => c.slug === 'cosmetics')).toMatchObject({ isRestricted: true });
    });

    it('are changed by admins only, without loops, and an inactive parent hides its children', async () => {
      expect(
        await codeOf(
          categories.upsert({
            actor: person(),
            slug: 'x',
            name: { en: 'X', ar: 'س' },
            kind: 'product',
          }),
        ),
      ).toBe(CatalogErrors.adminOnly);

      const parent = await categories.upsert({
        actor: admin,
        slug: 'test-root',
        name: { en: 'Root', ar: 'جذر' },
        kind: 'product',
        isRestricted: true,
      });
      const child = await categories.upsert({
        actor: admin,
        slug: 'test-child',
        name: { en: 'Child', ar: 'فرع' },
        parentId: parent.id,
      });
      expect(child).toMatchObject({ kind: 'product', isRestricted: true, parentId: parent.id });
      expect(
        await codeOf(
          categories.upsert({ actor: admin, categoryId: parent.id, parentId: child.id }),
        ),
      ).toBe(CatalogErrors.categoryInvalid);
      expect(
        await codeOf(
          categories.upsert({
            actor: admin,
            slug: 'test-root',
            name: { en: 'Again', ar: 'مرة' },
            kind: 'product',
          }),
        ),
      ).toBe(CatalogErrors.categoryInvalid);
      expect(
        await codeOf(
          categories.upsert({
            actor: admin,
            slug: 'test-no-ar',
            name: { en: 'No Arabic' },
            kind: 'product',
          }),
        ),
      ).toBe(CatalogErrors.validationFailed);
      expect(
        await codeOf(categories.upsert({ actor: admin, categoryId: child.id, kind: 'service' })),
      ).toBe(CatalogErrors.categoryInvalid);
      const grandchild = await categories.upsert({
        actor: admin,
        slug: 'test-grandchild',
        name: { en: 'G', ar: 'ح' },
        parentId: child.id,
      });
      expect(
        await codeOf(
          categories.upsert({
            actor: admin,
            slug: 'test-too-deep',
            name: { en: 'D', ar: 'د' },
            parentId: grandchild.id,
          }),
        ),
      ).toBe(CatalogErrors.categoryInvalid);

      await categories.upsert({ actor: admin, categoryId: parent.id, active: false });
      const shown = (await categories.list({})).items.map((c) => c.slug);
      expect(shown).not.toContain('test-root');
      expect(shown).not.toContain('test-child');
      expect(await codeOf(categories.list({ includeInactive: true, actor: person() }))).toBe(
        CatalogErrors.adminOnly,
      );
      expect(
        (await categories.list({ includeInactive: true, actor: admin })).items.map((c) => c.slug),
      ).toContain('test-grandchild');
    });
  });

  describe('a product', () => {
    it('is created as a draft by its shop, typed by its category, and announced', async () => {
      const { owner, shopId } = await shop();
      const created = await product(owner, shopId);
      expect(created).toMatchObject({
        shopId,
        type: 'product',
        status: 'draft',
        title: { en: 'Brazilian wig', ar: 'باروكة برازيلية' },
        variants: [{ options: { length: '18 in' }, priceFils: 45_000, compareAtFils: null }],
        listings: [],
      });
      expect(await events('product.upserted', created.id)).toHaveLength(1);

      const service = await product(owner, shopId, 'hair-salons-braiding', {
        title: { en: 'Knotless braids' },
        variants: [{ priceFils: null }],
      });
      expect(service).toMatchObject({ type: 'service', variants: [{ priceFils: null }] });
    });

    it('is refused to strangers, staff and admins, and needs a price on every variant', async () => {
      const { owner, shopId } = await shop();
      expect(await codeOf(product(person(), shopId))).toBe(CatalogErrors.shopNotFound);
      expect(await codeOf(product(member(shopId, 'staff'), shopId))).toBe(CatalogErrors.forbidden);
      expect(await codeOf(product(admin, shopId))).toBe(CatalogErrors.forbidden);
      expect(await product(member(shopId, 'manager'), shopId)).toMatchObject({ status: 'draft' });
      expect(
        await codeOf(product(owner, shopId, 'hair-wigs', { variants: [{ priceFils: null }] })),
      ).toBe(CatalogErrors.validationFailed);
      expect(
        await codeOf(
          product(owner, shopId, 'hair-wigs', {
            variants: [{ priceFils: 100, compareAtFils: 90 }],
          }),
        ),
      ).toBe(CatalogErrors.validationFailed);
    });

    it('can be made before shop.created arrives, from the member token', async () => {
      const shopId = randomUUID();
      const owner = member(shopId, 'owner');
      expect(await product(owner, shopId)).toMatchObject({ shopId, status: 'draft' });
      expect(await db.manager.findOneBy(KnownShop, { id: shopId })).toMatchObject({
        ownerId: owner.userId,
        verified: false,
      });
    });

    it('keeps SKUs unique in the shop, and replaces its variants as a whole', async () => {
      const { owner, shopId, branchId } = await shop();
      const first = await product(owner, shopId, 'hair-wigs', {
        variants: [
          { sku: 'WIG-18', priceFils: 45_000 },
          { sku: 'WIG-22', priceFils: 55_000 },
        ],
      });
      expect(
        await codeOf(
          product(owner, shopId, 'hair-wigs', { variants: [{ sku: 'WIG-18', priceFils: 1 }] }),
        ),
      ).toBe(CatalogErrors.skuTaken);

      const [v18, v22] = first.variants;
      await products.setListings({
        actor: owner,
        shopId,
        productId: first.id,
        listings: [{ branchId, variantId: v22.id, inStock: true }],
      });
      // Swap the SKUs and drop the 22-inch one: its listing goes with it.
      const { product: changed } = await products.upsert({
        actor: owner,
        shopId,
        productId: first.id,
        variants: [
          { id: v18.id, sku: 'WIG-22' },
          { sku: 'WIG-26', priceFils: 65_000 },
        ],
      });
      expect(changed.variants.map((v) => [v.sku, v.priceFils])).toEqual([
        ['WIG-22', 45_000],
        ['WIG-26', 65_000],
      ]);
      expect(changed.listings).toEqual([]);
      // The removed variant's SKU is free again.
      await product(owner, shopId, 'hair-wigs', { variants: [{ sku: 'WIG-18', priceFils: 1 }] });
    });

    it('returns the images it no longer uses, and when removed', async () => {
      const { owner, shopId } = await shop();
      const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
      const created = await product(owner, shopId, 'hair-wigs', { imageMediaIds: [a, b] });
      const updated = await products.upsert({
        actor: owner,
        shopId,
        productId: created.id,
        imageMediaIds: [b, c],
      });
      expect(updated.releasedMediaIds).toEqual([a]);
      expect(await products.remove({ actor: owner, shopId, productId: created.id })).toEqual({
        releasedMediaIds: [b, c],
      });
      expect(await events('product.removed', created.id)).toHaveLength(1);
      expect(await codeOf(products.get({ actor: owner, productId: created.id }))).toBe(
        CatalogErrors.productNotFound,
      );
    });

    it('is capped per shop', async () => {
      const { owner, shopId } = await shop();
      const created = await product(owner, shopId);
      await db.query(
        `INSERT INTO catalog.product (shop_id, category_id, type, title)
         SELECT $1, $2, 'product', '{"en":"x"}' FROM generate_series(2, $3)`,
        [shopId, created.categoryId, MAX_PRODUCTS_PER_SHOP],
      );
      expect(await codeOf(product(owner, shopId))).toBe(CatalogErrors.tooManyProducts);
    });
  });

  describe('publishing and review', () => {
    it('makes an ordinary product public at once, only while the shop is verified', async () => {
      const { owner, shopId } = await shop();
      const created = await product(owner, shopId);
      expect(await codeOf(products.get({ productId: created.id }))).toBe(
        CatalogErrors.productNotFound,
      );
      expect(
        await products.setStatus({ actor: owner, shopId, productId: created.id, status: 'active' }),
      ).toMatchObject({ status: 'active' });
      expect(await products.get({ productId: created.id })).toMatchObject({
        status: 'active',
        foodDeclaration: null,
      });
      // The seller's view is for the shop's members only, and only under its own shop.
      expect(
        await codeOf(products.get({ actor: person(['customer']), shopId, productId: created.id })),
      ).toBe(CatalogErrors.productNotFound);
      expect(
        await codeOf(products.get({ actor: owner, shopId: randomUUID(), productId: created.id })),
      ).toBe(CatalogErrors.productNotFound);
      expect(await products.get({ actor: owner, shopId, productId: created.id })).toMatchObject({
        id: created.id,
      });
      expect((await products.listByShop({ shopId, query: page() })).items.map((p) => p.id)).toEqual(
        [created.id],
      );

      await shopEvents.shopVerified(
        db.manager,
        { shopId, verificationStatus: 'suspended', checkoutEnabled: false, codEnabled: false },
        at(10),
      );
      // An older decision arriving late changes nothing.
      await shopEvents.shopVerified(
        db.manager,
        { shopId, verificationStatus: 'verified', checkoutEnabled: false, codEnabled: false },
        at(5),
      );
      expect(await codeOf(products.get({ productId: created.id }))).toBe(
        CatalogErrors.productNotFound,
      );
      expect((await products.listByShop({ shopId, query: page() })).items).toEqual([]);
      // Its members still see it.
      expect(
        (await products.listByShop({ actor: owner, shopId, query: page() })).items,
      ).toHaveLength(1);

      await products.setStatus({ actor: owner, shopId, productId: created.id, status: 'hidden' });
      expect(
        await codeOf(
          products.setStatus({ actor: owner, shopId, productId: created.id, status: 'hidden' }),
        ),
      ).toBeUndefined();
    });

    it('sends food to review with its declaration, and back to review when it changes', async () => {
      const { owner, shopId } = await shop();
      const food = await product(owner, shopId, 'grains-flours', {
        title: { en: 'Poundo yam flour' },
      });
      expect(
        await codeOf(
          products.setStatus({ actor: owner, shopId, productId: food.id, status: 'active' }),
        ),
      ).toBe(CatalogErrors.declarationRequired);

      await products.upsert({
        actor: owner,
        shopId,
        productId: food.id,
        foodDeclaration: DECLARATION,
      });
      const waiting = await products.setStatus({
        actor: owner,
        shopId,
        productId: food.id,
        status: 'active',
      });
      expect(waiting).toMatchObject({
        status: 'pending_review',
        submittedAt: expect.any(String),
        foodDeclaration: { ...DECLARATION, declaredBy: owner.userId },
      });
      expect(await codeOf(products.get({ productId: food.id }))).toBe(
        CatalogErrors.productNotFound,
      );

      const queue = await products.reviewQueue({
        actor: admin,
        query: parseListQuery({ 'filter[shopId]': shopId }, PRODUCT_REVIEW_LIST_SPEC),
      });
      expect(queue.items.map((p) => p.id)).toEqual([food.id]);
      expect(
        await codeOf(
          products.reviewQueue({
            actor: owner,
            query: parseListQuery({}, PRODUCT_REVIEW_LIST_SPEC),
          }),
        ),
      ).toBe(CatalogErrors.adminOnly);

      expect(
        await products.decide({ actor: admin, productId: food.id, decision: 'approve' }),
      ).toMatchObject({ status: 'active' });
      expect(await products.get({ productId: food.id })).toMatchObject({ status: 'active' });

      // A price change keeps it public; a new title sends it back to review.
      const [variant] = food.variants;
      expect(
        (
          await products.upsert({
            actor: owner,
            shopId,
            productId: food.id,
            variants: [{ id: variant.id, priceFils: 2_500 }],
          })
        ).product.status,
      ).toBe('active');
      expect(
        (
          await products.upsert({
            actor: owner,
            shopId,
            productId: food.id,
            title: { en: 'Poundo yam flour 2 kg' },
          })
        ).product.status,
      ).toBe('pending_review');
    });

    it('reviews restricted categories, and needs a reason to reject', async () => {
      const { owner, shopId } = await shop();
      const cream = await product(owner, shopId, 'skin-care', { title: { en: 'Shea butter' } });
      expect(
        (await products.setStatus({ actor: owner, shopId, productId: cream.id, status: 'active' }))
          .status,
      ).toBe('pending_review');
      expect(
        await codeOf(products.decide({ actor: admin, productId: cream.id, decision: 'reject' })),
      ).toBe(CatalogErrors.reasonRequired);
      expect(
        await products.decide({
          actor: admin,
          productId: cream.id,
          decision: 'reject',
          reason: 'Label missing',
        }),
      ).toMatchObject({ status: 'rejected', reviewReason: 'Label missing' });
      // On the admin audit log, with the reason.
      const recorded = (await db.getRepository(OutboxMessage).findBy({ name: 'audit.recorded' }))
        .map((e) => (e.envelope as { payload: { subjectId: string } }).payload)
        .filter((p) => p.subjectId === cream.id);
      expect(recorded).toEqual([
        {
          actorId: admin.userId,
          action: 'product.rejected',
          subjectType: 'product',
          subjectId: cream.id,
          shopId,
          details: { from: 'pending_review', reason: 'Label missing' },
        },
      ]);
    });

    it('reviews a rejected ordinary product before it shows again', async () => {
      const { owner, shopId } = await shop();
      const wig = await product(owner, shopId);
      await products.setStatus({ actor: owner, shopId, productId: wig.id, status: 'active' });
      await products.decide({
        actor: admin,
        productId: wig.id,
        decision: 'reject',
        reason: 'Stock photo',
      });
      expect(await products.get({ actor: owner, productId: wig.id })).toMatchObject({
        status: 'rejected',
        reviewReason: 'Stock photo',
      });
      await products.setStatus({ actor: owner, shopId, productId: wig.id, status: 'draft' });
      expect(
        (await products.setStatus({ actor: owner, shopId, productId: wig.id, status: 'active' }))
          .status,
      ).toBe('pending_review');
      await products.decide({ actor: admin, productId: wig.id, decision: 'approve' });
      expect(await products.get({ productId: wig.id })).toMatchObject({
        status: 'active',
        reviewReason: null,
      });
    });
  });

  describe('branch listings', () => {
    it('are only at the shop own known branches, and staff change stock only where they work', async () => {
      const { owner, shopId, branchId } = await shop();
      const other = await shop();
      const otherBranch = randomUUID();
      await shopEvents.branchUpdated(
        db.manager,
        { branchId: otherBranch, shopId, deleted: false },
        at(0),
      );
      const wig = await product(owner, shopId);
      const [variant] = wig.variants;

      expect(
        await codeOf(
          products.setListings({
            actor: owner,
            shopId,
            productId: wig.id,
            listings: [{ branchId: other.branchId, variantId: variant.id, inStock: true }],
          }),
        ),
      ).toBe(CatalogErrors.branchNotFound);
      const listed = await products.setListings({
        actor: owner,
        shopId,
        productId: wig.id,
        listings: [
          {
            branchId,
            variantId: variant.id,
            inStock: true,
            quantity: 3,
            priceOverrideFils: 42_000,
          },
          { branchId: otherBranch, variantId: variant.id, inStock: false },
        ],
      });
      expect(listed.listings).toHaveLength(2);

      const staff = member(shopId, 'staff', [branchId]);
      expect(
        await codeOf(
          products.setListings({ actor: staff, shopId, productId: wig.id, listings: [] }),
        ),
      ).toBe(CatalogErrors.forbidden);
      expect(
        await products.updateBranchStock({
          actor: staff,
          shopId,
          branchId,
          items: [{ variantId: variant.id, inStock: false, quantity: 0 }],
        }),
      ).toEqual({ updated: 1 });
      expect(
        await codeOf(
          products.updateBranchStock({
            actor: staff,
            shopId,
            branchId: otherBranch,
            items: [{ variantId: variant.id, inStock: true }],
          }),
        ),
      ).toBe(CatalogErrors.forbidden);
      expect(
        await codeOf(
          products.updateBranchStock({
            actor: admin,
            shopId,
            branchId,
            items: [{ variantId: variant.id, inStock: true }],
          }),
        ),
      ).toBe(CatalogErrors.forbidden);

      const after = await products.get({ actor: owner, productId: wig.id });
      expect(after.listings.find((l) => l.branchId === branchId)).toMatchObject({
        inStock: false,
        quantity: 0,
        priceOverrideFils: 42_000,
      });
    });

    it('go when their branch is removed, and the product is announced again', async () => {
      const { owner, shopId, branchId } = await shop();
      const wig = await product(owner, shopId);
      await products.setListings({
        actor: owner,
        shopId,
        productId: wig.id,
        listings: [{ branchId, variantId: wig.variants[0].id, inStock: true }],
      });
      const before = (await events('product.upserted', wig.id)).length;

      await shopEvents.branchUpdated(db.manager, { branchId, shopId, deleted: true }, at(20));
      // A late, older "updated" does not bring it back.
      await shopEvents.branchUpdated(db.manager, { branchId, shopId, deleted: false }, at(15));
      expect((await products.get({ actor: owner, productId: wig.id })).listings).toEqual([]);
      expect(await events('product.upserted', wig.id)).toHaveLength(before + 1);
      expect(
        await codeOf(
          products.setListings({
            actor: owner,
            shopId,
            productId: wig.id,
            listings: [{ branchId, variantId: wig.variants[0].id, inStock: true }],
          }),
        ),
      ).toBe(CatalogErrors.branchNotFound);
    });
  });

  describe('lists', () => {
    it('page by keyset and search titles in any language', async () => {
      const { owner, shopId } = await shop();
      for (const en of ['Egusi seeds', 'Ogbono', 'Palm oil'])
        await product(owner, shopId, 'hair-wigs', { title: { en, ar: 'منتج' } });
      const first = await products.listByShop({
        actor: owner,
        shopId,
        query: page({ limit: '2' }),
      });
      expect(first.items).toHaveLength(2);
      const second = await products.listByShop({
        actor: owner,
        shopId,
        query: page({ limit: '2', cursor: first.nextCursor }),
      });
      expect(second.items).toHaveLength(1);
      expect(new Set([...first.items, ...second.items].map((p) => p.id)).size).toBe(3);

      const found = await products.listByShop({
        actor: owner,
        shopId,
        query: page({ 'filter[search][like]': 'egusi' }),
      });
      expect(found.items.map((p) => p.title.en)).toEqual(['Egusi seeds']);
      expect(await db.manager.countBy(Product, { shopId })).toBe(3);
    });
  });

  describe('search snapshots (for discovery)', () => {
    it('give each product its status, in-stock branches and lowest price', async () => {
      const snapshots = new SearchSnapshotService(db);
      const { owner, shopId, branchId } = await shop({ verified: false });
      const wig = await product(owner, shopId, 'hair-wigs', {
        variants: [{ priceFils: 45_000 }, { priceFils: 30_000 }],
      });
      const [long, short] = wig.variants;
      expect(await snapshots.product({ productId: wig.id })).toMatchObject({
        productId: wig.id,
        shopId,
        status: 'draft',
        minPriceFils: 30_000,
        branchIds: [],
      });

      await products.setListings({
        actor: owner,
        shopId,
        productId: wig.id,
        listings: [
          { branchId, variantId: long.id, inStock: true, priceOverrideFils: 40_000 },
          { branchId, variantId: short.id, inStock: false },
        ],
      });
      const listed = await snapshots.shopProducts({ shopId });
      expect(listed.products).toEqual([
        expect.objectContaining({ productId: wig.id, minPriceFils: 40_000, branchIds: [branchId] }),
      ]);
      expect(Date.parse(listed.observedAt)).not.toBeNaN();

      await products.remove({ actor: owner, shopId, productId: wig.id });
      expect(await snapshots.product({ productId: wig.id })).toBeNull();
    });
  });
});
