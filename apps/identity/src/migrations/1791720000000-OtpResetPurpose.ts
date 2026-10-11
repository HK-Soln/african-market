import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F0-04: one-time codes can now be issued for a password reset. Written by hand, because TypeORM
 * does not notice a CHECK constraint whose name is unchanged but whose expression differs.
 */
export class OtpResetPurpose1791720000000 implements MigrationInterface {
  name = 'OtpResetPurpose1791720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."otp_challenge" DROP CONSTRAINT "otp_challenge_purpose_chk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."otp_challenge" ADD CONSTRAINT "otp_challenge_purpose_chk" CHECK (purpose IN ('signup', 'login', 'verify', 'reset'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "identity"."otp_challenge" WHERE purpose = 'reset'`);
    await queryRunner.query(
      `ALTER TABLE "identity"."otp_challenge" DROP CONSTRAINT "otp_challenge_purpose_chk"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."otp_challenge" ADD CONSTRAINT "otp_challenge_purpose_chk" CHECK (purpose IN ('signup', 'login', 'verify'))`,
    );
  }
}
