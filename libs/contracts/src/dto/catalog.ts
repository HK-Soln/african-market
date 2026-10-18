import type { ListQuery, ListSpec, Page } from '../list-query';
import type { ActorClaims, LocalizedString } from './actor';

/**
 * Catalogue contracts (F1-04). A shop's products and services, their variants and prices, and
 * which branches have them. Products in food and restricted categories are reviewed by an admin
 * before customers see them; products of shops that are not verified are never public.
 */

export type CategoryKind = 'product' | 'service';

export interface CategoryDto {
  id: string;
  parentId: string | null;
  slug: string;
  name: LocalizedString;
  kind: CategoryKind;
  /** Regulated goods or services: products in it are reviewed by an admin before they show. */
  isRestricted: boolean;
  /** Food: the seller fills a declaration, and an admin reviews the product. */
  requiresDeclaration: boolean;
  /** False for listing-only categories (money transfer agents): never sold through checkout. */
  checkoutAllowed: boolean;
  sort: number;
  /** Inactive categories take no new products and are not offered to sellers or customers. */
  active: boolean;
}

/** Public: the active categories, parents before children, each level by `sort`. */
export interface ListCategoriesRequest {
  /** Admins only: inactive categories too. */
  actor?: ActorClaims;
  includeInactive?: boolean;
}

/** The tree is curated by admins and stays small (at most MAX_CATEGORIES), so it is one list. */
export interface CategoryList {
  items: CategoryDto[];
}

/** Admins: creates a category (no `categoryId`; slug, name and kind required) or changes one. */
export interface UpsertCategoryRequest {
  actor: ActorClaims;
  categoryId?: string;
  parentId?: string | null;
  slug?: string;
  name?: LocalizedString;
  kind?: CategoryKind;
  isRestricted?: boolean;
  requiresDeclaration?: boolean;
  checkoutAllowed?: boolean;
  sort?: number;
  active?: boolean;
  correlationId?: string;
}

export type ProductType = 'product' | 'service';

/**
 * draft: being prepared. pending_review: waiting for an admin (food, restricted, or after a
 * rejection). active: public. hidden: taken down by the seller. rejected: refused by an admin.
 */
export type ProductStatus = 'draft' | 'pending_review' | 'active' | 'hidden' | 'rejected';

/**
 * What a seller states about a food product (categories with `requiresDeclaration`). The two
 * confirmations must be true; an admin reviews the product before it shows.
 */
export interface FoodDeclaration {
  /** Commercially packaged, with a label naming the product, maker, origin, ingredients and expiry. */
  packagedAndLabelled: true;
  /** Not fresh meat, not unlabelled goods, not herbal medicine. */
  noRestrictedItems: true;
  storage: 'ambient' | 'chilled' | 'frozen';
  manufacturer?: string | null;
  /** The product's registration with a food authority (Dubai Municipality's Montaji, ...). */
  registrationNumber?: string | null;
}

/** The declaration as stored: who made it and when. */
export interface FoodDeclarationRecord extends FoodDeclaration {
  declaredBy: string;
  /** ISO-8601. */
  declaredAt: string;
}

export interface VariantDto {
  id: string;
  sku: string | null;
  /** What tells variants apart, e.g. `{ "size": "5 kg" }`; empty for a single variant. */
  options: Record<string, string>;
  /** VAT included. Null only for a service priced on request. */
  priceFils: number | null;
  /** The earlier price, shown struck through; above `priceFils`. */
  compareAtFils: number | null;
  sort: number;
}

/** A variant at a branch: whether it is there, how many, and the branch's own price. */
export interface BranchListingDto {
  branchId: string;
  variantId: string;
  inStock: boolean;
  /** Null when the seller does not count stock. */
  quantity: number | null;
  priceOverrideFils: number | null;
}

export interface ProductDto {
  id: string;
  shopId: string;
  categoryId: string;
  /** Follows the category's kind. */
  type: ProductType;
  title: LocalizedString;
  description: LocalizedString;
  /** ISO 3166-1 alpha-2, or null (most services). */
  originCountry: string | null;
  imageMediaIds: string[];
  status: ProductStatus;
  /** Why an admin rejected it; shown to the seller. Null for the public. */
  reviewReason: string | null;
  /** Members and admins only; null for the public. */
  foodDeclaration: FoodDeclarationRecord | null;
  variants: VariantDto[];
  listings: BranchListingDto[];
  /** When it last went to review (ISO-8601), or null. */
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VariantInput {
  /** An existing variant to keep (and change); without it, a new one. */
  id?: string;
  sku?: string | null;
  options?: Record<string, string>;
  priceFils?: number | null;
  compareAtFils?: number | null;
}

/** Product fields a seller edits. Image ids have been attached by the gateway first. */
export interface ProductFields {
  categoryId?: string;
  title?: LocalizedString;
  description?: LocalizedString;
  originCountry?: string | null;
  imageMediaIds?: string[];
  foodDeclaration?: FoodDeclaration | null;
  /** The whole list: variants left out are removed, with their branch listings. */
  variants?: VariantInput[];
}

/** Owners and managers: creates a draft (no `productId`; category, title, variants required). */
export interface UpsertProductRequest extends ProductFields {
  actor: ActorClaims;
  shopId: string;
  productId?: string;
  correlationId?: string;
}

export interface UpsertProductResponse {
  product: ProductDto;
  /** Images no longer used, for the gateway to detach. */
  releasedMediaIds: string[];
}

/**
 * Owners and managers. `active` publishes: products that need a review (food, restricted, or
 * rejected before) go to `pending_review` instead. `hidden` takes it down; `draft` back to work.
 */
export interface SetProductStatusRequest {
  actor: ActorClaims;
  shopId: string;
  productId: string;
  status: 'active' | 'hidden' | 'draft';
  correlationId?: string;
}

export interface ListingInput {
  branchId: string;
  variantId: string;
  inStock: boolean;
  quantity?: number | null;
  priceOverrideFils?: number | null;
}

/** Owners and managers: where the product is, replacing its listings. */
export interface SetProductListingsRequest {
  actor: ActorClaims;
  shopId: string;
  productId: string;
  listings: ListingInput[];
  correlationId?: string;
}

/** Staff of the branch too: stock of variants already listed there. */
export interface UpdateBranchStockRequest {
  actor: ActorClaims;
  shopId: string;
  branchId: string;
  items: Array<{ variantId: string; inStock: boolean; quantity?: number | null }>;
  correlationId?: string;
}

export interface RemoveProductRequest {
  actor: ActorClaims;
  shopId: string;
  productId: string;
  correlationId?: string;
}

export interface RemoveProductResponse {
  releasedMediaIds: string[];
}

/**
 * A product. Members of its shop and admins see it whatever its status; everyone else only an
 * active product of a verified shop.
 */
export interface GetProductRequest {
  actor?: ActorClaims;
  productId: string;
  /** The seller's view: only a member of this shop gets it, in any status, and nobody else. */
  shopId?: string;
}

/** A shop's products: all of them for its members and admins, the public ones for others. */
export interface ListShopProductsRequest {
  actor?: ActorClaims;
  shopId: string;
  query: ListQuery;
}

export const SHOP_PRODUCTS_LIST_SPEC: ListSpec = {
  filters: {
    status: {
      type: 'enum',
      values: ['draft', 'pending_review', 'active', 'hidden', 'rejected'],
      ops: ['eq', 'in'],
    },
    categoryId: { type: 'uuid', ops: ['eq', 'in'] },
    type: { type: 'enum', values: ['product', 'service'] },
    search: { type: 'string', ops: ['like'] },
  },
  sorts: ['createdAt', 'updatedAt'],
  defaultSort: '-createdAt',
};

export type ProductPage = Page<ProductDto>;

/** Admins: products waiting for review, oldest first. */
export interface ListReviewQueueRequest {
  actor: ActorClaims;
  query: ListQuery;
}

export const PRODUCT_REVIEW_LIST_SPEC: ListSpec = {
  filters: {
    categoryId: { type: 'uuid', ops: ['eq', 'in'] },
    shopId: { type: 'uuid' },
  },
  sorts: ['submittedAt'],
  defaultSort: 'submittedAt',
};

/** Admins: approve a product waiting for review, or reject one (waiting, or already public). */
export interface DecideProductRequest {
  actor: ActorClaims;
  productId: string;
  decision: 'approve' | 'reject';
  /** Required to reject; shown to the seller. */
  reason?: string;
  correlationId?: string;
}

export const CatalogErrors = {
  validationFailed: 'CATALOG_VALIDATION_FAILED',
  /** The shop is unknown here, or the actor has no role in it. */
  shopNotFound: 'CATALOG_SHOP_NOT_FOUND',
  /** The actor's role in the shop does not allow this. */
  forbidden: 'CATALOG_FORBIDDEN',
  adminOnly: 'CATALOG_ADMIN_ONLY',
  productNotFound: 'PRODUCT_NOT_FOUND',
  categoryNotFound: 'CATEGORY_NOT_FOUND',
  /** The category takes no new products. */
  categoryInactive: 'CATEGORY_INACTIVE',
  /** A slug already used, a parent that would make a loop or too deep a tree. */
  categoryInvalid: 'CATEGORY_INVALID',
  /** A branch that is not one of the shop's (or not known here yet: try again shortly). */
  branchNotFound: 'CATALOG_BRANCH_NOT_FOUND',
  variantNotFound: 'VARIANT_NOT_FOUND',
  /** The food category needs the seller's declaration. */
  declarationRequired: 'PRODUCT_DECLARATION_REQUIRED',
  /** This status change does not apply to the product's current status. */
  invalidTransition: 'PRODUCT_INVALID_TRANSITION',
  reasonRequired: 'PRODUCT_REASON_REQUIRED',
  /** A SKU the shop already uses for another variant. */
  skuTaken: 'PRODUCT_SKU_TAKEN',
  tooManyProducts: 'CATALOG_TOO_MANY_PRODUCTS',
  tooManyCategories: 'CATALOG_TOO_MANY_CATEGORIES',
} as const;

export type CatalogErrorCode = (typeof CatalogErrors)[keyof typeof CatalogErrors];
