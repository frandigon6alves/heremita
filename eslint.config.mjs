// The single ESLint configuration of the monorepo. Every workspace runs
// `eslint .` and finds this file by walking up from the linted file.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import path from 'node:path';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/generated/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/next-env.d.ts',
    // Unported reference code from the provider research; ported in the provider tasks.
    'apps/api/test/fixtures/upstream/**',
  ]),

  js.configs.recommended,

  // TypeScript everywhere, with type-aware rules. The project service picks
  // the nearest tsconfig.json for each file.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Code that runs on Node.js: the API, the shared package, scripts and tool configs.
  {
    files: ['apps/api/**', 'packages/**', 'scripts/**', '**/*.config.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },

  // The web app: Next.js, React, hooks and accessibility rules.
  {
    files: ['apps/web/**'],
    extends: [nextVitals],
    // Absolute: each workspace runs ESLint from its own directory.
    settings: { next: { rootDir: path.join(import.meta.dirname, 'apps/web') } },
  },

  // Logs go through the API logger (JSON on stdout); CLI output uses process.stdout.
  { rules: { 'no-console': 'error' } },
  {
    files: ['apps/web/src/instrumentation.ts'],
    rules: { 'no-console': ['error', { allow: ['error'] }] },
  },

  // No Server Actions: every mutation goes browser -> /api/v1 -> API.
  {
    files: ['apps/web/src/**'],
    rules: {
      'react/no-danger': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "ExpressionStatement[directive='use server']",
          message: 'Server Actions are not used: mutations call the API through /api/v1.',
        },
      ],
    },
  },

  // Time comes from the injected Clock so tests can fix it.
  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/core/clock/system-clock.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Read the time from the injected Clock (CLOCK token), not new Date().',
        },
      ],
    },
  },

  // Must stay last: turns off the rules that would fight with Prettier.
  prettier,
]);
