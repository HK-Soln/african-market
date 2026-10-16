import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-06: what nearby search needs to stay fast over many branches.
 *
 * - `is_open(hours, at)`: whether a branch is open at a moment, from the `hours` the read model
 *   keeps (weekly and special, `HH:MM` in Asia/Dubai, weekday 0 = Sunday). A special date replaces
 *   the weekly hours when it says closed or gives times. A period that closes at or before it
 *   opens runs past midnight.
 * - `open_week`: the weekly hours as minute ranges of the week (0 = Sunday 00:00), so "open now"
 *   is one range lookup; `special_dates` says when `is_open` must decide instead.
 * - `coverage`: where a branch delivers (its drawn area, or a circle a little wider than its
 *   radius), indexed, to find delivering branches before the exact check.
 */
export class NearbySearch1792339200000 implements MigrationInterface {
  name = 'NearbySearch1792339200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION discovery.is_open(p_hours jsonb, p_at timestamptz) RETURNS boolean
      LANGUAGE sql STABLE PARALLEL SAFE AS $fn$
        WITH d AS (
          SELECT (p_at AT TIME ZONE 'Asia/Dubai')::date AS day,
                 extract(dow FROM p_at AT TIME ZONE 'Asia/Dubai')::int AS dow,
                 to_char(p_at AT TIME ZONE 'Asia/Dubai', 'HH24:MI') AS hm
        ),
        special AS (
          SELECT s FROM jsonb_array_elements(coalesce(p_hours->'special', '[]')) s, d
           WHERE s->>'date' = d.day::text
             AND ((s->>'closed')::boolean OR s->>'opensAt' IS NOT NULL)
           LIMIT 1
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM special) THEN (
            SELECT NOT (s->>'closed')::boolean AND CASE
                     WHEN s->>'closesAt' > s->>'opensAt'
                       THEN d.hm >= s->>'opensAt' AND d.hm < s->>'closesAt'
                     ELSE d.hm >= s->>'opensAt'
                   END
              FROM special, d)
          ELSE EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(p_hours->'weekly', '[]')) w, d
             WHERE ((w->>'weekday')::int = d.dow AND (
                      (w->>'closesAt' > w->>'opensAt'
                        AND d.hm >= w->>'opensAt' AND d.hm < w->>'closesAt')
                      OR (w->>'closesAt' <= w->>'opensAt' AND d.hm >= w->>'opensAt')))
                OR ((w->>'weekday')::int = (d.dow + 6) % 7
                      AND w->>'closesAt' <= w->>'opensAt' AND d.hm < w->>'closesAt'))
        END
      $fn$`);

    await queryRunner.query(`
      CREATE FUNCTION discovery.week_ranges(p_hours jsonb) RETURNS int4multirange
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
        WITH w AS (
          SELECT (e->>'weekday')::int * 1440
                   + split_part(e->>'opensAt', ':', 1)::int * 60 + split_part(e->>'opensAt', ':', 2)::int AS s,
                 (e->>'weekday')::int * 1440
                   + split_part(e->>'closesAt', ':', 1)::int * 60 + split_part(e->>'closesAt', ':', 2)::int AS c
            FROM jsonb_array_elements(coalesce(p_hours->'weekly', '[]')) e
        ),
        p AS (SELECT s, CASE WHEN c <= s THEN c + 1440 ELSE c END AS e FROM w)
        SELECT coalesce(range_agg(r), '{}'::int4multirange) FROM (
          SELECT int4range(s, least(e, 10080)) AS r FROM p
          UNION ALL
          -- Saturday night into Sunday morning wraps to the start of the week.
          SELECT int4range(0, e - 10080) FROM p WHERE e > 10080
        ) x
      $fn$`);

    await queryRunner.query(`
      CREATE FUNCTION discovery.special_dates(p_hours jsonb) RETURNS text[]
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
        SELECT coalesce(array_agg(e->>'date'), '{}')
          FROM jsonb_array_elements(coalesce(p_hours->'special', '[]')) e
         WHERE (e->>'closed')::boolean OR e->>'opensAt' IS NOT NULL
      $fn$`);

    await queryRunner.query(
      `ALTER TABLE "discovery"."search_branch"
         ADD "open_week" int4multirange GENERATED ALWAYS AS (discovery.week_ranges(hours)) STORED,
         ADD "special_dates" text[] GENERATED ALWAYS AS (discovery.special_dates(hours)) STORED,
         ADD "coverage" geography GENERATED ALWAYS AS (
           CASE WHEN NOT delivery THEN NULL
                WHEN service_area IS NOT NULL THEN service_area
                WHEN service_radius_m IS NOT NULL THEN ST_Buffer(location, service_radius_m * 1.02)
           END) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_coverage_idx" ON "discovery"."search_branch" USING GiST ("coverage")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "discovery"."search_branch_coverage_idx"`);
    await queryRunner.query(
      `ALTER TABLE "discovery"."search_branch" DROP COLUMN "coverage", DROP COLUMN "special_dates", DROP COLUMN "open_week"`,
    );
    await queryRunner.query(`DROP FUNCTION discovery.special_dates(jsonb)`);
    await queryRunner.query(`DROP FUNCTION discovery.week_ranges(jsonb)`);
    await queryRunner.query(`DROP FUNCTION discovery.is_open(jsonb, timestamptz)`);
  }
}
