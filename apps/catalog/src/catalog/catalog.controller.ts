import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { z } from 'zod';
import {
  CatalogErrors,
  CatalogPatterns,
  CategoryDto,
  CategoryList,
  PRODUCT_REVIEW_LIST_SPEC,
  ProductSearchSnapshotResponse,
  ShopProductSnapshotsResponse,
  ProductDto,
  ProductPage,
  RemoveProductResponse,
  SHOP_PRODUCTS_LIST_SPEC,
  UpsertProductResponse,
} from '@am/contracts';
import { listQueryFromPayload } from '@am/core';
import { catalogError } from '../errors';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';
import { SearchSnapshotService } from './search-snapshot.service';

/** The gateway validates first; the service validates again before it persists anything. */
function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw catalogError(CatalogErrors.validationFailed, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const uuid = z.uuid();
const actor = z.object({
  userId: uuid,
  roles: z.array(z.string().max(32)).max(10),
  shops: z
    .array(
      z.object({
        shopId: uuid,
        role: z.enum(['owner', 'manager', 'staff']),
        branchIds: z.array(uuid).max(100).optional(),
      }),
    )
    .max(100),
});
const correlationId = z.string().max(128).optional();
const localized = (max: number) =>
  z
    .object({
      en: z.string().max(max).optional(),
      ar: z.string().max(max).optional(),
      fr: z.string().max(max).optional(),
    })
    .strict();
const fils = z.number().int().min(0).max(100_000_000);
const shopRef = { actor, shopId: uuid, correlationId };

const categorySchema = z.object({
  actor,
  categoryId: uuid.optional(),
  parentId: uuid.nullable().optional(),
  slug: z.string().max(60).optional(),
  name: localized(80).optional(),
  kind: z.enum(['product', 'service']).optional(),
  isRestricted: z.boolean().optional(),
  requiresDeclaration: z.boolean().optional(),
  checkoutAllowed: z.boolean().optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
  correlationId,
});
const listCategoriesSchema = z.object({
  actor: actor.optional(),
  includeInactive: z.boolean().optional(),
});

const declaration = z
  .object({
    packagedAndLabelled: z.literal(true),
    noRestrictedItems: z.literal(true),
    storage: z.enum(['ambient', 'chilled', 'frozen']),
    manufacturer: z.string().max(120).nullable().optional(),
    registrationNumber: z.string().max(60).nullable().optional(),
  })
  .strict();
const variant = z
  .object({
    id: uuid.optional(),
    sku: z.string().max(64).nullable().optional(),
    options: z
      .record(z.string().min(1).max(30), z.string().min(1).max(60))
      .refine((o) => Object.keys(o).length <= 5, 'At most 5 options')
      .optional(),
    priceFils: fils.nullable().optional(),
    compareAtFils: fils.nullable().optional(),
  })
  .strict();
const upsertSchema = z.object({
  ...shopRef,
  productId: uuid.optional(),
  categoryId: uuid.optional(),
  title: localized(140).optional(),
  description: localized(5000).optional(),
  originCountry: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .nullable()
    .optional(),
  imageMediaIds: z.array(uuid).max(10).optional(),
  foodDeclaration: declaration.nullable().optional(),
  variants: z.array(variant).min(1).max(50).optional(),
});
const statusSchema = z.object({
  ...shopRef,
  productId: uuid,
  status: z.enum(['active', 'hidden', 'draft']),
});
const listingsSchema = z.object({
  ...shopRef,
  productId: uuid,
  listings: z
    .array(
      z.object({
        branchId: uuid,
        variantId: uuid,
        inStock: z.boolean(),
        quantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
        priceOverrideFils: fils.nullable().optional(),
      }),
    )
    .max(1000),
});
const stockSchema = z.object({
  ...shopRef,
  branchId: uuid,
  items: z
    .array(
      z.object({
        variantId: uuid,
        inStock: z.boolean(),
        quantity: z.number().int().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
const productRefSchema = z.object({ ...shopRef, productId: uuid });
const getSchema = z.object({ actor: actor.optional(), productId: uuid, shopId: uuid.optional() });
const decideSchema = z.object({
  actor,
  productId: uuid,
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
  correlationId,
});

@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
    private readonly snapshots: SearchSnapshotService,
  ) {}

  @MessagePattern(CatalogPatterns.listCategories)
  listCategories(@Payload() payload: unknown): Promise<CategoryList> {
    return this.categories.list(parse(listCategoriesSchema, payload ?? {}));
  }

  @MessagePattern(CatalogPatterns.upsertCategory)
  upsertCategory(@Payload() payload: unknown): Promise<CategoryDto> {
    return this.categories.upsert(parse(categorySchema, payload));
  }

  @MessagePattern(CatalogPatterns.upsertProduct)
  upsertProduct(@Payload() payload: unknown): Promise<UpsertProductResponse> {
    return this.products.upsert(parse(upsertSchema, payload));
  }

  @MessagePattern(CatalogPatterns.setProductStatus)
  setStatus(@Payload() payload: unknown): Promise<ProductDto> {
    return this.products.setStatus(parse(statusSchema, payload));
  }

  @MessagePattern(CatalogPatterns.setProductListings)
  setListings(@Payload() payload: unknown): Promise<ProductDto> {
    return this.products.setListings(parse(listingsSchema, payload));
  }

  @MessagePattern(CatalogPatterns.updateBranchStock)
  updateStock(@Payload() payload: unknown): Promise<{ updated: number }> {
    return this.products.updateBranchStock(parse(stockSchema, payload));
  }

  @MessagePattern(CatalogPatterns.removeProduct)
  remove(@Payload() payload: unknown): Promise<RemoveProductResponse> {
    return this.products.remove(parse(productRefSchema, payload));
  }

  @MessagePattern(CatalogPatterns.getProduct)
  get(@Payload() payload: unknown): Promise<ProductDto> {
    return this.products.get(parse(getSchema, payload));
  }

  @MessagePattern(CatalogPatterns.listShopProducts)
  listByShop(@Payload() payload: unknown): Promise<ProductPage> {
    const { actor: who, shopId } = parse(
      z.object({ actor: actor.optional(), shopId: uuid }).passthrough(),
      payload,
    );
    return this.products.listByShop({
      actor: who,
      shopId,
      query: listQueryFromPayload(payload, SHOP_PRODUCTS_LIST_SPEC),
    });
  }

  @MessagePattern(CatalogPatterns.reviewQueue)
  reviewQueue(@Payload() payload: unknown): Promise<ProductPage> {
    const { actor: who } = parse(z.object({ actor }).passthrough(), payload);
    return this.products.reviewQueue({
      actor: who,
      query: listQueryFromPayload(payload, PRODUCT_REVIEW_LIST_SPEC),
    });
  }

  @MessagePattern(CatalogPatterns.decideProduct)
  decide(@Payload() payload: unknown): Promise<ProductDto> {
    return this.products.decide(parse(decideSchema, payload));
  }

  // Read by the discovery service only; the gateway routes neither.
  @MessagePattern(CatalogPatterns.productSnapshot)
  productSnapshot(@Payload() payload: unknown): Promise<ProductSearchSnapshotResponse> {
    return this.snapshots.product(parse(z.object({ productId: uuid }), payload));
  }

  @MessagePattern(CatalogPatterns.shopProductSnapshots)
  shopProductSnapshots(@Payload() payload: unknown): Promise<ShopProductSnapshotsResponse> {
    return this.snapshots.shopProducts(parse(z.object({ shopId: uuid }), payload));
  }
}
