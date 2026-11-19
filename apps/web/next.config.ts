import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { parseServerEnv } from './src/env.schema';

// Fails the build (and `next dev`) with every bad variable listed.
const env = parseServerEnv(process.env);

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Off: the per-request nonce CSP cannot coexist with Partial Prerendering, pages
  // depend on the session and on trip visibility, and a prerendered public trip
  // page could outlive the trip being made private.
  cacheComponents: false,
  partialPrefetching: false,

  // E2E builds (test hooks on) get their own output, so a run never serves or
  // clobbers the regular build.
  distDir: env.NEXT_PUBLIC_E2E ? '.next-e2e' : '.next',

  // The monorepo root: Turbopack must be able to read packages/shared.
  turbopack: {
    root: path.join(import.meta.dirname, '../..'),
    // Keeps MapLibre's development builds out of the output (see the loader).
    rules: {
      '*.mjs': {
        condition: { path: /maplibre-gl\/dist\/maplibre-gl\.mjs$/ },
        loaders: [path.join(import.meta.dirname, 'scripts/maplibre-url-loader.mjs')],
      },
    },
  },

  // The browser only talks to this origin; /api/* is forwarded to the NestJS API.
  rewrites() {
    return [{ source: '/api/:path*', destination: `${env.API_URL}/api/:path*` }];
  },
};

export default withNextIntl(nextConfig);
