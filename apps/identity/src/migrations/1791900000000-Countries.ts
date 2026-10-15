import { MigrationInterface, QueryRunner } from 'typeorm';
import { COUNTRY_SEED } from './data/countries-2026-10';

/**
 * F0-18: countries as reference data. Seeded with every country that has phone numbers; the nine
 * the app offered until now (UAE first) are enabled for phone sign-up and origin badges. After
 * this, admins change them in the admin app.
 */
export class Countries1791900000000 implements MigrationInterface {
  name = 'Countries1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "identity"."country" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "code" text NOT NULL,
        "name" jsonb NOT NULL,
        "dial_code" text NOT NULL,
        "flag" text NOT NULL,
        "phone_enabled" boolean NOT NULL DEFAULT false,
        "origin_enabled" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 1000,
        CONSTRAINT "PK_bf6e37c231c4f4ea56dcd887269" PRIMARY KEY ("id"),
        CONSTRAINT "country_code_chk" CHECK (code ~ '^[A-Z]{2}$'),
        CONSTRAINT "country_dial_code_chk" CHECK (dial_code ~ '^\\+[0-9]{1,4}$')
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "country_code_uq" ON "identity"."country" ("code")`,
    );

    // One statement, values as parameters.
    const values: unknown[] = [];
    const rows = COUNTRY_SEED.map((country, i) => {
      const at = i * 7;
      values.push(
        country.code,
        JSON.stringify(country.name),
        country.dialCode,
        country.flag,
        country.enabled,
        country.enabled,
        country.sortOrder,
      );
      return `($${at + 1}, $${at + 2}::jsonb, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7})`;
    });
    await queryRunner.query(
      `INSERT INTO "identity"."country"
        ("code", "name", "dial_code", "flag", "phone_enabled", "origin_enabled", "sort_order")
       VALUES ${rows.join(', ')}`,
      values,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "identity"."country"`);
  }
}
