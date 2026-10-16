import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { LocalizedString } from '@am/contracts';

/**
 * The catalogue's category tree as discovery last read it (`catalog.category.list`): names for
 * the text index, and each category's path for "this category and everything under it".
 */
@Entity({ name: 'search_category' })
export class SearchCategory {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ type: 'jsonb' })
  name!: LocalizedString;

  /** The category and its parents, root first. */
  @Column({ type: 'uuid', array: true })
  path!: string[];
}
