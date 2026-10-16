import { DataSource, EntityManager } from 'typeorm';
import {
  CatalogErrors,
  CategoryDto,
  CategoryList,
  ListCategoriesRequest,
  UpsertCategoryRequest,
} from '@am/contracts';
import { Category } from '../entities';
import { catalogError, invalid } from '../errors';
import { requireAdmin } from './access';
import { toCategoryDto } from './mapper';

/** The tree stays small enough to send whole; admins curate it. */
export const MAX_CATEGORIES = 500;
/** Root, child, grandchild. */
export const MAX_CATEGORY_DEPTH = 3;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** What applies to products in a category: its own flags and those of every parent. */
export interface CategoryRules {
  category: Category;
  isRestricted: boolean;
  requiresDeclaration: boolean;
  checkoutAllowed: boolean;
  /** False when it or a parent is inactive. */
  active: boolean;
}

/** The category and its parents, nearest first; null when it does not exist. */
export async function categoryRules(
  manager: EntityManager,
  categoryId: string,
): Promise<CategoryRules | null> {
  const chain: Category[] = [];
  let id: string | null = categoryId;
  while (id && chain.length <= MAX_CATEGORY_DEPTH) {
    const found: Category | null = await manager.findOneBy(Category, { id });
    if (!found) break;
    chain.push(found);
    id = found.parentId;
  }
  if (!chain.length) return null;
  return {
    category: chain[0],
    isRestricted: chain.some((c) => c.isRestricted),
    requiresDeclaration: chain.some((c) => c.requiresDeclaration),
    checkoutAllowed: chain.every((c) => c.checkoutAllowed),
    active: chain.every((c) => c.active),
  };
}

/** Parents before their children; siblings by `sort`, then slug. */
export function treeOrder(categories: Category[]): Category[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const siblings = byParent.get(c.parentId) ?? [];
    siblings.push(c);
    byParent.set(c.parentId, siblings);
  }
  const out: Category[] = [];
  const visit = (parentId: string | null) => {
    const children = (byParent.get(parentId) ?? []).sort(
      (a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug),
    );
    for (const child of children) {
      out.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return out;
}

export class CategoriesService {
  constructor(private readonly dataSource: DataSource) {}

  /** The tree; a category under an inactive parent is left out with it. */
  async list(input: ListCategoriesRequest): Promise<CategoryList> {
    if (input.includeInactive) {
      if (!input.actor) throw catalogError(CatalogErrors.adminOnly);
      requireAdmin(input.actor);
    }
    const all = treeOrder(await this.dataSource.manager.find(Category));
    if (input.includeInactive) return { items: all.map(toCategoryDto) };
    const shown = new Set<string>();
    const items: CategoryDto[] = [];
    for (const c of all) {
      // Parents come first, so a hidden parent is already known when its children come.
      if (!c.active || (c.parentId && !shown.has(c.parentId))) continue;
      shown.add(c.id);
      items.push(toCategoryDto(c));
    }
    return { items };
  }

  /** Admins. A new category takes its parent's kind and flags unless it says otherwise. */
  async upsert(input: UpsertCategoryRequest): Promise<CategoryDto> {
    requireAdmin(input.actor);
    return this.dataSource.transaction(async (manager) => {
      // One change to the tree at a time, so two admins cannot build a loop between them.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('catalog.category'))`);

      let category: Category;
      if (input.categoryId) {
        const found = await manager.findOneBy(Category, { id: input.categoryId });
        if (!found) throw catalogError(CatalogErrors.categoryNotFound);
        category = found;
      } else {
        if (!input.slug || !input.name || (!input.kind && !input.parentId))
          throw invalid('slug', 'slug, name and kind are required');
        if ((await manager.count(Category)) >= MAX_CATEGORIES)
          throw catalogError(CatalogErrors.tooManyCategories);
        category = manager.create(Category, { parentId: null, sort: 0, active: true });
      }

      if (input.parentId !== undefined && input.parentId !== category.parentId) {
        const parent = input.parentId
          ? await manager.findOneBy(Category, { id: input.parentId })
          : null;
        if (input.parentId && !parent) throw catalogError(CatalogErrors.categoryNotFound);
        if (parent) {
          await this.checkPlacement(manager, category, parent);
          if (!input.categoryId) {
            category.kind = parent.kind;
            category.isRestricted = parent.isRestricted;
            category.requiresDeclaration = parent.requiresDeclaration;
            category.checkoutAllowed = parent.checkoutAllowed;
          }
        }
        category.parentId = input.parentId;
      }

      if (input.slug !== undefined) {
        if (!SLUG.test(input.slug)) throw invalid('slug', 'Lowercase letters, digits and dashes');
        const taken = await manager.findOneBy(Category, { slug: input.slug });
        if (taken && taken.id !== category.id)
          throw catalogError(CatalogErrors.categoryInvalid, { reason: 'slug_taken' });
        category.slug = input.slug;
      }
      if (input.name !== undefined) {
        const name = {
          en: input.name.en?.trim(),
          ar: input.name.ar?.trim(),
          fr: input.name.fr?.trim() || undefined,
        };
        // English and Arabic from the first screen; French falls back to English until Phase 2.
        if (!name.en || !name.ar) throw invalid('name', 'English and Arabic names are required');
        category.name = name;
      }
      if (input.kind !== undefined && input.kind !== category.kind) {
        // Products take their type from the category, so it is fixed once products can be in it.
        if (input.categoryId)
          throw catalogError(CatalogErrors.categoryInvalid, { reason: 'kind_is_fixed' });
        const parent = category.parentId
          ? await manager.findOneBy(Category, { id: category.parentId })
          : null;
        if (parent && parent.kind !== input.kind)
          throw catalogError(CatalogErrors.categoryInvalid, { reason: 'kind_differs_from_parent' });
        category.kind = input.kind;
      }
      if (input.isRestricted !== undefined) category.isRestricted = input.isRestricted;
      if (input.requiresDeclaration !== undefined)
        category.requiresDeclaration = input.requiresDeclaration;
      if (input.checkoutAllowed !== undefined) category.checkoutAllowed = input.checkoutAllowed;
      if (input.sort !== undefined) category.sort = input.sort;
      if (input.active !== undefined) category.active = input.active;

      return toCategoryDto(await manager.save(category));
    });
  }

  /** The parent must not be the category or under it, and the tree stays MAX_CATEGORY_DEPTH deep. */
  private async checkPlacement(
    manager: EntityManager,
    category: Category,
    parent: Category,
  ): Promise<void> {
    let depth = 1;
    let at: Category | null = parent;
    while (at) {
      if (category.id && at.id === category.id)
        throw catalogError(CatalogErrors.categoryInvalid, { reason: 'loop' });
      depth++;
      at = at.parentId ? await manager.findOneBy(Category, { id: at.parentId }) : null;
    }
    const below = category.id ? await this.heightBelow(manager, category.id) : 0;
    if (depth + below > MAX_CATEGORY_DEPTH)
      throw catalogError(CatalogErrors.categoryInvalid, { reason: 'too_deep' });
    if (category.kind && category.kind !== parent.kind)
      throw catalogError(CatalogErrors.categoryInvalid, { reason: 'kind_differs_from_parent' });
  }

  /** How many levels sit under a category. */
  private async heightBelow(manager: EntityManager, id: string): Promise<number> {
    const children = await manager.findBy(Category, { parentId: id });
    let height = 0;
    for (const child of children)
      height = Math.max(height, 1 + (await this.heightBelow(manager, child.id)));
    return height;
  }
}
