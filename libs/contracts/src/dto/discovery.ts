import type { ActorClaims, LocalizedString } from './actor';
import type { LatLngDto, MultiPolygonDto, OpeningHoursDto, SpecialHoursDto } from './shops';
import type { ProductStatus } from './catalog';

/**
 * What the discovery service reads from the owning services to build its search read model
 * (F1-05). Only fields customers may see. Each snapshot says when it was read (`observedAt`, the
 * owner's database clock), so a slower, older read never overwrites a newer one.
 */

export interface BranchSearchSnapshot {
  id: string;
  name: string;
  emirate: string;
  area: string | null;
  location: LatLngDto;
  serviceArea: MultiPolygonDto | null;
  serviceRadiusM: number | null;
  pickup: boolean;
  delivery: boolean;
  openingHours: OpeningHoursDto[];
  specialHours: SpecialHoursDto[];
}

/** A shop and its live branches. `verified` false means it must not be searchable. */
export interface ShopSearchSnapshot {
  shopId: string;
  verified: boolean;
  slug: string;
  name: string;
  description: LocalizedString;
  logoMediaId: string | null;
  galleryCount: number;
  categoryIds: string[];
  originCountries: string[];
  hasContact: boolean;
  branches: BranchSearchSnapshot[];
  /** ISO-8601, the shops database's time of the read. */
  observedAt: string;
}

export interface ShopSearchSnapshotRequest {
  shopId: string;
}

/** The shop as discovery needs it, or null when it does not exist (deleted). */
export type ShopSearchSnapshotResponse = ShopSearchSnapshot | null;

/** Verified shops' ids, by id, for a full rebuild. */
export interface ListVerifiedShopIdsRequest {
  /** The last id of the previous page. */
  after?: string;
  limit: number;
}

export interface ListVerifiedShopIdsResponse {
  shopIds: string[];
}

export interface ProductSearchSnapshot {
  productId: string;
  shopId: string;
  /** Discovery shows `active` products of shops it holds as verified. */
  status: ProductStatus;
  title: LocalizedString;
  description: LocalizedString;
  categoryId: string;
  originCountry: string | null;
  imageMediaIds: string[];
  /** The lowest price over its variants and branch prices; null when all are on request. */
  minPriceFils: number | null;
  /** Branches that list it with at least one variant in stock. */
  branchIds: string[];
  /** ISO-8601, the catalog database's time of the read. */
  observedAt: string;
}

export interface ProductSearchSnapshotRequest {
  productId: string;
}

/** Null when the product does not exist any more (removed). */
export type ProductSearchSnapshotResponse = ProductSearchSnapshot | null;

/** Every live product of a shop (a shop has at most MAX_PRODUCTS_PER_SHOP). */
export interface ShopProductSnapshotsRequest {
  shopId: string;
}

export interface ShopProductSnapshotsResponse {
  products: ProductSearchSnapshot[];
  /** ISO-8601, the catalog database's time of the read. */
  observedAt: string;
}

/** Admins: rebuilds the whole read model from the owning services. */
export interface RebuildSearchRequest {
  actor: ActorClaims;
  correlationId?: string;
}

export interface RebuildSearchResponse {
  shops: number;
  branches: number;
  products: number;
  /** Rows of shops that are no longer verified, or gone, that were dropped. */
  removed: number;
}

export const DiscoveryErrors = {
  adminOnly: 'DISCOVERY_ADMIN_ONLY',
  /** A rebuild is already running. */
  rebuildRunning: 'DISCOVERY_REBUILD_RUNNING',
} as const;

export type DiscoveryErrorCode = (typeof DiscoveryErrors)[keyof typeof DiscoveryErrors];
