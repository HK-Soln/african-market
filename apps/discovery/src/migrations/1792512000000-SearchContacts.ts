import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-11: each result card has WhatsApp and call buttons, so the read model keeps the branch's
 * contact numbers (its own, else the shop's). Rows indexed before this have none until the shop
 * is indexed again or an admin rebuilds search.
 */
export class SearchContacts1792512000000 implements MigrationInterface {
  name = 'SearchContacts1792512000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "discovery"."search_branch" ADD "contact_whatsapp" text, ADD "contact_phone" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "discovery"."search_branch" DROP COLUMN "contact_phone", DROP COLUMN "contact_whatsapp"`,
    );
  }
}
