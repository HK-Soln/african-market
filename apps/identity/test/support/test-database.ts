import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createCliDataSource } from '@am/database';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { IdentityDataModel1791666774888 } from '../../src/migrations/1791666774888-IdentityDataModel';
import { OtpResetPurpose1791720000000 } from '../../src/migrations/1791720000000-OtpResetPurpose';

const baseUrl = process.env.DATABASE_URL ?? 'postgres://am:am@localhost:5432/african_market';

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};

export interface TestDatabase {
  db: DataSource;
  drop(): Promise<void>;
}

/**
 * Creates a throwaway database on the Postgres+PostGIS instance in DATABASE_URL (docker compose
 * locally, a service container in CI) and runs identity's real migrations in it. F0-11 replaces
 * this with the shared Testcontainers helper.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `am_test_identity_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = await new DataSource({ type: 'postgres', url: baseUrl }).initialize();
  await admin.query(`CREATE DATABASE "${name}"`);
  // The CLI data source, as `migration:run` uses it: it creates the schema on an empty database.
  const db = await createCliDataSource({
    ...dataSourceConfig,
    url: withDatabase(baseUrl, name),
    migrations: [Init1791504000000, IdentityDataModel1791666774888, OtpResetPurpose1791720000000],
  }).initialize();
  await db.runMigrations();
  return {
    db,
    async drop() {
      await db.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.destroy();
    },
  };
}
