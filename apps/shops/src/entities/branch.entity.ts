import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { MultiPolygonDto } from '@am/contracts';
import { AppBaseEntity } from '@am/database';
import {
  EmirateCode,
  GeoJsonPoint,
  geographyMultiPolygonColumn,
  geographyPointColumn,
} from '@am/geo';
import { OpeningHours } from './opening-hours.entity';
import { Shop } from './shop.entity';
import { SpecialHours } from './special-hours.entity';

/**
 * A place customers find: the pin, the hours and where it delivers. A shop has one primary branch
 * (what its page shows first).
 */
@Entity({ name: 'branch' })
@Index('branch_shop_idx', ['shopId'])
@Index('branch_primary_uq', ['shopId'], {
  unique: true,
  where: 'is_primary AND deleted_at IS NULL',
})
@Check('branch_emirate_chk', `emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')`)
@Check('branch_makani_chk', `makani IS NULL OR makani ~ '^[0-9]{10}$'`)
@Check(
  'branch_service_radius_chk',
  `service_radius_m IS NULL OR service_radius_m BETWEEN 100 AND 100000`,
)
@Check('branch_money_chk', `delivery_fee_fils >= 0 AND min_order_fils >= 0`)
export class Branch extends AppBaseEntity {
  @Column({ type: 'uuid' })
  shopId!: string;

  @ManyToOne(() => Shop, (shop) => shop.branches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop?: Shop;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  emirate!: EmirateCode;

  @Column({ type: 'text', nullable: true })
  area!: string | null;

  @Column({ type: 'text', nullable: true })
  addressLine!: string | null;

  @Column({ type: 'text', nullable: true })
  makani!: string | null;

  /** The pin, GeoJSON [lng, lat]. */
  @Index('branch_location_idx', { spatial: true })
  @Column(geographyPointColumn)
  location!: GeoJsonPoint;

  /** Where it delivers, when drawn on the map. */
  @Index('branch_service_area_idx', { spatial: true })
  @Column(geographyMultiPolygonColumn)
  serviceArea!: MultiPolygonDto | null;

  /** Or a radius around the pin, in metres. */
  @Column({ type: 'int', nullable: true })
  serviceRadiusM!: number | null;

  @Column({ type: 'boolean', default: true })
  pickup!: boolean;

  @Column({ type: 'boolean', default: false })
  delivery!: boolean;

  @Column({ type: 'int', default: 0 })
  deliveryFeeFils!: number;

  @Column({ type: 'int', default: 0 })
  minOrderFils!: number;

  @Column({ type: 'text', nullable: true })
  contactWhatsapp!: string | null;

  @Column({ type: 'text', nullable: true })
  contactPhone!: string | null;

  @Column({ type: 'citext', nullable: true })
  contactEmail!: string | null;

  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  @OneToMany(() => OpeningHours, (hours) => hours.branch)
  openingHours?: OpeningHours[];

  @OneToMany(() => SpecialHours, (hours) => hours.branch)
  specialHours?: SpecialHours[];
}
