import { MigrationInterface, QueryRunner } from 'typeorm';

/** F0-05: the emirate a person calls home, set from their profile. Optional. */
export class UserHomeEmirate1791800000000 implements MigrationInterface {
  name = 'UserHomeEmirate1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "identity"."user" ADD "home_emirate" text`);
    await queryRunner.query(
      `ALTER TABLE "identity"."user" ADD CONSTRAINT "user_home_emirate_chk" CHECK (home_emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."user" DROP CONSTRAINT "user_home_emirate_chk"`,
    );
    await queryRunner.query(`ALTER TABLE "identity"."user" DROP COLUMN "home_emirate"`);
  }
}
