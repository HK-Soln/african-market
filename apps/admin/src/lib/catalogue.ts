import type { components } from '@am/api-client';

export type Category = components['schemas']['CategoryDto'];
export type CategoryBody = components['schemas']['CreateCategoryBody'];
export type ReviewProduct = components['schemas']['ProductDto'];
export type Emirate = components['schemas']['EmirateDto'];

/** As deep as the catalogue service allows: a section, its categories and theirs. */
export const MAX_CATEGORY_DEPTH = 3;

export interface TreeRow {
  category: Category;
  /** 1 for a top-level category. */
  depth: number;
  childCount: number;
}

const bySort = (a: Category, b: Category) =>
  a.sort - b.sort || (a.name.en ?? '').localeCompare(b.name.en ?? '', 'en');

/**
 * The categories as one list in tree order (each parent followed by its children), with each
 * one's depth. A category whose parent is missing is shown at the top level, so none is lost.
 */
export function categoryTree(items: Category[]): TreeRow[] {
  const ids = new Set(items.map((c) => c.id));
  const children = new Map<string | null, Category[]>();
  for (const c of items) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of [...(children.get(parentId) ?? [])].sort(bySort)) {
      rows.push({ category: c, depth, childCount: children.get(c.id)?.length ?? 0 });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 1);
  return rows;
}

/** How many levels sit under a category (0 for a leaf). */
function heightBelow(rows: TreeRow[], id: string): number {
  const kids = rows.filter((r) => r.category.parentId === id);
  return kids.length ? 1 + Math.max(...kids.map((k) => heightBelow(rows, k.category.id))) : 0;
}

/**
 * Where a category may sit: not under itself or anything under it, of the same kind, and
 * keeping the tree MAX_CATEGORY_DEPTH deep. `editing` is null for a new category of `kind`.
 */
export function parentOptions(
  rows: TreeRow[],
  editing: Category | null,
  kind: 'product' | 'service' | null,
): TreeRow[] {
  const below = editing ? heightBelow(rows, editing.id) : 0;
  const blocked = new Set<string>();
  if (editing) {
    const block = (id: string) => {
      blocked.add(id);
      rows.filter((r) => r.category.parentId === id).forEach((r) => block(r.category.id));
    };
    block(editing.id);
  }
  return rows.filter(
    (r) =>
      !blocked.has(r.category.id) &&
      (!kind || r.category.kind === kind) &&
      r.depth + 1 + below <= MAX_CATEGORY_DEPTH,
  );
}

/** A web address part from an English name: "Hair & wigs" gives "hair-wigs". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** The lowest and highest price of a product's versions, in fils, or null when none has one. */
export function priceRange(
  variants: Array<{ priceFils: number | null }>,
): { min: number; max: number } | null {
  const prices = variants.flatMap((v) => (v.priceFils === null ? [] : [v.priceFils]));
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

/** The query for the review queue: oldest first, of one category or all. */
export function reviewQuery(categoryId: string, cursor?: string) {
  return {
    ...(categoryId ? { 'filter[categoryId]': categoryId } : {}),
    sort: 'submittedAt',
    limit: 20,
    ...(cursor ? { cursor } : {}),
  };
}
