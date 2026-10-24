import 'reflect-metadata';
import { createTestDatabase as createDatabase, type TestDatabase } from '@am/database/testing';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { Catalogue1792166400000 } from '../../src/migrations/1792166400000-Catalogue';
import { ProductReports1792900000000 } from '../../src/migrations/1792900000000-ProductReports';

export type { TestDatabase };

/** A throwaway database with the catalog service's real migrations (and seed) applied. */
export const createTestDatabase = (): Promise<TestDatabase> =>
  createDatabase({
    ...dataSourceConfig,
    migrations: [Init1791504000000, Catalogue1792166400000, ProductReports1792900000000],
  });
