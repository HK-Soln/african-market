import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '@am/database';
import { EmirateCode, GeoJsonPoint, geographyPointColumn } from '@am/geo';
import { User } from './user.entity';

/** A saved delivery address. `location` is the pin the customer dropped, as GeoJSON [lng, lat]. */
@Entity({ name: 'address' })
@Index('address_user_idx', ['userId'])
@Check('address_emirate_chk', `emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')`)
export class Address extends AppBaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Free text chosen by the user, e.g. "Home". */
  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'text' })
  emirate!: EmirateCode;

  @Column({ type: 'text', nullable: true })
  area!: string | null;

  @Column({ type: 'text', nullable: true })
  building!: string | null;

  @Column({ type: 'text', nullable: true })
  flat!: string | null;

  /** Makani number (Dubai's 10-digit building entrance code), when the user has one. */
  @Column({ type: 'text', nullable: true })
  makani!: string | null;

  @Index('address_location_idx', { spatial: true })
  @Column({ ...geographyPointColumn, nullable: true })
  location!: GeoJsonPoint | null;

  /** Delivery instructions for the seller. */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
