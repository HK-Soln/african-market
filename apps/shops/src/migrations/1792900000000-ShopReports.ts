import { MigrationInterface, QueryRunner } from 'typeorm';

/** F1-15: reports on public shops, for the admin reports queue. */
export class ShopReports1792900000000 implements MigrationInterface {
  name = 'ShopReports1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "shops"."shop_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "shop_id" uuid NOT NULL, "reason" text NOT NULL, "details" text, "reporter_id" uuid, "session_id" text NOT NULL, "status" text NOT NULL DEFAULT 'open', "decided_at" TIMESTAMP WITH TIME ZONE, "decided_by" uuid, "decision_note" text, CONSTRAINT "shop_report_reason_chk" CHECK (reason IN ('fraud', 'counterfeit', 'prohibited', 'misleading', 'offensive', 'unavailable', 'other')), CONSTRAINT "shop_report_status_chk" CHECK (status IN ('open', 'resolved', 'dismissed')), CONSTRAINT "PK_c89993acb2ab6f4f3c8c1affa7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "shop_report_queue_idx" ON "shops"."shop_report" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "shop_report_shop_idx" ON "shops"."shop_report" ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "shop_report_open_visitor_uq" ON "shops"."shop_report" ("shop_id", "session_id") WHERE status = 'open'`,
    );
    await queryRunner.query(
      `CREATE INDEX "shop_report_reporter_idx" ON "shops"."shop_report" ("reporter_id") WHERE reporter_id IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "shops"."shop_report" ADD CONSTRAINT "shop_report_shop_fk" FOREIGN KEY ("shop_id") REFERENCES "shops"."shop"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shops"."shop_report"`);
  }
}
