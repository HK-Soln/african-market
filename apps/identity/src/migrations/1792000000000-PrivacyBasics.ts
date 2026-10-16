import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F0-16: which versions of the terms and privacy policy a person accepted, when a deleted
 * account's personal data was erased, and when each session family was signed in (for actions
 * that need a recent sign-in).
 */
export class PrivacyBasics1792000000000 implements MigrationInterface {
  name = 'PrivacyBasics1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "identity"."user" ADD "terms_version" text`);
    await queryRunner.query(`ALTER TABLE "identity"."user" ADD "privacy_version" text`);
    await queryRunner.query(
      `ALTER TABLE "identity"."user" ADD "erased_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Deleted accounts still waiting to be erased: what the erasure job looks for.
    await queryRunner.query(
      `CREATE INDEX "user_erasure_due_idx" ON "identity"."user" ("deleted_at") WHERE deleted_at IS NOT NULL AND erased_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."session" ADD "authenticated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    // Existing sessions: the family's first row is when its sign-in happened.
    await queryRunner.query(`
      UPDATE "identity"."session" s
      SET authenticated_at = f.first_at
      FROM (SELECT family_id, min(created_at) AS first_at FROM "identity"."session" GROUP BY family_id) f
      WHERE s.family_id = f.family_id`);
    // One-time codes are looked up by where they were sent; the cleanup deletes old ones by age.
    await queryRunner.query(
      `CREATE INDEX "otp_challenge_created_idx" ON "identity"."otp_challenge" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "identity"."otp_challenge_created_idx"`);
    await queryRunner.query(`ALTER TABLE "identity"."session" DROP COLUMN "authenticated_at"`);
    await queryRunner.query(`DROP INDEX "identity"."user_erasure_due_idx"`);
    await queryRunner.query(`ALTER TABLE "identity"."user" DROP COLUMN "erased_at"`);
    await queryRunner.query(`ALTER TABLE "identity"."user" DROP COLUMN "privacy_version"`);
    await queryRunner.query(`ALTER TABLE "identity"."user" DROP COLUMN "terms_version"`);
  }
}
