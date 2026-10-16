import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1-01: media objects (uploads and what became of them) and the log of every look at a private
 * document (decision T-27).
 */
export class MediaObjects1792148449819 implements MigrationInterface {
  name = 'MediaObjects1792148449819';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media"."media_access_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "media_id" uuid NOT NULL, "actor_id" uuid NOT NULL, "correlation_id" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2ce59134173ba36595d53013aab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "media_access_log_media_idx" ON "media"."media_access_log" ("media_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "media"."media_object" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "owner_id" uuid NOT NULL, "purpose" text NOT NULL, "shop_id" uuid, "visibility" text NOT NULL, "status" text NOT NULL DEFAULT 'pending', "declared_type" text NOT NULL, "max_bytes" integer NOT NULL, "upload_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "files" jsonb NOT NULL DEFAULT '{}', "width" integer, "height" integer, "reject_reason" text, "attached_type" text, "attached_id" uuid, "attached_at" TIMESTAMP WITH TIME ZONE, "detached_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "media_object_visibility_chk" CHECK (visibility IN ('public', 'private')), CONSTRAINT "media_object_status_chk" CHECK (status IN ('pending', 'ready', 'rejected', 'deleted')), CONSTRAINT "media_object_purpose_chk" CHECK (purpose IN ('avatar', 'shop_logo', 'shop_gallery', 'product_image', 'trade_license')), CONSTRAINT "PK_3725b4fd7199d43aed6e1bbd5a0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "media_object_status_idx" ON "media"."media_object" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "media_object_attached_idx" ON "media"."media_object" ("attached_type", "attached_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "media_object_owner_idx" ON "media"."media_object" ("owner_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "media"."media_object_owner_idx"`);
    await queryRunner.query(`DROP INDEX "media"."media_object_attached_idx"`);
    await queryRunner.query(`DROP INDEX "media"."media_object_status_idx"`);
    await queryRunner.query(`DROP TABLE "media"."media_object"`);
    await queryRunner.query(`DROP INDEX "media"."media_access_log_media_idx"`);
    await queryRunner.query(`DROP TABLE "media"."media_access_log"`);
  }
}
