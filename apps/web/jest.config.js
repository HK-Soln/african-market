/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  // Unit tests of plain modules (lib/); screens are covered by the Playwright journeys.
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
};
