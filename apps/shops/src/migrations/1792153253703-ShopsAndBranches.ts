import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-02: shops, branches (PostGIS pin and delivery area), weekly opening hours and special days.
 */
export class ShopsAndBranches1792153253703 implements MigrationInterface {
  name = 'ShopsAndBranches1792153253703';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Contact emails compare without case; shops must not rely on another service having installed it.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public`);
    await queryRunner.query(
      `CREATE TABLE "shops"."opening_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "branch_id" uuid NOT NULL, "weekday" smallint NOT NULL, "opens_at" TIME NOT NULL, "closes_at" TIME NOT NULL, CONSTRAINT "opening_hours_span_chk" CHECK (opens_at <> closes_at), CONSTRAINT "opening_hours_weekday_chk" CHECK (weekday BETWEEN 0 AND 6), CONSTRAINT "PK_09415e2b345103b1f5971464f85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "opening_hours_branch_idx" ON "shops"."opening_hours" ("branch_id", "weekday") `,
    );
    await queryRunner.query(
      `CREATE TABLE "shops"."shop" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" text NOT NULL, "slug" text NOT NULL, "description" jsonb NOT NULL DEFAULT '{}', "logo_media_id" uuid, "gallery_media_ids" uuid array NOT NULL DEFAULT '{}', "category_ids" uuid array NOT NULL DEFAULT '{}', "origin_countries" text array NOT NULL DEFAULT '{}', "contact_whatsapp" text, "contact_phone" text, "contact_email" citext, "legal_name" text, "trade_license_no" text, "license_expiry" date, "license_media_id" uuid, "kyc_status" text NOT NULL DEFAULT 'none', "verification_status" text NOT NULL DEFAULT 'draft', "checkout_enabled" boolean NOT NULL DEFAULT false, "cod_enabled" boolean NOT NULL DEFAULT false, "stripe_account_id" text, "staff_can_upload_product_images" boolean NOT NULL DEFAULT false, "owner_id" uuid NOT NULL, CONSTRAINT "shop_slug_chk" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), CONSTRAINT "shop_kyc_status_chk" CHECK (kyc_status IN ('none', 'pending', 'passed', 'failed')), CONSTRAINT "shop_verification_status_chk" CHECK (verification_status IN ('draft', 'pending', 'verified', 'rejected', 'suspended')), CONSTRAINT "PK_ad47b7c6121fe31cb4b05438e44" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "shop_owner_idx" ON "shops"."shop" ("owner_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "shop_slug_uq" ON "shops"."shop" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "shops"."special_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "branch_id" uuid NOT NULL, "date" date NOT NULL, "closed" boolean NOT NULL DEFAULT false, "opens_at" TIME, "closes_at" TIME, "label" jsonb, CONSTRAINT "special_hours_times_chk" CHECK (closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)), CONSTRAINT "PK_1f6ec3f82ab79967ba9b26ef39a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "special_hours_branch_date_uq" ON "shops"."special_hours" ("branch_id", "date") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "shops"."branch" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "shop_id" uuid NOT NULL, "name" text NOT NULL, "emirate" text NOT NULL, "area" text, "address_line" text, "makani" text, "location" geography(Point,4326) NOT NULL, "service_area" geography(MultiPolygon,4326), "service_radius_m" integer, "pickup" boolean NOT NULL DEFAULT true, "delivery" boolean NOT NULL DEFAULT false, "delivery_fee_fils" integer NOT NULL DEFAULT '0', "min_order_fils" integer NOT NULL DEFAULT '0', "contact_whatsapp" text, "contact_phone" text, "contact_email" citext, "is_primary" boolean NOT NULL DEFAULT false, CONSTRAINT "branch_money_chk" CHECK (delivery_fee_fils >= 0 AND min_order_fils >= 0), CONSTRAINT "branch_service_radius_chk" CHECK (service_radius_m IS NULL OR service_radius_m BETWEEN 100 AND 100000), CONSTRAINT "branch_makani_chk" CHECK (makani IS NULL OR makani ~ '^[0-9]{10}$'), CONSTRAINT "branch_emirate_chk" CHECK (emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')), CONSTRAINT "PK_2e39f426e2faefdaa93c5961976" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "branch_location_idx" ON "shops"."branch" USING GiST ("location") `,
    );
    await queryRunner.query(
      `CREATE INDEX "branch_service_area_idx" ON "shops"."branch" USING GiST ("service_area") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "branch_primary_uq" ON "shops"."branch" ("shop_id") WHERE is_primary AND deleted_at IS NULL`,
    );
    await queryRunner.query(`CREATE INDEX "branch_shop_idx" ON "shops"."branch" ("shop_id") `);
    await queryRunner.query(
      `ALTER TABLE "shops"."opening_hours" ADD CONSTRAINT "FK_c245a3996f598a86f2f5e7efcc0" FOREIGN KEY ("branch_id") REFERENCES "shops"."branch"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shops"."special_hours" ADD CONSTRAINT "FK_67d9a777e49dcbc1b09f7e54dc5" FOREIGN KEY ("branch_id") REFERENCES "shops"."branch"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shops"."branch" ADD CONSTRAINT "FK_a7accc3d79fdcd63cd4a8922f09" FOREIGN KEY ("shop_id") REFERENCES "shops"."shop"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shops"."branch" DROP CONSTRAINT "FK_a7accc3d79fdcd63cd4a8922f09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shops"."special_hours" DROP CONSTRAINT "FK_67d9a777e49dcbc1b09f7e54dc5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shops"."opening_hours" DROP CONSTRAINT "FK_c245a3996f598a86f2f5e7efcc0"`,
    );
    await queryRunner.query(`DROP INDEX "shops"."branch_shop_idx"`);
    await queryRunner.query(`DROP INDEX "shops"."branch_primary_uq"`);
    await queryRunner.query(`DROP INDEX "shops"."branch_service_area_idx"`);
    await queryRunner.query(`DROP INDEX "shops"."branch_location_idx"`);
    await queryRunner.query(`DROP TABLE "shops"."branch"`);
    await queryRunner.query(`DROP INDEX "shops"."special_hours_branch_date_uq"`);
    await queryRunner.query(`DROP TABLE "shops"."special_hours"`);
    await queryRunner.query(`DROP INDEX "shops"."shop_slug_uq"`);
    await queryRunner.query(`DROP INDEX "shops"."shop_owner_idx"`);
    await queryRunner.query(`DROP TABLE "shops"."shop"`);
    await queryRunner.query(`DROP INDEX "shops"."opening_hours_branch_idx"`);
    await queryRunner.query(`DROP TABLE "shops"."opening_hours"`);
  }
}
