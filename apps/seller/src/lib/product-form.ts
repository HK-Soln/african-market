import type { components } from '@am/api-client';
import { aedText, filsFromAed } from './money';

/**
 * The product form's state and its checks, kept apart from the screens: what the seller types
 * (dirhams as text, one option such as "Size" with a value per variant, a grid of branches by
 * variants) and the bodies the gateway takes.
 */

export type SellerProduct = components['schemas']['SellerProductDto'];
export type ProductBody = components['schemas']['CreateProductBody'];
export type ListingBody = components['schemas']['ListingInput'];
export type ProductCategory = components['schemas']['CategoryDto'];
export type ProductStatus = 'draft' | 'pending_review' | 'active' | 'hidden' | 'rejected';
export type Storage = 'ambient' | 'chilled' | 'frozen';

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_VARIANTS = 50;

type Texts = { en: string; ar: string; fr: string };

export interface VariantDraft {
  /** Stable while editing, also for variants not saved yet. */
  key: string;
  id?: string;
  value: string;
  sku: string;
  price: string;
  compareAt: string;
  /** Options other than the one the form edits, kept as they are. */
  extra: Record<string, string>;
}

export interface FoodDraft {
  packagedAndLabelled: boolean;
  noRestrictedItems: boolean;
  storage: Storage | '';
  manufacturer: string;
  registrationNumber: string;
}

export interface ProductDraft {
  categoryId: string;
  title: Texts;
  description: Texts;
  originCountry: string;
  imageMediaIds: string[];
  /** The one option variants differ by, e.g. "Size"; empty with a single variant. */
  optionName: string;
  variants: VariantDraft[];
  food: FoodDraft;
}

let keys = 0;
export const newVariant = (): VariantDraft => ({
  key: `new-${++keys}`,
  value: '',
  sku: '',
  price: '',
  compareAt: '',
  extra: {},
});

const texts = (t?: Partial<Texts> | null): Texts => ({
  en: t?.en ?? '',
  ar: t?.ar ?? '',
  fr: t?.fr ?? '',
});

export function draftFromProduct(product?: SellerProduct): ProductDraft {
  const variants = [...(product?.variants ?? [])].sort((a, b) => a.sort - b.sort);
  const optionName = Object.keys(variants[0]?.options ?? {})[0] ?? '';
  const food = product?.foodDeclaration;
  return {
    categoryId: product?.categoryId ?? '',
    title: texts(product?.title),
    description: texts(product?.description),
    originCountry: product?.originCountry ?? '',
    imageMediaIds: product?.imageMediaIds ?? [],
    optionName,
    variants: variants.length
      ? variants.map((v) => {
          const { [optionName]: value = '', ...extra } = v.options;
          return {
            key: v.id,
            id: v.id,
            value,
            sku: v.sku ?? '',
            price: aedText(v.priceFils),
            compareAt: aedText(v.compareAtFils),
            extra,
          };
        })
      : [newVariant()],
    food: {
      packagedAndLabelled: food?.packagedAndLabelled ?? false,
      noRestrictedItems: food?.noRestrictedItems ?? false,
      storage: food?.storage ?? '',
      manufacturer: food?.manufacturer ?? '',
      registrationNumber: food?.registrationNumber ?? '',
    },
  };
}

export type ProductProblem =
  | 'category'
  | 'title'
  | 'optionName'
  | 'optionValue'
  | 'optionTwice'
  | 'price'
  | 'compareAt'
  | 'declaration';

/** Only the languages filled in. */
const filled = (t: Texts) =>
  Object.fromEntries(
    Object.entries(t)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v),
  );

/** Dirhams typed, or null when empty; undefined when it is not an amount. */
function amount(text: string): number | null | undefined {
  if (!text.trim()) return null;
  return filsFromAed(text) ?? undefined;
}

export function productBody(
  draft: ProductDraft,
  category: Pick<ProductCategory, 'kind' | 'requiresDeclaration'> | undefined,
): { ok: true; body: ProductBody } | { ok: false; problem: ProductProblem; variant?: number } {
  if (!draft.categoryId || !category) return { ok: false, problem: 'category' };
  if (!draft.title.en.trim() && !draft.title.ar.trim()) return { ok: false, problem: 'title' };

  const optionName = draft.optionName.trim();
  const several = draft.variants.length > 1;
  if (several && !optionName) return { ok: false, problem: 'optionName' };
  const seen = new Set<string>();
  const variants: ProductBody['variants'] = [];
  for (const [i, v] of draft.variants.entries()) {
    const value = v.value.trim();
    if (several && !value) return { ok: false, problem: 'optionValue', variant: i };
    if (value) {
      if (seen.has(value.toLowerCase())) return { ok: false, problem: 'optionTwice', variant: i };
      seen.add(value.toLowerCase());
    }
    const price = amount(v.price);
    if (price === undefined || (price === null && category.kind === 'product'))
      return { ok: false, problem: 'price', variant: i };
    const compareAt = amount(v.compareAt);
    if (compareAt === undefined || (compareAt !== null && (price === null || compareAt <= price)))
      return { ok: false, problem: 'compareAt', variant: i };
    variants.push({
      ...(v.id ? { id: v.id } : {}),
      sku: v.sku.trim() || null,
      options: optionName && value ? { ...v.extra, [optionName]: value } : v.extra,
      priceFils: price,
      compareAtFils: compareAt,
    });
  }

  let foodDeclaration: ProductBody['foodDeclaration'] = null;
  if (category.requiresDeclaration) {
    const f = draft.food;
    if (!f.packagedAndLabelled || !f.noRestrictedItems || !f.storage)
      return { ok: false, problem: 'declaration' };
    foodDeclaration = {
      packagedAndLabelled: true,
      noRestrictedItems: true,
      storage: f.storage,
      manufacturer: f.manufacturer.trim() || null,
      registrationNumber: f.registrationNumber.trim() || null,
    };
  }

  return {
    ok: true,
    body: {
      categoryId: draft.categoryId,
      title: filled(draft.title),
      description: filled(draft.description),
      originCountry: draft.originCountry || null,
      imageMediaIds: draft.imageMediaIds,
      foodDeclaration,
      variants,
    },
  };
}

// ---- Where it is sold ---------------------------------------------------------------------

export interface ListingCell {
  listed: boolean;
  inStock: boolean;
  /** How many are left, if the seller counts; empty when not. */
  quantity: string;
  /** This branch's own price in dirhams; empty for the product's price. */
  price: string;
}

/** Cells by branch id, then by variant key. */
export type ListingGrid = Record<string, Record<string, ListingCell>>;

const unlisted: ListingCell = { listed: false, inStock: true, quantity: '', price: '' };

/** A new product is sold at every branch, in stock; a saved one where its listings say. */
export function listingGrid(
  product: SellerProduct | undefined,
  branchIds: string[],
  variants: VariantDraft[],
): ListingGrid {
  return Object.fromEntries(
    branchIds.map((branchId) => [
      branchId,
      Object.fromEntries(
        variants.map((v) => {
          if (!product) return [v.key, { ...unlisted, listed: true }];
          const l = product.listings.find((x) => x.branchId === branchId && x.variantId === v.id);
          return [
            v.key,
            l
              ? {
                  listed: true,
                  inStock: l.inStock,
                  quantity: l.quantity === null ? '' : String(l.quantity),
                  price: aedText(l.priceOverrideFils),
                }
              : unlisted,
          ];
        }),
      ),
    ]),
  );
}

/** A variant added while editing is sold where the branch sells the product's other variants. */
export function cellOf(grid: ListingGrid, branchId: string, key: string): ListingCell {
  const row = grid[branchId] ?? {};
  return row[key] ?? { ...unlisted, listed: Object.values(row).some((c) => c.listed) };
}

export type ListingProblem = 'quantity' | 'branchPrice';

/** The listings to save, once the variants have ids (saved ones come back in the same order). */
export function listingsBody(
  grid: ListingGrid,
  branchIds: string[],
  variants: Array<{ key: string; id: string }>,
):
  | { ok: true; listings: ListingBody[] }
  | { ok: false; problem: ListingProblem; branchId: string; key: string } {
  const listings: ListingBody[] = [];
  for (const branchId of branchIds) {
    for (const { key, id } of variants) {
      const cell = cellOf(grid, branchId, key);
      if (!cell.listed) continue;
      const q = cell.quantity.trim();
      if (q && !/^\d{1,7}$/.test(q)) return { ok: false, problem: 'quantity', branchId, key };
      const price = amount(cell.price);
      if (price === undefined) return { ok: false, problem: 'branchPrice', branchId, key };
      listings.push({
        branchId,
        variantId: id,
        // Counting down to none means out of stock.
        inStock: cell.inStock && q !== '0',
        quantity: q ? Number(q) : null,
        priceOverrideFils: price,
      });
    }
  }
  return { ok: true, listings };
}

/** What the seller can do from each status (review decisions are the admins'). */
export function statusActions(status: string): Array<'publish' | 'hide' | 'draft'> {
  switch (status as ProductStatus) {
    case 'draft':
    case 'rejected':
      return ['publish'];
    case 'active':
    case 'pending_review':
      return ['hide'];
    case 'hidden':
      return ['publish', 'draft'];
    default:
      return [];
  }
}

/** The lowest and highest price of the variants, in fils; null when none is priced. */
export function priceRange(
  variants: Array<{ priceFils: number | null }>,
): { min: number; max: number } | null {
  const prices = variants.flatMap((v) => (v.priceFils === null ? [] : [v.priceFils]));
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

/**
 * The categories a product of this shop can go in: those under the shop's own categories (or the
 * shop's category itself when it has none), with the product's current one always there.
 */
export function productCategories(
  all: ProductCategory[],
  shopCategoryIds: string[],
  currentId?: string,
): Array<{ category: ProductCategory; parent?: ProductCategory }> {
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots = shopCategoryIds.length
    ? shopCategoryIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    : all.filter((c) => !c.parentId);
  const out: Array<{ category: ProductCategory; parent?: ProductCategory }> = [];
  for (const root of roots) {
    const children = all.filter((c) => c.parentId === root.id);
    if (children.length) children.forEach((c) => out.push({ category: c, parent: root }));
    else out.push({ category: root });
  }
  if (currentId && !out.some((o) => o.category.id === currentId) && byId.has(currentId)) {
    const current = byId.get(currentId)!;
    out.push({
      category: current,
      parent: current.parentId ? byId.get(current.parentId) : undefined,
    });
  }
  return out;
}
