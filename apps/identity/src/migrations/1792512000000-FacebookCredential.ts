import { MigrationInterface, QueryRunner } from 'typeorm';

/** F1-09: Facebook sign-in links are credentials too. */
export class FacebookCredential1792512000000 implements MigrationInterface {
  name = 'FacebookCredential1792512000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" DROP CONSTRAINT "credential_type_chk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" ADD CONSTRAINT "credential_type_chk" CHECK (type IN ('password', 'google', 'facebook', 'apple'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" DROP CONSTRAINT "credential_type_chk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" ADD CONSTRAINT "credential_type_chk" CHECK (type IN ('password', 'google', 'apple'))`,
    );
  }
}
