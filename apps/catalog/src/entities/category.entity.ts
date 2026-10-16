import { Check, Column, Entity, Index } from 'typeorm';
import type { CategoryKind, LocalizedString } from '@am/contracts';
import { AppBaseEntity } from '@am/database';

/**
 * The category tree, curated by admins and seeded by migration (F1-04). A product in a restricted
 * category, or in a category that requires a declaration (food), is reviewed before it shows;
 * the flags of a parent apply to everything under it.
 */
@Entity({ name: 'category' })
@Index('category_slug_uq', ['slug'], { unique: true, where: 'deleted_at IS NULL' })
@Index('category_parent_idx', ['parentId', 'sort'])
@Check('category_kind_chk', `kind IN ('product', 'service')`)
@Check('category_slug_chk', `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)
export class Category extends AppBaseEntity {
  @Column({ type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'jsonb' })
  name!: LocalizedString;

  @Column({ type: 'text' })
  kind!: CategoryKind;

  @Column({ type: 'boolean', default: false })
  isRestricted!: boolean;

  @Column({ type: 'boolean', default: false })
  requiresDeclaration!: boolean;

  /** False for listing-only categories (money transfer agents): no checkout (Phase 3). */
  @Column({ type: 'boolean', default: true })
  checkoutAllowed!: boolean;

  @Column({ type: 'int', default: 0 })
  sort!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
