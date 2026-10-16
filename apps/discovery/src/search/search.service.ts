import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  DiscoveryErrors,
  MAP_PIN_ZOOM,
  MatchedProductDto,
  NearbyBranchDto,
  SearchFilters,
  SearchMapRequest,
  SearchMapResponse,
  SearchNearbyRequest,
  SearchNearbyResponse,
} from '@am/contracts';
import { AppRpcException } from '@am/core';

/** Pickup: how far a customer travels unless they say otherwise. */
export const DEFAULT_PICKUP_RADIUS_M = 10_000;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** Pins the map returns at most; past that, `truncated` asks the user to zoom in. */
export const MAX_PINS = 500;

/**
 * Ranking weights (they add up to 1). Distance decays by half every ~2 km; open now, verified,
 * rating and listing completeness lift a branch; with text, how well it matches.
 */
export const WEIGHTS = {
  distance: 0.45,
  openNow: 0.15,
  verified: 0.05,
  rating: 0.1,
  completeness: 0.1,
  text: 0.15,
} as const;
/** Distance at which the distance score falls to 1/e. */
const DISTANCE_SCALE_M = 3_000;
/** Bayesian rating: a branch with few reviews is pulled toward the prior. */
const RATING_PRIOR = 3.5;
const RATING_PRIOR_WEIGHT = 5;

const TS = 'discovery.am_simple';

/**
 * Words of a search as a prefix query: "palm oi" finds "palm oil". Only letters and digits get
 * through, so the text never reaches to_tsquery's own syntax. Null when nothing is left.
 */
export function prefixQuery(q: string | undefined): string | null {
  const words =
    (q ?? '')
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 8) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

interface Cursor {
  /** The last row's score, as the database printed it. */
  s: string;
  id: string;
  /** The moment the first page used, so later pages rank (open now) the same way. */
  at: string;
  /** The search the cursor belongs to. */
  h: string;
}

const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');

function decode(raw: string, hash: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Cursor;
    if (
      c.h === hash &&
      /^-?\d+(\.\d+)?$/.test(c.s) &&
      /^[0-9a-f-]{36}$/.test(c.id) &&
      !Number.isNaN(Date.parse(c.at))
    )
      return c;
  } catch {
    // Falls through.
  }
  throw AppRpcException.badRequest(DiscoveryErrors.cursorInvalid, 'Not a cursor of this search');
}

/** The search without its paging, so a cursor cannot be used with other filters. */
function searchHash(input: SearchNearbyRequest): string {
  const { cursor: _cursor, limit: _limit, ...rest } = input;
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

/** Collects SQL parameters as $1, $2, ... */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * "Open at this moment" as SQL: the minute of the week against the stored weekly ranges, and the
 * full check only for branches with special hours that day.
 */
function openSql(p: Params, atIso: string): string {
  const local = new Date(Date.parse(atIso) + DUBAI_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const minute = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
  return `(CASE WHEN b.special_dates @> ARRAY[${p.add(day)}]::text[]
            THEN discovery.is_open(b.hours, ${p.add(atIso)}::timestamptz)
            ELSE b.open_week @> ${p.add(minute)}::int END)`;
}

/** The WHERE conditions both the list and the map apply. `open` is openSql's expression. */
function filterSql(f: SearchFilters, p: Params, tsq: string | null, open: string): string[] {
  // Customers only see emirates an admin has opened.
  const where: string[] = [
    `b.emirate IN (SELECT code FROM discovery.emirate_search WHERE search_open)`,
  ];
  if (f.categoryId) where.push(`b.category_ids @> ARRAY[${p.add(f.categoryId)}]::uuid[]`);
  if (f.emirate) where.push(`b.emirate = ${p.add(f.emirate)}`);
  if (f.originCountry) {
    const cc = p.add(f.originCountry.toUpperCase());
    where.push(`(${cc} = ANY(b.origin_countries) OR EXISTS (
      SELECT 1 FROM discovery.search_product sp
       WHERE sp.shop_id = b.shop_id AND b.branch_id = ANY(sp.branch_ids) AND sp.origin_country = ${cc}))`);
  }
  if (f.openNow) where.push(open);
  if (tsq !== null) {
    const query = p.add(tsq);
    const raw = p.add(f.q!.trim());
    where.push(`(b.searchable @@ to_tsquery('${TS}', ${query})
      OR b.shop_name OPERATOR(public.%) ${raw}
      OR EXISTS (SELECT 1 FROM discovery.search_product sp
                  WHERE sp.shop_id = b.shop_id AND b.branch_id = ANY(sp.branch_ids)
                    AND (sp.searchable @@ to_tsquery('${TS}', ${query})
                         OR sp.title_text OPERATOR(public.%) ${raw})))`);
  }
  return where;
}

/** Nearby search and the map (F1-06), on the read model alone. */
export class SearchService {
  constructor(
    private readonly dataSource: DataSource,
    /** The moment of a search: open now is judged at it. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async nearby(input: SearchNearbyRequest): Promise<SearchNearbyResponse> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const hash = searchHash(input);
    const cursor = input.cursor ? decode(input.cursor, hash) : undefined;
    const atIso = cursor?.at ?? this.now().toISOString();
    const tsq = prefixQuery(input.q);

    const p = new Params();
    const open = openSql(p, atIso);
    const point = `ST_SetSRID(ST_MakePoint(${p.add(input.lng)}, ${p.add(input.lat)}), 4326)::geography`;
    // The indexed coverage finds candidates; the exact area or radius decides.
    const delivers = `(b.coverage && ${point} AND b.delivery AND (
        (b.service_area IS NOT NULL AND ST_Covers(b.service_area, ${point}))
        OR (b.service_radius_m IS NOT NULL AND ST_DWithin(b.location, ${point}, b.service_radius_m))))`;

    const where = filterSql(input, p, tsq, open);
    if (input.mode === 'delivery') where.push(delivers);
    else {
      where.push('b.pickup');
      where.push(
        `ST_DWithin(b.location, ${point}, ${p.add(input.radiusM ?? DEFAULT_PICKUP_RADIUS_M)})`,
      );
      if (input.deliversToMe) where.push(delivers);
    }

    const textScore =
      tsq === null
        ? '0'
        : (() => {
            const query = p.add(tsq);
            const raw = p.add(input.q!.trim());
            return `least(1, greatest(
                coalesce(ts_rank_cd(b.searchable, to_tsquery('${TS}', ${query}), 32), 0),
                public.similarity(b.shop_name, ${raw}),
                coalesce((SELECT max(greatest(ts_rank_cd(sp.searchable, to_tsquery('${TS}', ${query}), 32),
                                              public.similarity(sp.title_text, ${raw})))
                            FROM discovery.search_product sp
                           WHERE sp.shop_id = b.shop_id AND b.branch_id = ANY(sp.branch_ids)), 0)))`;
          })();

    const page: string[] = [];
    if (cursor) {
      const s = p.add(cursor.s);
      page.push(
        `(r.score < ${s}::numeric OR (r.score = ${s}::numeric AND r.branch_id > ${p.add(cursor.id)}::uuid))`,
      );
    }

    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `WITH ranked AS (
         SELECT b.*, ST_Y(b.location::geometry) AS lat, ST_X(b.location::geometry) AS lng,
                x.distance_m, x.open_now,
                round((
                  ${WEIGHTS.distance} * exp(-x.distance_m / ${DISTANCE_SCALE_M})
                  + ${WEIGHTS.openNow} * x.open_now::int
                  + ${WEIGHTS.verified} * b.verified::int
                  + ${WEIGHTS.rating} * ((b.rating_avg * b.rating_count + ${RATING_PRIOR} * ${RATING_PRIOR_WEIGHT})
                                        / (b.rating_count + ${RATING_PRIOR_WEIGHT})) / 5
                  + ${WEIGHTS.completeness} * b.completeness_score / 100.0
                  + ${WEIGHTS.text} * ${textScore}
                )::numeric, 6) AS score
           FROM discovery.search_branch b
          CROSS JOIN LATERAL (
            SELECT ST_Distance(b.location, ${point}) AS distance_m, ${open} AS open_now
          ) x
          WHERE ${where.join('\n            AND ')}
       )
       SELECT r.*, r.score::text AS score_text FROM ranked r
        ${page.length ? `WHERE ${page.join(' AND ')}` : ''}
        ORDER BY r.score DESC, r.branch_id ASC
        LIMIT ${limit + 1}`,
      p.values,
    );

    const more = rows.length > limit;
    const items = rows.slice(0, limit);
    const matched = tsq ? await this.matchedProducts(items, tsq, input.q!.trim()) : new Map();
    const last = items[items.length - 1];
    return {
      items: items.map((r) => toNearby(r, matched.get(r.branch_id as string) ?? [])),
      nextCursor:
        more && last
          ? encode({
              s: last.score_text as string,
              id: last.branch_id as string,
              at: atIso,
              h: hash,
            })
          : null,
    };
  }

  async map(input: SearchMapRequest): Promise<SearchMapResponse> {
    const tsq = prefixQuery(input.q);
    const p = new Params();
    const open = openSql(p, this.now().toISOString());
    const box = `ST_MakeEnvelope(${p.add(input.minLng)}, ${p.add(input.minLat)}, ${p.add(input.maxLng)}, ${p.add(input.maxLat)}, 4326)`;
    const where = [`b.location::geometry && ${box}`, ...filterSql(input, p, tsq, open)];

    if (input.zoom >= MAP_PIN_ZOOM) {
      const rows: Array<Record<string, unknown>> = await this.dataSource.query(
        `SELECT b.branch_id, b.shop_slug, b.shop_name,
                ST_Y(b.location::geometry) AS lat, ST_X(b.location::geometry) AS lng,
                ${open} AS open_now
           FROM discovery.search_branch b
          WHERE ${where.join(' AND ')}
          ORDER BY b.completeness_score DESC, b.branch_id
          LIMIT ${MAX_PINS + 1}`,
        p.values,
      );
      return {
        markers: rows.slice(0, MAX_PINS).map((r) => ({
          kind: 'pin' as const,
          branchId: r.branch_id as string,
          shopSlug: r.shop_slug as string,
          shopName: r.shop_name as string,
          location: { lat: Number(r.lat), lng: Number(r.lng) },
          openNow: Boolean(r.open_now),
        })),
        truncated: rows.length > MAX_PINS,
      };
    }

    // About a quarter of a map tile per cell: clusters a finger apart on a phone.
    const cell = 360 / 2 ** input.zoom / 4;
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT count(*)::int AS count,
              avg(ST_Y(b.location::geometry)) AS lat, avg(ST_X(b.location::geometry)) AS lng,
              (array_agg(b.branch_id ORDER BY b.branch_id))[1] AS branch_id,
              (array_agg(b.shop_slug ORDER BY b.branch_id))[1] AS shop_slug,
              (array_agg(b.shop_name ORDER BY b.branch_id))[1] AS shop_name,
              bool_or(${open}) AS open_now
         FROM discovery.search_branch b
        WHERE ${where.join(' AND ')}
        GROUP BY ST_SnapToGrid(b.location::geometry, ${p.add(cell)})
        LIMIT ${MAX_PINS + 1}`,
      p.values,
    );
    return {
      markers: rows.slice(0, MAX_PINS).map((r) => {
        const location = { lat: Number(r.lat), lng: Number(r.lng) };
        return r.count === 1
          ? {
              kind: 'pin' as const,
              branchId: r.branch_id as string,
              shopSlug: r.shop_slug as string,
              shopName: r.shop_name as string,
              location,
              openNow: Boolean(r.open_now),
            }
          : { kind: 'cluster' as const, location, count: r.count as number };
      }),
      truncated: rows.length > MAX_PINS,
    };
  }

  /** The best three products of each branch that match the text. */
  private async matchedProducts(
    rows: Array<Record<string, unknown>>,
    tsq: string,
    raw: string,
  ): Promise<Map<string, MatchedProductDto[]>> {
    const out = new Map<string, MatchedProductDto[]>();
    if (!rows.length) return out;
    const found: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT b.branch_id, m.*
         FROM unnest($1::uuid[], $2::uuid[]) AS b(branch_id, shop_id)
         CROSS JOIN LATERAL (
           SELECT sp.product_id, sp.title, sp.min_price_fils, sp.image_url
             FROM discovery.search_product sp
            WHERE sp.shop_id = b.shop_id AND b.branch_id = ANY(sp.branch_ids)
              AND (sp.searchable @@ to_tsquery('${TS}', $3) OR sp.title_text OPERATOR(public.%) $4)
            ORDER BY greatest(ts_rank_cd(sp.searchable, to_tsquery('${TS}', $3), 32),
                              public.similarity(sp.title_text, $4)) DESC, sp.product_id
            LIMIT 3
         ) m`,
      [rows.map((r) => r.branch_id), rows.map((r) => r.shop_id), tsq, raw],
    );
    for (const f of found) {
      const list = out.get(f.branch_id as string) ?? [];
      list.push({
        productId: f.product_id as string,
        title: f.title as MatchedProductDto['title'],
        minPriceFils: (f.min_price_fils as number | null) ?? null,
        imageUrl: (f.image_url as string | null) ?? null,
      });
      out.set(f.branch_id as string, list);
    }
    return out;
  }
}

function toNearby(
  r: Record<string, unknown>,
  matchedProducts: MatchedProductDto[],
): NearbyBranchDto {
  return {
    branchId: r.branch_id as string,
    shopId: r.shop_id as string,
    shopSlug: r.shop_slug as string,
    shopName: r.shop_name as string,
    branchName: r.branch_name as string,
    logoUrl: (r.logo_url as string | null) ?? null,
    emirate: r.emirate as string,
    area: (r.area as string | null) ?? null,
    location: { lat: Number(r.lat), lng: Number(r.lng) },
    distanceM: Math.round(Number(r.distance_m)),
    openNow: Boolean(r.open_now),
    pickup: Boolean(r.pickup),
    delivery: Boolean(r.delivery),
    verified: Boolean(r.verified),
    ratingAvg: Number(r.rating_avg),
    ratingCount: Number(r.rating_count),
    categoryIds: r.category_ids as string[],
    originCountries: r.origin_countries as string[],
    matchedProducts,
  };
}
