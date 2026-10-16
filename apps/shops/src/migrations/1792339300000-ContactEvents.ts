import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-07: contact taps, partitioned by month so old months can be detached or dropped cheaply.
 * `ensure_contact_partitions(n)` creates this month's and the next n months' partitions; the
 * shops service calls it at start and daily, so rows never land in the default partition (which
 * only catches a clock that runs far ahead).
 */
export class ContactEvents1792339300000 implements MigrationInterface {
  name = 'ContactEvents1792339300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "shops"."contact_event" (
         "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "shop_id" uuid NOT NULL,
         "branch_id" uuid,
         "product_id" uuid,
         "channel" text NOT NULL,
         "user_id" uuid,
         "session_id" text NOT NULL,
         "source_page" text,
         CONSTRAINT "contact_event_channel_chk" CHECK (channel IN ('whatsapp', 'call', 'email')),
         CONSTRAINT "PK_contact_event" PRIMARY KEY ("id", "created_at")
       ) PARTITION BY RANGE ("created_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "shops"."contact_event_default" PARTITION OF "shops"."contact_event" DEFAULT`,
    );
    await queryRunner.query(
      `CREATE INDEX "contact_event_shop_idx" ON "shops"."contact_event" ("shop_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "contact_event_dedup_idx" ON "shops"."contact_event" ("session_id", "shop_id", "channel", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "contact_event_user_idx" ON "shops"."contact_event" ("user_id") WHERE user_id IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE FUNCTION shops.ensure_contact_partitions(p_months int) RETURNS int
      LANGUAGE plpgsql AS $fn$
      DECLARE
        first date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
        made int := 0;
        m date;
        name text;
      BEGIN
        FOR i IN 0..p_months LOOP
          m := (first + make_interval(months => i))::date;
          name := 'contact_event_' || to_char(m, 'YYYY_MM');
          IF to_regclass('shops.' || name) IS NULL THEN
            EXECUTE format(
              'CREATE TABLE shops.%I PARTITION OF shops.contact_event FOR VALUES FROM (%L) TO (%L)',
              name, (m::timestamp AT TIME ZONE 'UTC'),
              ((m + interval '1 month')::timestamp AT TIME ZONE 'UTC'));
            made := made + 1;
          END IF;
        END LOOP;
        RETURN made;
      END
      $fn$`);
    await queryRunner.query(`SELECT shops.ensure_contact_partitions(3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION shops.ensure_contact_partitions(int)`);
    await queryRunner.query(`DROP TABLE "shops"."contact_event"`);
  }
}
