import { Check, Column, Entity, Index } from 'typeorm';
import type { ImageVariant, MediaPurpose, MediaStatus, MediaVisibility } from '@am/contracts';
import { AppBaseEntity } from '@am/database';

/** One stored file of a media object. Keys are chosen by the service and never reused. */
export interface StoredFile {
  key: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
}

/**
 * An upload and what became of it. Created `pending` when an upload form is handed out; `ready`
 * once the file was checked and stored (images re-encoded into variants); `rejected` when the
 * file failed its checks; `deleted` when its files were removed.
 */
@Entity({ name: 'media_object' })
@Index('media_object_owner_idx', ['ownerId', 'createdAt'])
@Index('media_object_attached_idx', ['attachedType', 'attachedId'])
@Index('media_object_status_idx', ['status', 'createdAt'])
@Check(
  'media_object_purpose_chk',
  `purpose IN ('avatar', 'shop_logo', 'shop_gallery', 'product_image', 'trade_license')`,
)
@Check('media_object_status_chk', `status IN ('pending', 'ready', 'rejected', 'deleted')`)
@Check('media_object_visibility_chk', `visibility IN ('public', 'private')`)
export class MediaObject extends AppBaseEntity {
  /** The user who uploaded it: the only one who may confirm or attach it. */
  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  purpose!: MediaPurpose;

  /** The shop it was uploaded for (shop purposes only); it can be attached for that shop only. */
  @Column({ type: 'uuid', nullable: true })
  shopId!: string | null;

  @Column({ type: 'text' })
  visibility!: MediaVisibility;

  @Column({ type: 'text', default: 'pending' })
  status!: MediaStatus;

  /** The type the browser declared; the stored type is in `files`. */
  @Column({ type: 'text' })
  declaredType!: string;

  /** The size the upload form allows, in bytes. */
  @Column({ type: 'int' })
  maxBytes!: number;

  /** When the upload form stops working. */
  @Column({ type: 'timestamptz' })
  uploadExpiresAt!: Date;

  /** What was stored: one entry per image variant, or `document` for a private document. */
  @Column({ type: 'jsonb', default: () => `'{}'` })
  files!: Partial<Record<ImageVariant | 'document', StoredFile>>;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  /** Why the file was refused (unreadable, animated, too_many_pixels, wrong_type, too_large). */
  @Column({ type: 'text', nullable: true })
  rejectReason!: string | null;

  /** What uses it (user, shop, product, branch); null until attached. */
  @Column({ type: 'text', nullable: true })
  attachedType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  attachedId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  attachedAt!: Date | null;

  /** Set when it stopped being used; the files are deleted a week later. */
  @Column({ type: 'timestamptz', nullable: true })
  detachedAt!: Date | null;
}
