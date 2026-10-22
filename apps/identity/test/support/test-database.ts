import 'reflect-metadata';
import { createTestDatabase as createDatabase, type TestDatabase } from '@am/database/testing';
import { dataSourceConfig } from '../../src/data-source';
import { Init1791504000000 } from '../../src/migrations/1791504000000-init';
import { IdentityDataModel1791666774888 } from '../../src/migrations/1791666774888-IdentityDataModel';
import { OtpResetPurpose1791720000000 } from '../../src/migrations/1791720000000-OtpResetPurpose';
import { UserHomeEmirate1791800000000 } from '../../src/migrations/1791800000000-UserHomeEmirate';
import { Countries1791900000000 } from '../../src/migrations/1791900000000-Countries';
import { PrivacyBasics1792000000000 } from '../../src/migrations/1792000000000-PrivacyBasics';
import { FacebookCredential1792512000000 } from '../../src/migrations/1792512000000-FacebookCredential';
import { AdminAudit1792600000000 } from '../../src/migrations/1792600000000-AdminAudit';

export type { TestDatabase };

/** A throwaway PostGIS database with identity's real migrations applied. */
export const createTestDatabase = (): Promise<TestDatabase> =>
  createDatabase({
    ...dataSourceConfig,
    migrations: [
      Init1791504000000,
      IdentityDataModel1791666774888,
      OtpResetPurpose1791720000000,
      UserHomeEmirate1791800000000,
      Countries1791900000000,
      PrivacyBasics1792000000000,
      FacebookCredential1792512000000,
      AdminAudit1792600000000,
    ],
  });
