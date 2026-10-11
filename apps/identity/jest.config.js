/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  // Integration tests hash passwords and talk to Postgres, Redis and Mailpit; on a busy machine
  // (CI, or a parallel build) Jest's default 5 seconds is too tight.
  testTimeout: 30_000,
  // Starts one PostGIS container for the run (Testcontainers) unless TEST_DATABASE_URL is set.
  globalSetup: '<rootDir>/test/support/global-setup.ts',
  globalTeardown: '<rootDir>/test/support/global-teardown.ts',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
};
