import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-05: the search read model (branches and products of verified shops, the category tree, image
 * URLs), the `am_simple` text search configuration (simple tokens, accents dropped, so "Egusi",
 * "egusi" and "Égusi" match) and the GIN, trigram and spatial indexes search runs on.
 */
export class SearchReadModel1792252800000 implements MigrationInterface {
  name = 'SearchReadModel1792252800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TEXT SEARCH CONFIGURATION "discovery"."am_simple" (COPY = pg_catalog.simple)`,
    );
    await queryRunner.query(
      `ALTER TEXT SEARCH CONFIGURATION "discovery"."am_simple"
         ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, word, hword, hword_part
         WITH public.unaccent, pg_catalog.simple`,
    );

    await queryRunner.query(
      `CREATE TABLE "discovery"."search_branch" ("branch_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "shop_slug" text NOT NULL, "shop_name" text NOT NULL, "shop_description" jsonb NOT NULL DEFAULT '{}', "branch_name" text NOT NULL, "logo_media_id" uuid, "logo_url" text, "shop_category_ids" uuid array NOT NULL DEFAULT '{}', "category_ids" uuid array NOT NULL DEFAULT '{}', "origin_countries" text array NOT NULL DEFAULT '{}', "emirate" text NOT NULL, "area" text, "location" geography(Point,4326) NOT NULL, "service_area" geography(MultiPolygon,4326), "service_radius_m" integer, "pickup" boolean NOT NULL, "delivery" boolean NOT NULL, "verified" boolean NOT NULL DEFAULT true, "rating_avg" real NOT NULL DEFAULT '0', "rating_count" integer NOT NULL DEFAULT '0', "completeness_score" smallint NOT NULL DEFAULT '0', "hours" jsonb NOT NULL DEFAULT '{"weekly":[],"special":[]}', "searchable" tsvector, "boost_until" TIMESTAMP WITH TIME ZONE, "boost_weight" real NOT NULL DEFAULT '0', "updated_from_event_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_5a8bd547d771135a7a792a81718" PRIMARY KEY ("branch_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_shop_idx" ON "discovery"."search_branch" ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_emirate_idx" ON "discovery"."search_branch" ("emirate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_categories_idx" ON "discovery"."search_branch" ("category_ids") `,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_location_idx" ON "discovery"."search_branch" USING GiST ("location") `,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_service_area_idx" ON "discovery"."search_branch" USING GiST ("service_area") `,
    );

    await queryRunner.query(
      `CREATE TABLE "discovery"."search_product" ("product_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "branch_ids" uuid array NOT NULL DEFAULT '{}', "title" jsonb NOT NULL, "title_text" text NOT NULL, "category_id" uuid NOT NULL, "origin_country" text, "min_price_fils" integer, "image_media_id" uuid, "image_url" text, "searchable" tsvector, "updated_from_event_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_9001611a8bfc7eaca05e34b2ea9" PRIMARY KEY ("product_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_product_shop_idx" ON "discovery"."search_product" ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "search_product_branches_idx" ON "discovery"."search_product" ("branch_ids") `,
    );

    await queryRunner.query(
      `CREATE TABLE "discovery"."search_category" ("id" uuid NOT NULL, "parent_id" uuid, "name" jsonb NOT NULL, "path" uuid array NOT NULL, CONSTRAINT "PK_ed4ac55eccd0bb54838fedca1fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "discovery"."search_media" ("media_id" uuid NOT NULL, "urls" jsonb NOT NULL, CONSTRAINT "PK_2a8f3cb0dfa08b1c5a124b35ce5" PRIMARY KEY ("media_id"))`,
    );

    // What TypeORM cannot declare: GIN on arrays and text vectors, trigram on names.
    await queryRunner.query(`DROP INDEX "discovery"."search_branch_categories_idx"`);
    await queryRunner.query(
      `CREATE INDEX "search_branch_categories_idx" ON "discovery"."search_branch" USING GIN ("category_ids")`,
    );
    await queryRunner.query(`DROP INDEX "discovery"."search_product_branches_idx"`);
    await queryRunner.query(
      `CREATE INDEX "search_product_branches_idx" ON "discovery"."search_product" USING GIN ("branch_ids")`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_searchable_idx" ON "discovery"."search_branch" USING GIN ("searchable")`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_product_searchable_idx" ON "discovery"."search_product" USING GIN ("searchable")`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_branch_name_trgm_idx" ON "discovery"."search_branch" USING GIN ("shop_name" public.gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "search_product_title_trgm_idx" ON "discovery"."search_product" USING GIN ("title_text" public.gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "discovery"."search_media"`);
    await queryRunner.query(`DROP TABLE "discovery"."search_category"`);
    await queryRunner.query(`DROP TABLE "discovery"."search_product"`);
    await queryRunner.query(`DROP TABLE "discovery"."search_branch"`);
    await queryRunner.query(`DROP TEXT SEARCH CONFIGURATION "discovery"."am_simple"`);
  }
}
