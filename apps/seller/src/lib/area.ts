/**
 * A branch's delivery area: drawn as one outline on the map, stored as GeoJSON MultiPolygon
 * (longitude first, ring closed), as the shops service takes it.
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

const EARTH_M = 6_371_000;

/** A shape to start from: `sides` corners on a circle of `radiusM` around the pin. */
export function circleOutline(center: Point, radiusM: number, sides = 12): Point[] {
  const lat = (center.lat * Math.PI) / 180;
  return Array.from({ length: sides }, (_, i) => {
    const angle = (2 * Math.PI * i) / sides;
    const dLat = (radiusM * Math.cos(angle)) / EARTH_M;
    const dLng = (radiusM * Math.sin(angle)) / (EARTH_M * Math.cos(lat));
    return {
      lat: Number((center.lat + (dLat * 180) / Math.PI).toFixed(6)),
      lng: Number((center.lng + (dLng * 180) / Math.PI).toFixed(6)),
    };
  });
}

/** The outline as the API takes it: one polygon, longitude first, first point repeated last. */
export function toMultiPolygon(path: Point[]): MultiPolygon {
  const ring = path.map((p) => [p.lng, p.lat]);
  return { type: 'MultiPolygon', coordinates: [[[...ring, ring[0]]]] };
}

/** The first polygon's outline back for editing (any holes or further polygons are dropped). */
export function fromMultiPolygon(area: MultiPolygon | null | undefined): Point[] | null {
  const ring = area?.coordinates[0]?.[0];
  if (!ring || ring.length < 4) return null;
  const open = ring.slice(0, -1);
  return open.map(([lng, lat]) => ({ lat, lng }));
}

/** An outline the shops service accepts: at least three distinct corners. */
export const isUsableOutline = (path: Point[]) =>
  new Set(path.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)).size >= 3;
