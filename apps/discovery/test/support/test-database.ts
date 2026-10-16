import 'reflect-metadata';
import { createTestDatabase as createDatabase, type TestDatabase } from '@am/database/testing';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { SearchReadModel1792252800000 } from '../../src/migrations/1792252800000-SearchReadModel';
import { NearbySearch1792339200000 } from '../../src/migrations/1792339200000-NearbySearch';

export type { TestDatabase };

/** A throwaway PostGIS database with the discovery service's real migrations applied. */
export const createTestDatabase = (): Promise<TestDatabase> =>
  createDatabase({
    ...dataSourceConfig,
    migrations: [Init1791504000000, SearchReadModel1792252800000, NearbySearch1792339200000],
  });
