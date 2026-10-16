import type { ListQuery, ListSpec, Page } from '../list-query';
import type { ActorClaims, LocalizedString } from './actor';

/**
 * Shops service contracts (F1-02). The branch, not the shop, is what customers find: it has the
 * location, the hours and the delivery area; the shop has the brand and the contacts.
 */

export type ShopVerificationStatus = 'draft' | 'pending' | 'verified' | 'rejected' | 'suspended';
export type ShopKycStatus = 'none' | 'pending' | 'passed' | 'failed';

export interface LatLngDto {
  lat: number;
  lng: number;
}

/** GeoJSON, longitude first, as PostGIS and map libraries take it. */
export interface MultiPolygonDto {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

/** One opening period. 0 is Sunday. A closing time earlier than the opening runs past midnight. */
export interface OpeningHoursDto {
  weekday: number;
  /** `HH:MM`, Asia/Dubai. */
  opensAt: string;
  closesAt: string;
}

/** A date that differs from the weekly hours: closed for Eid, or open late in Ramadan. */
export interface SpecialHoursDto {
  /** `YYYY-MM-DD`, Asia/Dubai. */
  date: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  label: LocalizedString | null;
}

export interface BranchDto {
  id: string;
  shopId: string;
  name: string;
  emirate: string;
  area: string | null;
  addressLine: string | null;
  /** Dubai's 10-digit building entrance number, when known. */
  makani: string | null;
  /** The pin: the source of truth for where the branch is (UAE addresses are informal). */
  location: LatLngDto;
  /** Where it delivers: an area drawn on the map, or a radius from the pin, or neither. */
  serviceArea: MultiPolygonDto | null;
  serviceRadiusM: number | null;
  pickup: boolean;
  delivery: boolean;
  deliveryFeeFils: number;
  minOrderFils: number;
  /** Overrides of the shop's contacts for this branch. */
  contactWhatsapp: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isPrimary: boolean;
  openingHours: OpeningHoursDto[];
  specialHours: SpecialHoursDto[];
}

export interface ShopDto {
  id: string;
  name: string;
  slug: string;
  description: LocalizedString;
  logoMediaId: string | null;
  galleryMediaIds: string[];
  categoryIds: string[];
  /** ISO 3166-1 alpha-2 countries the shop's goods come from. */
  originCountries: string[];
  contactWhatsapp: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  verificationStatus: ShopVerificationStatus;
  /** Why the listing was rejected or suspended; null otherwise. */
  verificationReason: string | null;
  /** When the owner last asked for the listing (ISO-8601), or null. */
  submittedAt: string | null;
  kycStatus: ShopKycStatus;
  /** The trade licence as entered (checked by an admin; required for checkout in Phase 3). */
  tradeLicense: {
    legalName: string | null;
    number: string | null;
    issuingAuthority: string | null;
    expiry: string | null;
  };
  checkoutEnabled: boolean;
  codEnabled: boolean;
  /** Staff may upload product images too (decision T-29). */
  staffCanUploadProductImages: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  branches: BranchDto[];
}

/** Shop fields a seller edits. Media ids have been attached by the gateway first. */
export interface ShopFields {
  name?: string;
  description?: LocalizedString;
  logoMediaId?: string | null;
  galleryMediaIds?: string[];
  categoryIds?: string[];
  originCountries?: string[];
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  staffCanUploadProductImages?: boolean;
}

export interface CreateShopRequest extends ShopFields {
  actor: ActorClaims;
  name: string;
  correlationId?: string;
}

export interface UpdateShopRequest extends ShopFields {
  actor: ActorClaims;
  shopId: string;
  correlationId?: string;
}

export interface UpdateShopResponse {
  shop: ShopDto;
  /** Media no longer used (a replaced logo, gallery images taken out), for the gateway to detach. */
  releasedMediaIds: string[];
}

export interface GetShopRequest {
  actor: ActorClaims;
  shopId: string;
}

/** Public: a verified shop by its slug. */
export interface GetShopBySlugRequest {
  slug: string;
}

/** The shops the actor owns or works in. */
export interface ListMyShopsRequest {
  actor: ActorClaims;
  query: ListQuery;
}

export const MY_SHOPS_LIST_SPEC: ListSpec = {
  filters: {
    verificationStatus: {
      type: 'enum',
      values: ['draft', 'pending', 'verified', 'rejected', 'suspended'],
      ops: ['eq', 'in'],
    },
  },
  sorts: ['createdAt', 'name'],
  defaultSort: '-createdAt',
};

export type ShopPage = Page<ShopDto>;

export interface BranchFields {
  name?: string;
  emirate?: string;
  area?: string | null;
  addressLine?: string | null;
  makani?: string | null;
  location?: LatLngDto;
  serviceArea?: MultiPolygonDto | null;
  serviceRadiusM?: number | null;
  pickup?: boolean;
  delivery?: boolean;
  deliveryFeeFils?: number;
  minOrderFils?: number;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isPrimary?: boolean;
}

/** Creates a branch (no `branchId`; name, emirate and location required) or changes one. */
export interface UpsertBranchRequest extends BranchFields {
  actor: ActorClaims;
  shopId: string;
  branchId?: string;
  correlationId?: string;
}

export interface DeleteBranchRequest {
  actor: ActorClaims;
  shopId: string;
  branchId: string;
  correlationId?: string;
}

/** Replaces the branch's whole weekly schedule. An empty list means closed every day. */
export interface SetOpeningHoursRequest {
  actor: ActorClaims;
  shopId: string;
  branchId: string;
  hours: OpeningHoursDto[];
  correlationId?: string;
}

export interface SetSpecialHoursRequest extends SpecialHoursDto {
  actor: ActorClaims;
  shopId: string;
  branchId: string;
  correlationId?: string;
}

export interface DeleteSpecialHoursRequest {
  actor: ActorClaims;
  shopId: string;
  branchId: string;
  date: string;
  correlationId?: string;
}

export const ShopErrors = {
  validationFailed: 'SHOP_VALIDATION_FAILED',
  notFound: 'SHOP_NOT_FOUND',
  /** The actor has no role in the shop that allows this. */
  forbidden: 'SHOP_FORBIDDEN',
  branchNotFound: 'BRANCH_NOT_FOUND',
  /** A pin outside the UAE; `details.field`. */
  outsideUae: 'SHOP_LOCATION_OUTSIDE_UAE',
  /** A delivery area that is not a valid shape, too large, or has too many points. */
  serviceAreaInvalid: 'SHOP_SERVICE_AREA_INVALID',
  /** Delivery is on but there is no area or radius to deliver in. */
  deliveryAreaMissing: 'SHOP_DELIVERY_AREA_MISSING',
  /** A shop has at most this many branches for now. */
  tooManyBranches: 'SHOP_TOO_MANY_BRANCHES',
  /** One person can create a limited number of shops. */
  tooManyShops: 'SHOP_TOO_MANY_SHOPS',
} as const;

export type ShopErrorCode = (typeof ShopErrors)[keyof typeof ShopErrors];
