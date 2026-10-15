import { Check, Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '@am/database';
import { LocalizedText } from '@am/i18n';

/**
 * A country, as the app shows and allows it. Reference data owned by identity, edited by admins.
 * How phone numbers are written, validated and formatted is not stored here: that comes from
 * libphonenumber-js, whose updates follow numbering-plan changes.
 */
@Entity({ name: 'country' })
@Index('country_code_uq', ['code'], { unique: true })
@Check('country_code_chk', `code ~ '^[A-Z]{2}$'`)
@Check('country_dial_code_chk', `dial_code ~ '^\\+[0-9]{1,4}$'`)
export class Country extends AppBaseEntity {
  /** ISO 3166-1 alpha-2, e.g. AE. */
  @Column({ type: 'text' })
  code!: string;

  /** Display name in each language. */
  @Column({ type: 'jsonb' })
  name!: LocalizedText;

  /** International dialling code, e.g. +971. */
  @Column({ type: 'text' })
  dialCode!: string;

  /** Emoji flag, for places that cannot show an image. */
  @Column({ type: 'text' })
  flag!: string;

  /** New accounts may sign up with a phone number from here. */
  @Column({ type: 'boolean', default: false })
  phoneEnabled!: boolean;

  /** Offered as the country a shop or product comes from (origin badges). */
  @Column({ type: 'boolean', default: false })
  originEnabled!: boolean;

  /** Lower comes first in lists; ties are sorted by name. */
  @Column({ type: 'int', default: 1000 })
  sortOrder!: number;
}
