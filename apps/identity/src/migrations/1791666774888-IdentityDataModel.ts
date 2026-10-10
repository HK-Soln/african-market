import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F0-02: user, credential, otp_challenge, session, shop_member and address.
 * Generated from the entities; the two extensions were added by hand so the migration does not
 * depend on TypeORM installing them when it connects.
 */
export class IdentityDataModel1791666774888 implements MigrationInterface {
  name = 'IdentityDataModel1791666774888';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public`);
    await queryRunner.query(
      `CREATE TABLE "identity"."user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "phone" text, "email" citext, "name" text, "preferred_language" text NOT NULL DEFAULT 'en', "avatar_media_id" uuid, "roles" text array NOT NULL DEFAULT '{customer}', "status" text NOT NULL DEFAULT 'active', "phone_verified_at" TIMESTAMP WITH TIME ZONE, "email_verified_at" TIMESTAMP WITH TIME ZONE, "marketing_consent_at" TIMESTAMP WITH TIME ZONE, "terms_accepted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "user_roles_chk" CHECK (roles <@ ARRAY['customer', 'seller', 'admin']::text[]), CONSTRAINT "user_preferred_language_chk" CHECK (preferred_language IN ('en', 'ar', 'fr')), CONSTRAINT "user_status_chk" CHECK (status IN ('active', 'suspended', 'deleted')), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "user_email_uq" ON "identity"."user" ("email") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "user_phone_uq" ON "identity"."user" ("phone") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."address" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid NOT NULL, "label" text, "emirate" text NOT NULL, "area" text, "building" text, "flat" text, "makani" text, "location" geography(Point,4326), "notes" text, CONSTRAINT "address_emirate_chk" CHECK (emirate IN ('DXB', 'AUH', 'SHJ', 'AJM', 'UAQ', 'RAK', 'FUJ')), CONSTRAINT "PK_d92de1f82754668b5f5f5dd4fd5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "address_location_idx" ON "identity"."address" USING GiST ("location") `,
    );
    await queryRunner.query(`CREATE INDEX "address_user_idx" ON "identity"."address" ("user_id") `);
    await queryRunner.query(
      `CREATE TABLE "identity"."credential" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid NOT NULL, "type" text NOT NULL, "secret_hash" text, "provider_subject" text, CONSTRAINT "credential_secret_chk" CHECK ((type = 'password' AND secret_hash IS NOT NULL AND provider_subject IS NULL) OR (type <> 'password' AND provider_subject IS NOT NULL AND secret_hash IS NULL)), CONSTRAINT "credential_type_chk" CHECK (type IN ('password', 'google', 'apple')), CONSTRAINT "PK_3a5169bcd3d5463cefeec78be82" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "credential_user_type_uq" ON "identity"."credential" ("user_id", "type") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "credential_provider_subject_uq" ON "identity"."credential" ("type", "provider_subject") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."otp_challenge" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "target" citext NOT NULL, "channel" text NOT NULL, "purpose" text NOT NULL, "code_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "consumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "otp_challenge_attempts_chk" CHECK (attempts >= 0), CONSTRAINT "otp_challenge_purpose_chk" CHECK (purpose IN ('signup', 'login', 'verify')), CONSTRAINT "otp_challenge_channel_chk" CHECK (channel IN ('sms', 'whatsapp', 'email')), CONSTRAINT "PK_200fe6e81812616e7f97690cb21" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "otp_challenge_target_idx" ON "identity"."otp_challenge" ("target", "purpose", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid NOT NULL, "family_id" uuid NOT NULL, "refresh_token_hash" text NOT NULL, "user_agent" text, "ip" inet, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by" uuid, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "session_user_idx" ON "identity"."session" ("user_id") `);
    await queryRunner.query(
      `CREATE INDEX "session_family_idx" ON "identity"."session" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "session_refresh_token_hash_uq" ON "identity"."session" ("refresh_token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."shop_member" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "role" text NOT NULL, "branch_ids" uuid array NOT NULL DEFAULT '{}', CONSTRAINT "shop_member_role_chk" CHECK (role IN ('owner', 'manager', 'staff')), CONSTRAINT "PK_13a5839048b337da48796cdf4cb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "shop_member_shop_idx" ON "identity"."shop_member" ("shop_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "shop_member_user_shop_uq" ON "identity"."shop_member" ("user_id", "shop_id") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."address" ADD CONSTRAINT "FK_35cd6c3fafec0bb5d072e24ea20" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" ADD CONSTRAINT "FK_f462968b424cfa19b629109b6f3" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."session" ADD CONSTRAINT "FK_30e98e8746699fb9af235410aff" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."shop_member" ADD CONSTRAINT "FK_312d1dcc17ec26ca49bd911c91e" FOREIGN KEY ("user_id") REFERENCES "identity"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."shop_member" DROP CONSTRAINT "FK_312d1dcc17ec26ca49bd911c91e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."session" DROP CONSTRAINT "FK_30e98e8746699fb9af235410aff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."credential" DROP CONSTRAINT "FK_f462968b424cfa19b629109b6f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."address" DROP CONSTRAINT "FK_35cd6c3fafec0bb5d072e24ea20"`,
    );
    await queryRunner.query(`DROP INDEX "identity"."shop_member_user_shop_uq"`);
    await queryRunner.query(`DROP INDEX "identity"."shop_member_shop_idx"`);
    await queryRunner.query(`DROP TABLE "identity"."shop_member"`);
    await queryRunner.query(`DROP INDEX "identity"."session_refresh_token_hash_uq"`);
    await queryRunner.query(`DROP INDEX "identity"."session_family_idx"`);
    await queryRunner.query(`DROP INDEX "identity"."session_user_idx"`);
    await queryRunner.query(`DROP TABLE "identity"."session"`);
    await queryRunner.query(`DROP INDEX "identity"."otp_challenge_target_idx"`);
    await queryRunner.query(`DROP TABLE "identity"."otp_challenge"`);
    await queryRunner.query(`DROP INDEX "identity"."credential_provider_subject_uq"`);
    await queryRunner.query(`DROP INDEX "identity"."credential_user_type_uq"`);
    await queryRunner.query(`DROP TABLE "identity"."credential"`);
    await queryRunner.query(`DROP INDEX "identity"."address_user_idx"`);
    await queryRunner.query(`DROP INDEX "identity"."address_location_idx"`);
    await queryRunner.query(`DROP TABLE "identity"."address"`);
    await queryRunner.query(`DROP INDEX "identity"."user_phone_uq"`);
    await queryRunner.query(`DROP INDEX "identity"."user_email_uq"`);
    await queryRunner.query(`DROP TABLE "identity"."user"`);
  }
}
