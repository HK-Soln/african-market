import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  LocalizedString,
  MultiPolygonDto,
  OpeningHoursDto,
  SpecialHoursDto,
} from '@am/contracts';
import { GeoJsonPoint, geographyMultiPolygonColumn, geographyPointColumn } from '@am/geo';

export interface BranchHours {
  weekly: OpeningHoursDto[];
  special: SpecialHoursDto[];
}

/**
 * One searchable branch of a verified shop, joined with what search needs of its shop. Built only
 * from the owners' events and snapshots (F1-05); a shop that is not verified has no rows here.
 */
@Entity({ name: 'search_branch' })
@Index('search_branch_shop_idx', ['shopId'])
@Index('search_branch_emirate_idx', ['emirate'])
export class SearchBranch {
  @PrimaryColumn({ type: 'uuid' })
  branchId!: string;

  @Column({ type: 'uuid' })
  shopId!: string;

  @Column({ type: 'text' })
  shopSlug!: string;

  @Column({ type: 'text' })
  shopName!: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  shopDescription!: LocalizedString;

  @Column({ type: 'text' })
  branchName!: string;

  @Column({ type: 'uuid', nullable: true })
  logoMediaId!: string | null;

  /** Filled from `media.ready`; null until the logo is processed. */
  @Column({ type: 'text', nullable: true })
  logoUrl!: string | null;

  /** The categories the shop chose itself. */
  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  shopCategoryIds!: string[];

  /** The shop's and its products' categories here, with their parents (for "category and below"). */
  @Index('search_branch_categories_idx')
  @Column({ type: 'uuid', array: true, default: () => `'{}'` })
  categoryIds!: string[];

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  originCountries!: string[];

  @Column({ type: 'text' })
  emirate!: string;

  @Column({ type: 'text', nullable: true })
  area!: string | null;

  @Index('search_branch_location_idx', { spatial: true })
  @Column(geographyPointColumn)
  location!: GeoJsonPoint;

  @Index('search_branch_service_area_idx', { spatial: true })
  @Column(geographyMultiPolygonColumn)
  serviceArea!: MultiPolygonDto | null;

  @Column({ type: 'int', nullable: true })
  serviceRadiusM!: number | null;

  @Column({ type: 'boolean' })
  pickup!: boolean;

  @Column({ type: 'boolean' })
  delivery!: boolean;

  @Column({ type: 'boolean', default: true })
  verified!: boolean;

  /** Reviews come in Phase 2; 0 until then. */
  @Column({ type: 'real', default: 0 })
  ratingAvg!: number;

  @Column({ type: 'int', default: 0 })
  ratingCount!: number;

  /** 0 to 100: how complete the shop's listing is (logo, description, hours, contacts, products). */
  @Column({ type: 'smallint', default: 0 })
  completenessScore!: number;

  /** Weekly and special hours, Asia/Dubai, for "open now". */
  @Column({ type: 'jsonb', default: () => `'{"weekly":[],"special":[]}'` })
  hours!: BranchHours;

  // Kept by Postgres from `hours` and the delivery fields (migration NearbySearch): never written.
  /** The weekly hours as minute ranges of the week (0 = Sunday 00:00). */
  @Column({
    type: 'int4multirange',
    generatedType: 'STORED',
    asExpression: 'discovery.week_ranges(hours)',
    select: false,
    insert: false,
    update: false,
  })
  openWeek!: string;

  /** Dates whose special hours replace the weekly ones. */
  @Column({
    type: 'text',
    array: true,
    generatedType: 'STORED',
    asExpression: 'discovery.special_dates(hours)',
    select: false,
    insert: false,
    update: false,
  })
  specialDates!: string[];

  /** Where it delivers: the drawn area, or a circle a little wider than the radius. */
  @Index('search_branch_coverage_idx', { spatial: true })
  @Column({
    type: 'geography',
    nullable: true,
    generatedType: 'STORED',
    asExpression: `CASE WHEN NOT delivery THEN NULL WHEN service_area IS NOT NULL THEN service_area WHEN service_radius_m IS NOT NULL THEN ST_Buffer(location, service_radius_m * 1.02) END`,
    select: false,
    insert: false,
    update: false,
  })
  coverage!: string | null;

  /** Shop name (A), categories and area (B), description (C), in the `am_simple` configuration. */
  @Column({ type: 'tsvector', select: false, nullable: true })
  searchable!: string | null;

  /** Boosts (Phase 2): reserved. */
  @Column({ type: 'timestamptz', nullable: true })
  boostUntil!: Date | null;

  @Column({ type: 'real', default: 0 })
  boostWeight!: number;

  /** The owner's time of the snapshot this row came from; an older snapshot never overwrites it. */
  @Column({ type: 'timestamptz' })
  updatedFromEventAt!: Date;
}
