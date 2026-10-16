import type { BranchListingDto, CategoryDto, ProductDto, VariantDto } from '@am/contracts';
import type { BranchListing, Category, Product, Variant } from '../entities';

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    parentId: category.parentId,
    slug: category.slug,
    name: category.name,
    kind: category.kind,
    isRestricted: category.isRestricted,
    requiresDeclaration: category.requiresDeclaration,
    checkoutAllowed: category.checkoutAllowed,
    sort: category.sort,
    active: category.active,
  };
}

export function toVariantDto(variant: Variant): VariantDto {
  return {
    id: variant.id,
    sku: variant.sku,
    options: variant.options,
    priceFils: variant.priceFils,
    compareAtFils: variant.compareAtFils,
    sort: variant.sort,
  };
}

export function toListingDto(listing: BranchListing): BranchListingDto {
  return {
    branchId: listing.branchId,
    variantId: listing.variantId,
    inStock: listing.inStock,
    quantity: listing.quantity,
    priceOverrideFils: listing.priceOverrideFils,
  };
}

/**
 * `full` for the shop's members and admins; `public` leaves out the review reason and the food
 * declaration.
 */
export function toProductDto(
  product: Product,
  variants: Variant[],
  listings: BranchListing[],
  view: 'full' | 'public',
): ProductDto {
  return {
    id: product.id,
    shopId: product.shopId,
    categoryId: product.categoryId,
    type: product.type,
    title: product.title,
    description: product.description,
    originCountry: product.originCountry,
    imageMediaIds: product.imageMediaIds,
    status: product.status,
    reviewReason: view === 'full' ? product.reviewReason : null,
    foodDeclaration: view === 'full' ? product.foodDeclaration : null,
    variants: variants
      .filter((v) => v.productId === product.id)
      .sort((a, b) => a.sort - b.sort)
      .map(toVariantDto),
    listings: listings
      .filter((l) => l.productId === product.id)
      .sort(
        (a, b) => a.branchId.localeCompare(b.branchId) || a.variantId.localeCompare(b.variantId),
      )
      .map(toListingDto),
    submittedAt: product.submittedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
