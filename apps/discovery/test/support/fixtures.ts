import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { MultiPolygonDto, OpeningHoursDto } from '@am/contracts';

export const PLACES = {
  deira: { lat: 25.2711, lng: 55.3075 },
  alNahda: { lat: 25.2897, lng: 55.3712 },
  internationalCity: { lat: 25.165, lng: 55.409 },
  sharjah: { lat: 25.326, lng: 55.385 },
  ajman: { lat: 25.4052, lng: 55.5136 },
} as const;

/** Every day 09:00-21:00. */
export const DAYTIME: OpeningHoursDto[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: '09:00',
  closesAt: '21:00',
}));

export const square = (at: { lat: number; lng: number }, d: number): MultiPolygonDto => ({
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [at.lng - d, at.lat - d],
        [at.lng + d, at.lat - d],
        [at.lng + d, at.lat + d],
        [at.lng - d, at.lat + d],
        [at.lng - d, at.lat - d],
      ],
    ],
  ],
});

export interface BranchFixture {
  name: string;
  at: { lat: number; lng: number };
  shopId?: string;
  emirate?: string;
  area?: string;
  description?: string;
  categoryIds?: string[];
  originCountries?: string[];
  pickup?: boolean;
  delivery?: boolean;
  serviceRadiusM?: number | null;
  serviceArea?: MultiPolygonDto | null;
  weekly?: OpeningHoursDto[];
  completeness?: number;
}

/** A search_branch row as the indexer would write it. */
export async function insertBranch(db: DataSource, f: BranchFixture) {
  const branchId = randomUUID();
  const shopId = f.shopId ?? randomUUID();
  await db.query(
    `INSERT INTO discovery.search_branch
       (branch_id, shop_id, shop_slug, shop_name, shop_description, branch_name, category_ids,
        origin_countries, emirate, area, location, service_area, service_radius_m, pickup,
        delivery, completeness_score, hours, searchable, updated_from_event_at)
     VALUES ($1, $2, $3, $4, $5, $4, $6, $7, $8, $9,
        ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
        CASE WHEN $12::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($12::text), 4326)::geography END,
        $13, $14, $15, $16, $17,
        setweight(to_tsvector('discovery.am_simple', $4), 'A')
          || setweight(to_tsvector('discovery.am_simple', concat_ws(' ', $9::text, $5::jsonb->>'en')), 'C'),
        now())`,
    [
      branchId,
      shopId,
      `${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${branchId.slice(0, 4)}`,
      f.name,
      JSON.stringify({ en: f.description ?? '' }),
      f.categoryIds ?? [],
      f.originCountries ?? [],
      f.emirate ?? 'DXB',
      f.area ?? null,
      f.at.lng,
      f.at.lat,
      f.serviceArea ? JSON.stringify(f.serviceArea) : null,
      f.serviceRadiusM === undefined ? 5_000 : f.serviceRadiusM,
      f.pickup ?? true,
      f.delivery ?? true,
      f.completeness ?? 50,
      JSON.stringify({ weekly: f.weekly ?? DAYTIME, special: [] }),
    ],
  );
  return { branchId, shopId };
}

export async function insertProduct(
  db: DataSource,
  p: {
    shopId: string;
    branchIds: string[];
    title: string;
    categoryId?: string;
    originCountry?: string;
  },
) {
  const productId = randomUUID();
  await db.query(
    `INSERT INTO discovery.search_product
       (product_id, shop_id, branch_ids, title, title_text, category_id, origin_country,
        min_price_fils, searchable, updated_from_event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1500,
        setweight(to_tsvector('discovery.am_simple', $5), 'A'), now())`,
    [
      productId,
      p.shopId,
      p.branchIds,
      JSON.stringify({ en: p.title }),
      p.title,
      p.categoryId ?? randomUUID(),
      p.originCountry ?? null,
    ],
  );
  return productId;
}

/**
 * Many branches spread over Dubai, Sharjah and Ajman, with products, for the speed check:
 * built in SQL so 10,000 rows take seconds.
 */
export async function seedMany(db: DataSource, count: number): Promise<void> {
  await db.query(
    `INSERT INTO discovery.search_branch
       (branch_id, shop_id, shop_slug, shop_name, shop_description, branch_name, category_ids,
        origin_countries, emirate, area, location, service_area, service_radius_m, pickup,
        delivery, completeness_score, hours, searchable, updated_from_event_at)
     SELECT gen_random_uuid(), gen_random_uuid(), 'seed-' || i, 'Seed shop ' || i || ' ' || w.word,
            '{}', 'Branch ' || i, ARRAY[$2::uuid], ARRAY['NG'], 'DXB', 'Area ' || (i % 50),
            ST_SetSRID(ST_MakePoint(55.20 + random() * 0.35, 25.05 + random() * 0.40), 4326)::geography,
            NULL, 3000 + (i % 10) * 1000, true, i % 3 <> 0, (i % 100)::smallint,
            $3::jsonb,
            to_tsvector('discovery.am_simple', 'Seed shop ' || i || ' ' || w.word), now()
       FROM generate_series(1, $1) AS i
       CROSS JOIN LATERAL (SELECT (ARRAY['egusi','ogbono','plantain','jollof','ankara','braids','suya','fufu'])[1 + i % 8] AS word) w`,
    [count, randomUUID(), JSON.stringify({ weekly: DAYTIME, special: [] })],
  );
  await db.query(
    `INSERT INTO discovery.search_product
       (product_id, shop_id, branch_ids, title, title_text, category_id, min_price_fils,
        searchable, updated_from_event_at)
     SELECT gen_random_uuid(), b.shop_id, ARRAY[b.branch_id], jsonb_build_object('en', t.title),
            t.title, gen_random_uuid(), 1000 + (random() * 9000)::int,
            to_tsvector('discovery.am_simple', t.title), now()
       FROM discovery.search_branch b
       CROSS JOIN LATERAL (VALUES ('Palm oil ' || b.shop_slug), ('Garri ' || b.shop_slug)) AS t(title)
      WHERE b.shop_slug LIKE 'seed-%'`,
  );
  await db.query(`ANALYZE discovery.search_branch`);
  await db.query(`ANALYZE discovery.search_product`);
}
