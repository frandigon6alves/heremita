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
    '**/dist-e2e/**',
    '**/.next/**',
    '**/.next-e2e/**',
    '**/coverage/**',
    '**/generated/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/next-env.d.ts',
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
    files: [
      'apps/api/**',
      'packages/**',
      'scripts/**',
      'apps/web/scripts/**',
      'apps/web/e2e/**',
      '**/*.config.{js,mjs,ts}',
    ],
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

  // Zod stays out of pages without a form: web code reads constants, option lists
  // and API routes from the zod-free subpaths, and schemas only through
  // src/lib/schemas.ts, which turns zod's JIT off first (CSP).
  {
    files: ['apps/web/src/**'],
    ignores: [
      'apps/web/src/lib/schemas.ts',
      'apps/web/src/**/*.test.{ts,tsx}',
      'apps/web/src/**/test-support.{ts,tsx}',
      'apps/web/src/test-utils/**',
      'apps/web/src/shared/map/testing/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@heremita/shared',
              allowTypeImports: true,
              message:
                'Values come from @heremita/shared/plain or /api-routes; schemas from @/lib/schemas.',
            },
          ],
          patterns: [
            { regex: '^zod(/|$)', message: 'zod reaches the web app through @/lib/schemas.' },
          ],
        },
      ],
    },
  },

  // E2E stays hermetic and deterministic (V72): web-first assertions, never fixed sleeps.
  {
    files: ['apps/web/e2e/**'],
    rules: {
      // Playwright fixtures call their callback `use`; it is not React's hook.
      'react-hooks/rules-of-hooks': 'off',
      'no-restricted-properties': [
        'error',
        {
          property: 'waitForTimeout',
          message: 'Wait for a condition (web-first assertion, expect.poll, page.clock) instead.',
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
