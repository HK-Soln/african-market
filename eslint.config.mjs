// Flat ESLint config shared by every project. Each package runs `eslint src`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.next-e2e/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
      // Services must never import another service's code; share through libs/* only.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/*', '../../apps/*'],
              message: 'Import shared code from @am/* libs, never from another app.',
            },
          ],
        },
      ],
    },
  },
  {
    // Configuration comes in typed and validated: loadEnv / APP_ENV in the backends (libs/core),
    // src/lib/config.ts in the Next apps. Tests and test helpers may set and read it directly.
    files: ['apps/*/src/**/*.{ts,tsx}', 'libs/*/src/**/*.{ts,tsx}'],
    ignores: [
      'libs/core/src/env.ts',
      'apps/*/src/lib/config.ts',
      'libs/database/src/testing/**',
      '**/*.spec.{ts,tsx}',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through loadEnv / APP_ENV (@am/core), or src/lib/config.ts in a Next app.',
        },
      ],
    },
  },
);
