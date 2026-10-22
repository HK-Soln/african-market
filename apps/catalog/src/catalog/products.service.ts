import { DataSource, EntityManager, In, IsNull, QueryFailedError } from 'typeorm';
import {
  ActorClaims,
  CatalogErrors,
  DecideProductRequest,
  FoodDeclaration,
  GetProductRequest,
  ListReviewQueueRequest,
  ListShopProductsRequest,
  LocalizedString,
  ProductDto,
  ProductPage,
  RemoveProductRequest,
  RemoveProductResponse,
  SetProductListingsRequest,
  SetProductStatusRequest,
  UpdateBranchStockRequest,
  UpsertProductRequest,
  UpsertProductResponse,
  VariantInput,
} from '@am/contracts';
import { findPage, OutboxService } from '@am/database';
import { BranchListing, KnownBranch, KnownShop, Product, Variant } from '../entities';
import { catalogError, invalid } from '../errors';
import { accessTo, canWorkAt, requireAdmin, requireEditor, shopFor } from './access';
import { categoryRules, CategoryRules } from './categories.service';
import { toProductDto } from './mapper';

/** Products one shop may have; well above what a shop lists by hand, and support can lift it. */
export const MAX_PRODUCTS_PER_SHOP = 1000;

const SHOP_LIST_COLUMNS = {
  status: 'p.status',
  categoryId: 'p.category_id',
  type: 'p.type',
  search: `concat_ws(' ', p.title->>'en', p.title->>'ar', p.title->>'fr')`,
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
};

const REVIEW_COLUMNS = {
  categoryId: 'p.category_id',
  shopId: 'p.shop_id',
  submittedAt: 'p.submitted_at',
};

/** A text in each language, trimmed; empty ones dropped. */
function cleanText(text: LocalizedString): LocalizedString {
  const out: LocalizedString = {};
  for (const lang of ['en', 'ar', 'fr'] as const) {
    const value = text[lang]?.trim();
    if (value) out[lang] = value;
  }
  return out;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const isUniqueViolation = (err: unknown) =>
  err instanceof QueryFailedError && (err as QueryFailedError & { code?: string }).code === '23505';

/**
 * Whether publishing goes through an admin first: food and restricted categories, and anything
 * an admin rejected, until an admin has approved the product as it is now.
 */
function needsReview(product: Product, rules: CategoryRules): boolean {
  if (product.reviewedAt) return false;
  return rules.isRestricted || rules.requiresDeclaration || product.reviewReason !== null;
}

/** Products, their variants and where they are, as their shops keep them. */
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  /** Creates a draft, or changes a product. A reviewed product that changes is reviewed again. */
  async upsert(input: UpsertProductRequest): Promise<UpsertProductResponse> {
    return this.write(async (manager) => {
      const shop = await shopFor(manager, input.actor, input.shopId, { lock: true });
      requireEditor(input.actor, shop);

      let product: Product;
      let variants: Variant[] = [];
      if (input.productId) {
        product = await this.lockProduct(manager, shop.id, input.productId);
        variants = await manager.findBy(Variant, { productId: product.id });
      } else {
        if (!input.categoryId) throw invalid('categoryId', 'Required');
        if (!input.title) throw invalid('title', 'Required');
        if (!input.variants?.length) throw invalid('variants', 'At least one variant');
        const count = await manager.countBy(Product, { shopId: shop.id });
        if (count >= MAX_PRODUCTS_PER_SHOP) throw catalogError(CatalogErrors.tooManyProducts);
        product = manager.create(Product, {
          shopId: shop.id,
          status: 'draft',
          description: {},
          imageMediaIds: [],
          originCountry: null,
          reviewReason: null,
          reviewedAt: null,
          reviewedBy: null,
          submittedAt: null,
          foodDeclaration: null,
        });
      }

      const before = {
        categoryId: product.categoryId,
        title: product.title,
        description: product.description,
        imageMediaIds: product.imageMediaIds,
        foodDeclaration: product.foodDeclaration,
      };

      const categoryId = input.categoryId ?? product.categoryId;
      const rules = await categoryRules(manager, categoryId);
      if (!rules) throw catalogError(CatalogErrors.categoryNotFound);
      if (categoryId !== product.categoryId) {
        if (!rules.active) throw catalogError(CatalogErrors.categoryInactive);
        product.categoryId = categoryId;
        product.type = rules.category.kind;
      }
      if (input.title !== undefined) {
        const title = cleanText(input.title);
        if (!title.en && !title.ar) throw invalid('title', 'An English or Arabic title');
        product.title = title;
      }
      if (input.description !== undefined) product.description = cleanText(input.description);
      if (input.originCountry !== undefined)
        product.originCountry = input.originCountry?.toUpperCase() ?? null;
      if (input.imageMediaIds !== undefined)
        product.imageMediaIds = [...new Set(input.imageMediaIds)];
      if (input.foodDeclaration !== undefined)
        product.foodDeclaration = input.foodDeclaration
          ? this.declaration(input.foodDeclaration, input.actor)
          : null;
      // A declaration only belongs to food.
      if (!rules.requiresDeclaration) product.foodDeclaration = null;

      const reviewedPartChanged =
        before.categoryId !== product.categoryId ||
        !sameJson(before.title, product.title) ||
        !sameJson(before.description, product.description) ||
        !sameJson(before.imageMediaIds, product.imageMediaIds) ||
        !sameJson(
          before.foodDeclaration && { ...before.foodDeclaration, declaredAt: 0 },
          product.foodDeclaration && { ...product.foodDeclaration, declaredAt: 0 },
        );
      if (input.productId && reviewedPartChanged) {
        product.reviewedAt = null;
        product.reviewedBy = null;
        // What customers see must be what was reviewed: it goes back to the queue.
        if (product.status === 'active' && needsReview(product, rules)) {
          this.requireDeclaration(product, rules);
          product.status = 'pending_review';
          product.submittedAt = new Date();
        }
      }
      if (product.status === 'pending_review') this.requireDeclaration(product, rules);

      product = await manager.save(product);
      // The DTO below reloads the variants, so the saved list is not kept here.
      if (input.variants !== undefined)
        await this.saveVariants(manager, product, variants, input.variants);
      else this.checkPrices(product, variants);

      await this.announce(manager, 'product.upserted', product, input.correlationId);
      const after = new Set(product.imageMediaIds);
      return {
        product: await this.dto(manager, product, 'full'),
        releasedMediaIds: before.imageMediaIds?.filter((id) => !after.has(id)) ?? [],
      };
    });
  }

  /** Publish (through review when needed), hide, or back to draft. */
  async setStatus(input: SetProductStatusRequest): Promise<ProductDto> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await shopFor(manager, input.actor, input.shopId);
      requireEditor(input.actor, shop);
      const product = await this.lockProduct(manager, shop.id, input.productId);
      const from = product.status;

      if (input.status === 'active') {
        if (from === 'active' || from === 'pending_review')
          return this.dto(manager, product, 'full');
        const rules = await categoryRules(manager, product.categoryId);
        if (!rules?.active) throw catalogError(CatalogErrors.categoryInactive);
        const variants = await manager.findBy(Variant, { productId: product.id });
        this.checkPrices(product, variants);
        this.requireDeclaration(product, rules);
        if (needsReview(product, rules)) {
          product.status = 'pending_review';
          product.submittedAt = new Date();
        } else {
          product.status = 'active';
        }
      } else if (input.status === 'hidden') {
        if (from === 'hidden') return this.dto(manager, product, 'full');
        if (from !== 'active' && from !== 'pending_review')
          throw catalogError(CatalogErrors.invalidTransition, { from, to: 'hidden' });
        product.status = 'hidden';
      } else {
        if (from === 'draft') return this.dto(manager, product, 'full');
        product.status = 'draft';
      }

      await manager.save(product);
      await this.announce(manager, 'product.upserted', product, input.correlationId);
      return this.dto(manager, product, 'full');
    });
  }

  /** Replaces where the product is: each listing a variant at one of the shop's branches. */
  async setListings(input: SetProductListingsRequest): Promise<ProductDto> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await shopFor(manager, input.actor, input.shopId);
      requireEditor(input.actor, shop);
      const product = await this.lockProduct(manager, shop.id, input.productId);

      const variantIds = new Set(
        (await manager.findBy(Variant, { productId: product.id })).map((v) => v.id),
      );
      await this.requireBranches(
        manager,
        shop,
        input.listings.map((l) => l.branchId),
      );
      const seen = new Set<string>();
      for (const [i, listing] of input.listings.entries()) {
        if (!variantIds.has(listing.variantId))
          throw catalogError(CatalogErrors.variantNotFound, { variantId: listing.variantId });
        const key = `${listing.branchId}:${listing.variantId}`;
        if (seen.has(key)) throw invalid(`listings.${i}`, 'Listed twice');
        seen.add(key);
      }

      await manager.delete(BranchListing, { productId: product.id });
      if (input.listings.length) {
        await manager.insert(
          BranchListing,
          input.listings.map((l) => ({
            branchId: l.branchId,
            variantId: l.variantId,
            productId: product.id,
            shopId: shop.id,
            inStock: l.inStock,
            quantity: l.quantity ?? null,
            priceOverrideFils: l.priceOverrideFils ?? null,
          })),
        );
      }
      await this.touch(manager, product);
      await this.announce(manager, 'product.upserted', product, input.correlationId);
      return this.dto(manager, product, 'full');
    });
  }

  /** Stock at one branch, for its staff as well: only variants already listed there. */
  async updateBranchStock(input: UpdateBranchStockRequest): Promise<{ updated: number }> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await shopFor(manager, input.actor, input.shopId);
      if (!accessTo(input.actor, shop)) throw catalogError(CatalogErrors.shopNotFound);
      if (!canWorkAt(input.actor, shop, input.branchId))
        throw catalogError(CatalogErrors.forbidden);
      await this.requireBranches(manager, shop, [input.branchId]);

      const variantIds = [...new Set(input.items.map((i) => i.variantId))];
      if (variantIds.length !== input.items.length) throw invalid('items', 'A variant twice');
      const listings = await manager.find(BranchListing, {
        where: { branchId: input.branchId, variantId: In(variantIds) },
        lock: { mode: 'pessimistic_write' },
      });
      const byVariant = new Map(listings.map((l) => [l.variantId, l]));
      for (const item of input.items) {
        const listing = byVariant.get(item.variantId);
        if (!listing)
          throw catalogError(CatalogErrors.variantNotFound, { variantId: item.variantId });
        listing.inStock = item.inStock;
        if (item.quantity !== undefined) listing.quantity = item.quantity;
      }
      await manager.save(listings);

      const productIds = [...new Set(listings.map((l) => l.productId))];
      const products = productIds.length
        ? await manager.findBy(Product, { id: In(productIds) })
        : [];
      for (const product of products) {
        await this.touch(manager, product);
        await this.announce(manager, 'product.upserted', product, input.correlationId);
      }
      return { updated: listings.length };
    });
  }

  async remove(input: RemoveProductRequest): Promise<RemoveProductResponse> {
    return this.dataSource.transaction(async (manager) => {
      const shop = await shopFor(manager, input.actor, input.shopId);
      requireEditor(input.actor, shop);
      const product = await this.lockProduct(manager, shop.id, input.productId);
      await manager.delete(BranchListing, { productId: product.id });
      await manager.softDelete(Variant, { productId: product.id });
      await manager.softDelete(Product, { id: product.id });
      await this.announce(manager, 'product.removed', product, input.correlationId);
      return { releasedMediaIds: product.imageMediaIds };
    });
  }

  /** Members and admins see any of the shop's products; others an active one of a verified shop. */
  async get(input: GetProductRequest): Promise<ProductDto> {
    const manager = this.dataSource.manager;
    const product = await manager.findOneBy(Product, { id: input.productId });
    if (!product) throw catalogError(CatalogErrors.productNotFound);
    const shop = await manager.findOneBy(KnownShop, { id: product.shopId });
    const member = shop ? accessTo(input.actor, shop) !== undefined : false;
    if (input.shopId) {
      if (product.shopId !== input.shopId || !member)
        throw catalogError(CatalogErrors.productNotFound);
      return this.dto(manager, product, 'full');
    }
    if (member) return this.dto(manager, product, 'full');
    if (product.status !== 'active' || !shop?.verified)
      throw catalogError(CatalogErrors.productNotFound);
    return this.dto(manager, product, 'public');
  }

  async listByShop(input: ListShopProductsRequest): Promise<ProductPage> {
    const manager = this.dataSource.manager;
    const shop = await manager.findOneBy(KnownShop, { id: input.shopId });
    const member = shop ? accessTo(input.actor, shop) !== undefined : false;
    if (!member && !shop?.verified) return { items: [], nextCursor: null, prevCursor: null };

    const qb = manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .where('p.shop_id = :shopId', { shopId: input.shopId });
    if (!member) qb.andWhere(`p.status = 'active'`);
    const page = await findPage(qb, input.query, { columns: SHOP_LIST_COLUMNS, id: 'p.id' });
    return { ...page, items: await this.dtos(manager, page.items, member ? 'full' : 'public') };
  }

  /** Admins: products waiting for a decision, oldest first. */
  async reviewQueue(input: ListReviewQueueRequest): Promise<ProductPage> {
    requireAdmin(input.actor);
    const manager = this.dataSource.manager;
    const qb = manager
      .getRepository(Product)
      .createQueryBuilder('p')
      .where(`p.status = 'pending_review'`);
    const page = await findPage(qb, input.query, { columns: REVIEW_COLUMNS, id: 'p.id' });
    return { ...page, items: await this.dtos(manager, page.items, 'full') };
  }

  /** Admins: approve what waits for review, or reject it (or take down a public product). */
  async decide(input: DecideProductRequest): Promise<ProductDto> {
    requireAdmin(input.actor);
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: { id: input.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) throw catalogError(CatalogErrors.productNotFound);
      const from = product.status;

      if (input.decision === 'approve') {
        if (from !== 'pending_review')
          throw catalogError(CatalogErrors.invalidTransition, { from, to: 'active' });
        product.status = 'active';
        product.reviewedAt = new Date();
        product.reviewedBy = input.actor.userId;
        product.reviewReason = null;
      } else {
        const reason = input.reason?.trim();
        if (!reason) throw catalogError(CatalogErrors.reasonRequired);
        if (from !== 'pending_review' && from !== 'active' && from !== 'hidden')
          throw catalogError(CatalogErrors.invalidTransition, { from, to: 'rejected' });
        product.status = 'rejected';
        product.reviewedAt = null;
        product.reviewedBy = input.actor.userId;
        product.reviewReason = reason;
      }
      await manager.save(product);
      await this.announce(manager, 'product.upserted', product, input.correlationId);
      // The admin audit log (decision T-42).
      await this.outbox.enqueue(
        manager,
        'audit.recorded',
        {
          actorId: input.actor.userId,
          action: input.decision === 'approve' ? 'product.approved' : 'product.rejected',
          subjectType: 'product',
          subjectId: product.id,
          shopId: product.shopId,
          details: { from, reason: product.reviewReason },
        },
        input.correlationId,
      );
      return this.dto(manager, product, 'full');
    });
  }

  /** Runs a write, turning a SKU clash between concurrent saves into its error. */
  private async write<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(fn);
    } catch (err) {
      if (isUniqueViolation(err)) throw catalogError(CatalogErrors.skuTaken);
      throw err;
    }
  }

  private declaration(input: FoodDeclaration, actor: ActorClaims) {
    return {
      packagedAndLabelled: input.packagedAndLabelled,
      noRestrictedItems: input.noRestrictedItems,
      storage: input.storage,
      manufacturer: input.manufacturer?.trim() || null,
      registrationNumber: input.registrationNumber?.trim() || null,
      declaredBy: actor.userId,
      declaredAt: new Date().toISOString(),
    };
  }

  private requireDeclaration(product: Product, rules: CategoryRules): void {
    if (rules.requiresDeclaration && !product.foodDeclaration)
      throw catalogError(CatalogErrors.declarationRequired);
  }

  /** A product needs a price on every variant; a service may be priced on request. */
  private checkPrices(product: Product, variants: Array<Pick<Variant, 'priceFils'>>): void {
    if (!variants.length) throw invalid('variants', 'At least one variant');
    if (product.type === 'product')
      variants.forEach((v, i) => {
        if (v.priceFils === null || v.priceFils === undefined)
          throw invalid(`variants.${i}.priceFils`, 'Required for a product');
      });
  }

  /** Makes the product's variants the given list: kept ones changed, new ones added, the rest removed. */
  private async saveVariants(
    manager: EntityManager,
    product: Product,
    existing: Variant[],
    inputs: VariantInput[],
  ): Promise<Variant[]> {
    if (!inputs.length) throw invalid('variants', 'At least one variant');
    const byId = new Map(existing.map((v) => [v.id, v]));
    const skus = new Set<string>();
    const kept: Variant[] = [];
    for (const [i, input] of inputs.entries()) {
      let variant: Variant;
      if (input.id) {
        const found = byId.get(input.id);
        if (!found) throw catalogError(CatalogErrors.variantNotFound, { variantId: input.id });
        if (kept.includes(found)) throw invalid(`variants.${i}.id`, 'Listed twice');
        variant = found;
      } else {
        variant = manager.create(Variant, {
          productId: product.id,
          shopId: product.shopId,
          sku: null,
          options: {},
          priceFils: null,
          compareAtFils: null,
        });
      }
      if (input.sku !== undefined) variant.sku = input.sku?.trim() || null;
      if (input.options !== undefined) variant.options = input.options;
      if (input.priceFils !== undefined) variant.priceFils = input.priceFils;
      if (input.compareAtFils !== undefined) variant.compareAtFils = input.compareAtFils;
      variant.sort = i;
      if (variant.sku) {
        if (skus.has(variant.sku)) throw catalogError(CatalogErrors.skuTaken, { sku: variant.sku });
        skus.add(variant.sku);
      }
      if (
        variant.compareAtFils !== null &&
        (variant.priceFils === null || variant.compareAtFils <= variant.priceFils)
      )
        throw invalid(`variants.${i}.compareAtFils`, 'Must be above the price');
      kept.push(variant);
    }
    this.checkPrices(product, kept);

    const removed = existing.filter((v) => !kept.includes(v)).map((v) => v.id);
    if (removed.length) {
      await manager.delete(BranchListing, { variantId: In(removed) });
      await manager.softDelete(Variant, { id: In(removed) });
    }
    // Free SKUs before taking them, so two variants can swap theirs in one save.
    const changing = kept.filter((v) => v.id && v.sku);
    if (changing.length)
      await manager.update(Variant, { id: In(changing.map((v) => v.id)) }, { sku: null });
    return manager.save(kept);
  }

  private async requireBranches(
    manager: EntityManager,
    shop: KnownShop,
    branchIds: string[],
  ): Promise<void> {
    const wanted = [...new Set(branchIds)];
    if (!wanted.length) return;
    const known = await manager.findBy(KnownBranch, {
      id: In(wanted),
      shopId: shop.id,
      deleted: false,
    });
    const found = new Set(known.map((b) => b.id));
    const missing = wanted.find((id) => !found.has(id));
    if (missing) throw catalogError(CatalogErrors.branchNotFound, { branchId: missing });
  }

  private async lockProduct(
    manager: EntityManager,
    shopId: string,
    productId: string,
  ): Promise<Product> {
    const product = await manager.findOne(Product, {
      where: { id: productId, shopId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!product) throw catalogError(CatalogErrors.productNotFound);
    return product;
  }

  /** Marks the product changed when only its listings did. */
  private async touch(manager: EntityManager, product: Product): Promise<void> {
    product.updatedAt = new Date();
    await manager.update(Product, { id: product.id }, { updatedAt: product.updatedAt });
  }

  private announce(
    manager: EntityManager,
    name: 'product.upserted' | 'product.removed',
    product: Product,
    correlationId?: string,
  ) {
    return this.outbox.enqueue(
      manager,
      name,
      { productId: product.id, shopId: product.shopId },
      correlationId,
    );
  }

  private async dto(
    manager: EntityManager,
    product: Product,
    view: 'full' | 'public',
  ): Promise<ProductDto> {
    return (await this.dtos(manager, [product], view))[0];
  }

  private async dtos(
    manager: EntityManager,
    products: Product[],
    view: 'full' | 'public',
  ): Promise<ProductDto[]> {
    if (!products.length) return [];
    const ids = products.map((p) => p.id);
    // One after the other: inside a transaction both would share one connection anyway.
    const variants = await manager.findBy(Variant, { productId: In(ids) });
    const listings = await manager.findBy(BranchListing, { productId: In(ids) });
    return products.map((p) => toProductDto(p, variants, listings, view));
  }
}
