import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-03: verification requests (identity at the provider, trade licence here), the audit trail of
 * every step, and the shop columns the review queue and the seller need (decision T-28).
 */
export class SellerVerification1792158369273 implements MigrationInterface {
  name = 'SellerVerification1792158369273';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "shops"."verification_audit" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shop_id" uuid NOT NULL, "request_id" uuid, "actor_id" uuid, "action" text NOT NULL, "details" jsonb NOT NULL DEFAULT '{}', "correlation_id" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_86d6b4f51668677959c60dca47c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "verification_audit_shop_idx" ON "shops"."verification_audit" ("shop_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "shops"."verification_request" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "shop_id" uuid NOT NULL, "type" text NOT NULL, "submitted_by" uuid NOT NULL, "status" text NOT NULL, "provider" text, "provider_session_id" text, "kyc" jsonb, "document_media_id" uuid, "reviewer_id" uuid, "reason" text, "decided_at" TIMESTAMP WITH TIME ZONE, "erase_after" TIMESTAMP WITH TIME ZONE, "erased_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "verification_request_status_chk" CHECK (status IN ('started', 'pending', 'approved', 'rejected', 'expired')), CONSTRAINT "verification_request_type_chk" CHECK (type IN ('kyc', 'trade_license')), CONSTRAINT "PK_9d9499e0fabae343c7ec3ecfac9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "verification_request_erase_idx" ON "shops"."verification_request" ("erase_after") WHERE erase_after IS NOT NULL AND erased_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "verification_request_session_uq" ON "shops"."verification_request" ("provider_session_id") WHERE provider_session_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "verification_request_shop_idx" ON "shops"."verification_request" ("shop_id", "created_at") `,
    );
    await queryRunner.query(`ALTER TABLE "shops"."shop" ADD "license_issuing_authority" text`);
    await queryRunner.query(
      `ALTER TABLE "shops"."shop" ADD "submitted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "shops"."shop" ADD "verification_reason" text`);
    await queryRunner.query(
      `CREATE INDEX "shop_review_queue_idx" ON "shops"."shop" ("verification_status", "submitted_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "shops"."shop_review_queue_idx"`);
    await queryRunner.query(`ALTER TABLE "shops"."shop" DROP COLUMN "verification_reason"`);
    await queryRunner.query(`ALTER TABLE "shops"."shop" DROP COLUMN "submitted_at"`);
    await queryRunner.query(`ALTER TABLE "shops"."shop" DROP COLUMN "license_issuing_authority"`);
    await queryRunner.query(`DROP INDEX "shops"."verification_request_shop_idx"`);
    await queryRunner.query(`DROP INDEX "shops"."verification_request_session_uq"`);
    await queryRunner.query(`DROP INDEX "shops"."verification_request_erase_idx"`);
    await queryRunner.query(`DROP TABLE "shops"."verification_request"`);
    await queryRunner.query(`DROP INDEX "shops"."verification_audit_shop_idx"`);
    await queryRunner.query(`DROP TABLE "shops"."verification_audit"`);
  }
}
