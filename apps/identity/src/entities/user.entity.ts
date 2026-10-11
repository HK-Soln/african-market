import { Check, Column, Entity, Index } from 'typeorm';
import { PlatformRole } from '@am/auth';
import { AppBaseEntity } from '@am/database';
import { EmirateCode } from '@am/geo';
import { Locale } from '@am/i18n';

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * A person with an account. One user can be a customer, a seller and an admin at once (`roles`);
 * shop-level roles live in `shop_member`. Phone and email are each unique among live rows only,
 * so a soft-deleted account does not block re-registration.
 */
@Entity({ name: 'user' })
@Index('user_phone_uq', ['phone'], { unique: true, where: 'deleted_at IS NULL' })
@Index('user_email_uq', ['email'], { unique: true, where: 'deleted_at IS NULL' })
@Check('user_status_chk', `status IN ('active', 'suspended', 'deleted')`)
@Check('user_preferred_language_chk', `preferred_language IN ('en', 'ar', 'fr')`)
@Check('user_roles_chk', `roles <@ ARRAY['customer', 'seller', 'admin']::text[]`)
@Check('user_home_emirate_chk', `home_emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')`)
export class User extends AppBaseEntity {
  /** E.164, e.g. +971501234567. */
  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  /** Case-insensitive (citext). */
  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'text', default: 'en' })
  preferredLanguage!: Locale;

  /** The emirate the person calls home; search starts there until they share a location. */
  @Column({ type: 'text', nullable: true })
  homeEmirate!: EmirateCode | null;

  /** Id of an image owned by the media service; never joined across schemas. */
  @Column({ type: 'uuid', nullable: true })
  avatarMediaId!: string | null;

  @Column({ type: 'text', array: true, default: () => `'{customer}'` })
  roles!: PlatformRole[];

  @Column({ type: 'text', default: 'active' })
  status!: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  /** UAE PDPL: marketing consent is optional and timestamped; null means not given. */
  @Column({ type: 'timestamptz', nullable: true })
  marketingConsentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;
}
