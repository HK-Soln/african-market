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
  /** E.164; the branch's own, else the shop's. Public, as on the shop page. */
  contactWhatsapp: string | null;
  contactPhone: string | null;
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
  validationFailed: 'DISCOVERY_VALIDATION_FAILED',
  /** The cursor does not belong to this search. */
  cursorInvalid: 'DISCOVERY_CURSOR_INVALID',
} as const;

export type DiscoveryErrorCode = (typeof DiscoveryErrors)[keyof typeof DiscoveryErrors];

/** Delivery: branches that deliver to the point. Pickup: branches near it. */
export type SearchMode = 'delivery' | 'pickup';

/** Filters shared by the list and the map. */
export interface SearchFilters {
  /** Free text: shop names, categories, areas, descriptions and products. */
  q?: string;
  /** A category and everything under it. */
  categoryId?: string;
  /** ISO 3166-1 alpha-2: the shop's countries or a product's. */
  originCountry?: string;
  /** Open at the moment of the search, Asia/Dubai. */
  openNow?: boolean;
  /** Pickup mode: only branches that would also deliver to the point. */
  deliversToMe?: boolean;
  /** An emirate code (DXB, AUH, ...). */
  emirate?: string;
}

export interface SearchNearbyRequest extends SearchFilters {
  lat: number;
  lng: number;
  mode: SearchMode;
  /** Pickup mode: how far the customer will travel, in metres (default 10 km, at most 50 km). */
  radiusM?: number;
  /** At most 50 (default 20). */
  limit?: number;
  cursor?: string;
}

/** A product at the branch that matched the text. */
export interface MatchedProductDto {
  productId: string;
  title: LocalizedString;
  minPriceFils: number | null;
  imageUrl: string | null;
}

export interface NearbyBranchDto {
  branchId: string;
  shopId: string;
  shopSlug: string;
  shopName: string;
  branchName: string;
  logoUrl: string | null;
  emirate: string;
  area: string | null;
  location: LatLngDto;
  distanceM: number;
  openNow: boolean;
  pickup: boolean;
  delivery: boolean;
  verified: boolean;
  ratingAvg: number;
  ratingCount: number;
  categoryIds: string[];
  originCountries: string[];
  /** E.164, the branch's own or else the shop's: the result card's WhatsApp and call buttons. */
  contactWhatsapp: string | null;
  contactPhone: string | null;
  /** Up to three, only when `q` is given and products match it. */
  matchedProducts: MatchedProductDto[];
}

export interface SearchNearbyResponse {
  items: NearbyBranchDto[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
}

export interface SearchMapRequest extends Omit<SearchFilters, 'deliversToMe'> {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  /** The map's zoom level (0-22): from MAP_PIN_ZOOM up, single pins; below, clusters. */
  zoom: number;
}

/** Zoom from which the map shows every branch as its own pin. */
export const MAP_PIN_ZOOM = 14;

export interface MapPinDto {
  kind: 'pin';
  branchId: string;
  shopSlug: string;
  shopName: string;
  location: LatLngDto;
  openNow: boolean;
}

export interface MapClusterDto {
  kind: 'cluster';
  /** The centre of the branches in it. */
  location: LatLngDto;
  count: number;
}

export interface SearchMapResponse {
  markers: Array<MapPinDto | MapClusterDto>;
  /** True when there were more pins than the response carries (zoom in). */
  truncated: boolean;
}

/** An emirate as the apps show it, with whether customer search is open there. */
export interface EmirateDto {
  code: string;
  slug: string;
  name: LocalizedString;
  center: LatLngDto;
  /** Search opens per emirate once it has enough verified shops (an admin's switch). */
  searchOpen: boolean;
  /** Admins only: verified shops and branches in it; null for everyone else. */
  verifiedShops: number | null;
  branches: number | null;
}

export interface ListEmiratesRequest {
  /** With an admin actor, the counts are filled in. */
  actor?: ActorClaims;
}

export interface EmirateList {
  items: EmirateDto[];
}

/** At most this many sitemap entries a page. */
export const SITEMAP_PAGE_MAX = 1000;

/** Verified shops or their live products, by id, for the web sitemap (F1-12). */
export interface SitemapRequest {
  kind: 'shops' | 'products';
  /** `nextCursor` of the previous page. */
  cursor?: string;
  /** At most SITEMAP_PAGE_MAX (the default). */
  limit?: number;
}

export interface SitemapEntryDto {
  shopSlug: string;
  /** Products only. */
  productId?: string;
  title?: LocalizedString;
  /** ISO-8601: when the read model last changed it. */
  updatedAt: string;
}

export interface SitemapPage {
  items: SitemapEntryDto[];
  nextCursor: string | null;
}

/** Admins: open or close customer search in an emirate. */
export interface SetEmirateSearchRequest {
  actor: ActorClaims;
  code: string;
  open: boolean;
  correlationId?: string;
}
