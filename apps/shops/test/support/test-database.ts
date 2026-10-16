import 'reflect-metadata';
import { createTestDatabase as createDatabase, type TestDatabase } from '@am/database/testing';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { ShopsAndBranches1792153253703 } from '../../src/migrations/1792153253703-ShopsAndBranches';
import { SellerVerification1792158369273 } from '../../src/migrations/1792158369273-SellerVerification';
import { ContactEvents1792339300000 } from '../../src/migrations/1792339300000-ContactEvents';

export type { TestDatabase };

/** A throwaway PostGIS database with the shops service's real migrations applied. */
export const createTestDatabase = (): Promise<TestDatabase> =>
  createDatabase({
    ...dataSourceConfig,
    migrations: [
      Init1791504000000,
      ShopsAndBranches1792153253703,
      SellerVerification1792158369273,
      ContactEvents1792339300000,
    ],
  });
