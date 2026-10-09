/** WGS84 coordinate. PostGIS columns are `geography(Point, 4326)`; GeoJSON order is [lng, lat]. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export const toGeoJsonPoint = ({ lat, lng }: LatLng): GeoJsonPoint => ({
  type: 'Point',
  coordinates: [lng, lat],
});
export const fromGeoJsonPoint = (p: GeoJsonPoint): LatLng => ({
  lng: p.coordinates[0],
  lat: p.coordinates[1],
});

/** Generous UAE bounding box, used to reject obviously wrong pins. */
export const UAE_BOUNDS = { minLat: 22.5, maxLat: 26.5, minLng: 51.0, maxLng: 56.5 } as const;
export const isInUae = ({ lat, lng }: LatLng): boolean =>
  lat >= UAE_BOUNDS.minLat &&
  lat <= UAE_BOUNDS.maxLat &&
  lng >= UAE_BOUNDS.minLng &&
  lng <= UAE_BOUNDS.maxLng;

/** Great-circle distance in metres (for display and tests; ranking uses PostGIS). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
