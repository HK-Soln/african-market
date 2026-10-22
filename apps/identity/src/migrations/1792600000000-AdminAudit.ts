import { MigrationInterface, QueryRunner } from 'typeorm';

/** F1-14: the admin audit log (decision T-42). */
export class AdminAudit1792600000000 implements MigrationInterface {
  name = 'AdminAudit1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "identity"."admin_audit" ("id" uuid NOT NULL, "source" text NOT NULL, "actor_id" uuid, "action" text NOT NULL, "subject_type" text NOT NULL, "subject_id" text NOT NULL, "shop_id" uuid, "details" jsonb NOT NULL DEFAULT '{}', "correlation_id" text, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_admin_audit" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "admin_audit_time_idx" ON "identity"."admin_audit" ("occurred_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "admin_audit_actor_idx" ON "identity"."admin_audit" ("actor_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "admin_audit_shop_idx" ON "identity"."admin_audit" ("shop_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "admin_audit_subject_idx" ON "identity"."admin_audit" ("subject_type", "subject_id", "occurred_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "identity"."admin_audit"`);
  }
}
