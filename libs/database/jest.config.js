/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
};
