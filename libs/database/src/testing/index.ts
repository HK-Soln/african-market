import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { createCliDataSource, type ServiceDataSourceConfig } from '../data-source';

// Test support only: import from '@am/database/testing', never from service code. The
// `testcontainers` package is a dev dependency and is loaded only when a container is needed.

/** The image production-like tests run on; the same one docker compose and CI use. */
export const POSTGIS_IMAGE = 'postgis/postgis:16-3.4';

/** Set by `startPostgis` (or by you, to point tests at a server that is already running). */
export const TEST_DATABASE_URL = 'TEST_DATABASE_URL';

export interface PostgisServer {
  /** Connection URL of the server's default database. */
  url: string;
  stop(): Promise<void>;
}

/**
 * Starts a PostgreSQL + PostGIS container and waits until it accepts connections. Call it once
 * per test run from Jest's `globalSetup` (see `jestGlobalSetup`), not once per test file.
 */
export async function startPostgis(): Promise<PostgisServer> {
  const { GenericContainer, Wait } = await import('testcontainers');
  const container = await new GenericContainer(POSTGIS_IMAGE)
    .withEnvironment({ POSTGRES_USER: 'am', POSTGRES_PASSWORD: 'am', POSTGRES_DB: 'am_test' })
    .withExposedPorts(5432)
    // Postgres restarts once while initialising; the second "ready" is the one that lasts.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(120_000)
    .start();
  return {
    url: `postgres://am:am@${container.getHost()}:${container.getMappedPort(5432)}/am_test`,
    stop: async () => {
      await container.stop();
    },
  };
}

declare global {
  // Lives on the Jest parent process between globalSetup and globalTeardown.
  var __amTestPostgis: PostgisServer | undefined;
}

/**
 * Jest `globalSetup`: one PostGIS container for the whole run, its URL handed to every worker
 * through the environment. Does nothing when `TEST_DATABASE_URL` is already set, so a developer
 * can reuse the database from `pnpm infra:up` and skip the container start.
 */
export async function jestGlobalSetup(): Promise<void> {
  if (process.env[TEST_DATABASE_URL]) return;
  const server = await startPostgis();
  globalThis.__amTestPostgis = server;
  process.env[TEST_DATABASE_URL] = server.url;
}

/** Jest `globalTeardown`: stops the container `jestGlobalSetup` started, if it started one. */
export async function jestGlobalTeardown(): Promise<void> {
  await globalThis.__amTestPostgis?.stop();
  globalThis.__amTestPostgis = undefined;
}

export interface TestDatabaseOptions extends Omit<ServiceDataSourceConfig, 'url' | 'migrations'> {
  /** The service's real migration classes, in order. They are run before the tests see the db. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrations?: any[];
  /** Extra DDL for tests of shared code that has no migrations of its own. */
  setup?: (runner: QueryRunner) => Promise<void>;
}

export interface TestDatabase {
  /** Connected to a database of its own, with the service's schema migrated. */
  db: DataSource;
  url: string;
  /** Closes the connection and drops the database. Call it in `afterAll`. */
  drop(): Promise<void>;
}

let ownServer: Promise<PostgisServer> | undefined;

/** The server to create databases on: the shared one, or one started here as a fallback. */
async function serverUrl(): Promise<string> {
  const shared = process.env[TEST_DATABASE_URL];
  if (shared) return shared;
  // No globalSetup: this test file pays for its own container.
  ownServer ??= startPostgis();
  return (await ownServer).url;
}

/**
 * A throwaway database on real PostgreSQL + PostGIS with a service's migrations applied, so
 * constraints, indexes and geo queries behave as they will in production. Each call gets its own
 * database; test files cannot see each other's rows.
 */
export async function createTestDatabase(options: TestDatabaseOptions): Promise<TestDatabase> {
  const { migrations = [], setup, ...config } = options;
  const base = await serverUrl();
  const name = `am_test_${config.schema}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const admin = await new DataSource({ type: 'postgres', url: base }).initialize();
  await admin.query(`CREATE DATABASE "${name}"`);

  const target = new URL(base);
  target.pathname = `/${name}`;
  const url = target.toString();

  // The CLI data source, as `migration:run` uses it: it creates the schema on an empty database.
  const db = await createCliDataSource({ ...config, url, migrations }).initialize();
  if (migrations.length > 0) await db.runMigrations();
  if (setup) {
    const runner = db.createQueryRunner();
    try {
      await setup(runner);
    } finally {
      await runner.release();
    }
  }

  return {
    db,
    url,
    async drop() {
      await db.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.destroy();
      if (ownServer) {
        await (await ownServer).stop();
        ownServer = undefined;
      }
    },
  };
}
