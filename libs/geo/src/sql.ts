/**
 * PostGIS fragments for TypeORM query builders. Parameters are always bound,
 * never interpolated. Columns are `geography`, so distances are in metres.
 *
 * Example:
 *   qb.where(withinMeters('b.location'), { lng, lat, meters: 5000 })
 *     .addSelect(distanceMeters('b.location'), 'distance_m')
 *     .orderBy('distance_m', 'ASC');
 */
export const POINT_PARAM = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';

/** `column` within `:meters` of the point (:lng, :lat). Uses the GiST index. */
export const withinMeters = (column: string): string =>
  `ST_DWithin(${column}, ${POINT_PARAM}, :meters)`;

/** `column` (an area) covers the point (:lng, :lat): "does this branch deliver here". */
export const coversPoint = (column: string): string => `ST_Covers(${column}, ${POINT_PARAM})`;

export const distanceMeters = (column: string): string => `ST_Distance(${column}, ${POINT_PARAM})`;

/** TypeORM column options for a geography point. Pair with `@Index({ spatial: true })`. */
export const geographyPointColumn = {
  type: 'geography',
  spatialFeatureType: 'Point',
  srid: 4326,
} as const;

export const geographyMultiPolygonColumn = {
  type: 'geography',
  spatialFeatureType: 'MultiPolygon',
  srid: 4326,
  nullable: true,
} as const;
