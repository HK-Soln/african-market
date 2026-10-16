import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-08: customer search opens per emirate, by an admin, once it has verified shops (PLAN:
 * "Verified shops in an emirate before search opens there"). All seven start closed; sellers
 * can list everywhere meanwhile.
 */
export class EmirateSearch1792425600000 implements MigrationInterface {
  name = 'EmirateSearch1792425600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "discovery"."emirate_search" ("code" text NOT NULL, "search_open" boolean NOT NULL DEFAULT false, "changed_by" uuid, "changed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "emirate_search_code_chk" CHECK (code IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')), CONSTRAINT "PK_emirate_search" PRIMARY KEY ("code"))`,
    );
    // Seed data: the seven emirates, closed.
    await queryRunner.query(
      `INSERT INTO "discovery"."emirate_search" (code) VALUES ('DXB'), ('AUH'), ('SHJ'), ('AJM'), ('UAQ'), ('RAK'), ('FUJ')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "discovery"."emirate_search"`);
  }
}
