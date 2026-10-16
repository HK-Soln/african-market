import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Public image URLs per media id, from `media.ready`, so rows can show logos and photos. */
@Entity({ name: 'search_media' })
export class SearchMedia {
  @PrimaryColumn({ type: 'uuid' })
  mediaId!: string;

  /** Size name (thumb, card, full) to URL. */
  @Column({ type: 'jsonb' })
  urls!: Record<string, string>;
}
