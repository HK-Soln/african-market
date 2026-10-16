import type { BranchDto, MultiPolygonDto, ShopDto } from '@am/contracts';
import { fromGeoJsonPoint } from '@am/geo';
import type { Branch, OpeningHours, Shop, SpecialHours } from '../entities';

/** Seven decimals is about a centimetre; more is floating-point noise from PostGIS. */
const round = (n: number) => Math.round(n * 1e7) / 1e7;

const roundArea = (area: MultiPolygonDto | null): MultiPolygonDto | null =>
  area && {
    type: 'MultiPolygon',
    coordinates: area.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map((point) => point.map(round))),
    ),
  };

/** `HH:MM:SS` from Postgres to `HH:MM`. */
const hhmm = (time: string | null): string | null => (time ? time.slice(0, 5) : null);

const byWeekdayThenTime = (a: OpeningHours, b: OpeningHours) =>
  a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt);

export function toBranchDto(branch: Branch): BranchDto {
  return {
    id: branch.id,
    shopId: branch.shopId,
    name: branch.name,
    emirate: branch.emirate,
    area: branch.area,
    addressLine: branch.addressLine,
    makani: branch.makani,
    location: fromGeoJsonPoint(branch.location),
    serviceArea: roundArea(branch.serviceArea),
    serviceRadiusM: branch.serviceRadiusM,
    pickup: branch.pickup,
    delivery: branch.delivery,
    deliveryFeeFils: branch.deliveryFeeFils,
    minOrderFils: branch.minOrderFils,
    contactWhatsapp: branch.contactWhatsapp,
    contactPhone: branch.contactPhone,
    contactEmail: branch.contactEmail,
    isPrimary: branch.isPrimary,
    openingHours: [...(branch.openingHours ?? [])].sort(byWeekdayThenTime).map((h) => ({
      weekday: h.weekday,
      opensAt: hhmm(h.opensAt)!,
      closesAt: hhmm(h.closesAt)!,
    })),
    specialHours: [...(branch.specialHours ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s: SpecialHours) => ({
        date: s.date,
        closed: s.closed,
        opensAt: hhmm(s.opensAt),
        closesAt: hhmm(s.closesAt),
        label: s.label,
      })),
  };
}

export function toShopDto(shop: Shop, branches: Branch[] = shop.branches ?? []): ShopDto {
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    description: shop.description,
    logoMediaId: shop.logoMediaId,
    galleryMediaIds: shop.galleryMediaIds,
    categoryIds: shop.categoryIds,
    originCountries: shop.originCountries,
    contactWhatsapp: shop.contactWhatsapp,
    contactPhone: shop.contactPhone,
    contactEmail: shop.contactEmail,
    verificationStatus: shop.verificationStatus,
    kycStatus: shop.kycStatus,
    checkoutEnabled: shop.checkoutEnabled,
    codEnabled: shop.codEnabled,
    staffCanUploadProductImages: shop.staffCanUploadProductImages,
    ownerId: shop.ownerId,
    createdAt: shop.createdAt.toISOString(),
    updatedAt: shop.updatedAt.toISOString(),
    // The primary branch first, then the oldest.
    branches: [...branches]
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map(toBranchDto),
  };
}
