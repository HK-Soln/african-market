import 'reflect-metadata';
import { createTestDatabase as createDatabase, type TestDatabase } from '@am/database/testing';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { MediaObjects1792148449819 } from '../../src/migrations/1792148449819-MediaObjects';

export type { TestDatabase };

/** A throwaway PostGIS database with media's real migrations applied. */
export const createTestDatabase = (): Promise<TestDatabase> =>
  createDatabase({
    ...dataSourceConfig,
    migrations: [Init1791504000000, MediaObjects1792148449819],
  });
