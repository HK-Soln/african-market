import { MigrationInterface, QueryRunner } from 'typeorm';

/** F1-15: reports on public products, for the admin reports queue. */
export class ProductReports1792900000000 implements MigrationInterface {
  name = 'ProductReports1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "catalog"."product_report" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "product_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "reason" text NOT NULL, "details" text, "reporter_id" uuid, "session_id" text NOT NULL, "status" text NOT NULL DEFAULT 'open', "decided_at" TIMESTAMP WITH TIME ZONE, "decided_by" uuid, "decision_note" text, CONSTRAINT "product_report_reason_chk" CHECK (reason IN ('fraud', 'counterfeit', 'prohibited', 'misleading', 'offensive', 'unavailable', 'other')), CONSTRAINT "product_report_status_chk" CHECK (status IN ('open', 'resolved', 'dismissed')), CONSTRAINT "PK_ae45e8e28ce6ca0ce3c77ba1202" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_report_queue_idx" ON "catalog"."product_report" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "product_report_product_idx" ON "catalog"."product_report" ("product_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "product_report_shop_idx" ON "catalog"."product_report" ("shop_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "product_report_open_visitor_uq" ON "catalog"."product_report" ("product_id", "session_id") WHERE status = 'open'`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_report_reporter_idx" ON "catalog"."product_report" ("reporter_id") WHERE reporter_id IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog"."product_report" ADD CONSTRAINT "product_report_product_fk" FOREIGN KEY ("product_id") REFERENCES "catalog"."product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "catalog"."product_report"`);
  }
}
