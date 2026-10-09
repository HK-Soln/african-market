import { QueryRunner } from 'typeorm';

/**
 * Shared DDL for each service's first migration: its schema, the extensions it needs,
 * and the outbox / processed_event tables. Extensions are created IF NOT EXISTS so the
 * migration works on RDS as well as the local docker image.
 */
export async function createServiceSchema(
  queryRunner: QueryRunner,
  schema: string,
  extensions: Array<'postgis' | 'pg_trgm' | 'unaccent' | 'citext'> = [],
): Promise<void> {
  for (const ext of extensions)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS ${ext} WITH SCHEMA public`);
  await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"."outbox" (
      "id" uuid PRIMARY KEY,
      "name" text NOT NULL,
      "envelope" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "published_at" timestamptz,
      "attempts" int NOT NULL DEFAULT 0
    )`);
  await queryRunner.query(
    `CREATE INDEX IF NOT EXISTS "outbox_unpublished_idx" ON "${schema}"."outbox" ("created_at") WHERE published_at IS NULL`,
  );
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"."processed_event" (
      "event_id" uuid NOT NULL,
      "consumer" text NOT NULL,
      "processed_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("event_id", "consumer")
    )`);
}

export async function dropServiceSchema(queryRunner: QueryRunner, schema: string): Promise<void> {
  await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}
