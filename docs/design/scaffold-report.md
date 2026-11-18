# Heremita monorepo skeleton: scaffold report

Status: DONE, verified except `pnpm db:reset` (blocked by Prisma's AI-agent guard, see 7.1). 2026-11-18.
Project: `/Users/frangoncalves/Desktop/DEV/heremita` (uncommitted; no commits). Three engineers in a row worked on this; this file is the final state.

Left running: only the `heremita-postgres-1` container (`127.0.0.1:5434->5432`, healthy). Ports 3100 and 3101: nothing listening at the end (`lsof -nP -iTCP:3100 -iTCP:3101 -sTCP:LISTEN` exit 1). Untouched: 3000 (another node process) and 5433 (another project's container).

## 1. Versions installed (from `pnpm-lock.yaml`)

| Package | Version | Note |
|---|---|---|
| Node / pnpm | 24.15.0 / 11.1.1 | `.node-version`, `packageManager` |
| next, eslint-config-next | 16.4.6 | Turbopack in dev and build |
| react, react-dom | 19.3.1 | |
| typescript | **6.0.3** | not 7.0.2, see 7.4 |
| zod | 4.6.7 | catalog |
| vitest | **5.1.0** | not 5.1.1, see 7.5 |
| vite / @vitejs/plugin-react | 8.3.8 / 6.3.0 | |
| @nestjs/core, common, platform-express, testing | 12.5.1 | express 5.3.0 |
| @nestjs/cli | 12.0.13 | production build only (`nest build`) |
| prisma, @prisma/client, @prisma/adapter-pg | 7.10.1 | newest stable; CLI advertises 8.0.0-rc.34 (prerelease, not used) |
| pg | 8.23.1 | |
| maplibre-gl | 6.19.0 | |
| @tanstack/react-query | 5.108.0 | |
| @playwright/test | 1.65.1 | Chromium build 1255 + headless shell |
| @testing-library/react, jsdom | 16.3.3, 31.0.1 | |
| eslint, typescript-eslint, prettier | 10.15.0, 8.73.0, 3.10.1 | |
| supertest, tsx | 7.3.2, 4.23.15 | |
| @types/node | 24.19.2 | catalog |
| PostgreSQL | 18.7 (image `postgres:18`) | newest stable major; 19 is only rc |

## 2. Layout and root tooling

- `package.json` (private, `packageManager: pnpm@11.1.1`, `engines.node >=24`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, catalog, `allowBuilds` for `@prisma/engines`, `esbuild`, `prisma`), `.node-version`, strict `tsconfig.base.json`, one `eslint.config.mjs`, one `.prettierrc.json` + `.prettierignore`, `.editorconfig`, `.gitignore`, `README.md`.
- Root scripts: `dev`, `build`, `build:shared`, `typecheck`, `lint`, `test`, `format`, `format:check`, `env:init`, `db:up`, `db:down`, `db:migrate`, `db:seed`, `db:reset`, `e2e`, `e2e:install`. Fan-out with `pnpm --recursive` (topological order, so shared builds first); `dev` uses `--parallel`, output prefixed `packages/shared dev:`, `apps/api dev:`, `apps/web dev:`.
- `docker-compose.yml`: project `heremita`, `postgres:18`, `127.0.0.1:5434:5432`, healthcheck over TCP (`pg_isready --host=127.0.0.1`, so the init-time socket-only server never counts as healthy), named volume `postgres-data` mounted at `/var/lib/postgresql` (PG 18 image layout), `docker/postgres/init/01-create-test-database.sql` creates `heremita_test`.
- `scripts/init-env.mjs`: copies each `apps|packages/*/.env.example` to `.env`, never overwrites (verified twice: `created ...` then `kept ...`).
- `apps/web/AGENTS.md` is written by `next dev` 16.4 (`agentRules` default true). Kept on purpose: it points agents at the version-matched docs in `node_modules/next/dist/docs/`, which helps every later engineer on this team. Disable with `agentRules: false` if the owner prefers.

## 3. Module strategy for `@heremita/shared`

- Compiled package: `tsc -p tsconfig.build.json` emits ESM `dist/*.js` + `.d.ts` + maps; `exports["."] = { types: ./dist/index.d.ts, default: ./dist/index.js }`. Both apps consume it like any npm package (`workspace:*`). Works in Node (API, NodeNext resolution), Next/Turbopack (`turbopack.root` = monorepo root), Vitest and production builds with no special config.
- Root `typecheck`, `lint`, `test`, `dev`, `e2e` first run `build:shared`, so a fresh clone works.
- Dev: shared runs `tsc --watch`. Web (Turbopack) picks up `dist` changes. API dev was changed (see 7.2) to `tsc --watch` + `node --watch-path=dist --watch-path=../../packages/shared/dist`, so any emitted JS change in shared restarts the API, even one that leaves the `.d.ts` unchanged.
- Sample schema consumed by both apps: `readinessResponseSchema` / `ReadinessResponse` (API controller return type, web query type) plus `problemDetailsSchema` (web parses error bodies with it), `API_PREFIX`, `APP_NAME` (both apps use them at runtime).

## 4. API (NestJS) notes

- Global prefix `/api/v1` (from `API_PREFIX`), port from env (default 3101), env validated with zod at boot. Verified fail fast: `env -i PATH=$PATH PORT=abc node dist/main.js` printed
  `Invalid environment variables:` / `- PORT: Invalid input: expected number, received NaN` / `- DATABASE_URL: must be a PostgreSQL connection URL (...)` / `Fix them in apps/api/.env ...`, exit 1.
- `.env` loading: dev and start use `node --env-file-if-exists=.env` (process env wins); Prisma config and the Vitest config call `process.loadEnvFile('.env')` if it exists.
- `GET /api/v1/health` liveness `{status:'ok'}` (no DB). `GET /api/v1/health/ready` runs `SELECT 1` through Prisma: `{status:'ok', db:'up'}`, or 503 problem+json (`detail: 'The database is not reachable.'`). All errors go through an RFC 9457 exception filter.
- Prisma 7: `prisma-client` generator to `src/generated/prisma`, driver adapter `@prisma/adapter-pg`, `PrismaService` with shutdown hook. Placeholder model `Placeholder` (`placeholders`: uuid id, name, created_at timestamptz). Migration `prisma/migrations/20261118144214_init`. Seed `prisma/seed.ts` -> `seed-database.ts` (idempotent; tested).
- Graceful shutdown: `enableShutdownHooks(['SIGTERM','SIGINT'], { useProcessExit: true })` + 10 s deadline timer. Verified: SIGTERM to the production API process stopped it and freed 3101 (no forced-exit log line).
- Scripts: `dev` (watch, see 3), `build` (`prisma generate && nest build`, deleteOutDir), `start` (`node --enable-source-maps --env-file-if-exists=.env dist/main.js`).

## 5. Web (Next.js) notes

- Port 3100; `rewrites()` sends `/api/:path*` to `API_URL` (default `http://localhost:3101`). `rewrites` is now a plain function (7.3).
- Home page (Server Component) renders `APP_NAME`, `<HealthStatus/>` (client, TanStack Query, `readinessQueryOptions` -> `/api/v1/health/ready`; non-2xx bodies parsed with `problemDetailsSchema` into `ApiProblemError`) and `<TripMap/>` (`next/dynamic` with `ssr:false` -> `MapView`, MapLibre with `https://tiles.openfreemap.org/styles/liberty`, `setWorkerUrl` to the bundled worker).
- QueryClient (`src/lib/api/query-client.ts`): `staleTime` 30 s, queries retried at most once and only on network errors (`TypeError` from `fetch`), mutations `retry: false` (lead decision 9). `failureCount` is 0 on the first failure (read in `@tanstack/query-core/build/modern/retryer.js`).
- Tests: Vitest + RTL + jest-dom: `health-status.test.tsx` (4 cases: ok, 503 problem, network failure, error without problem body) and `query-client.test.ts` (retry policy). Playwright: one project `mobile-chromium` (Pixel 7), `webServer` for api and web with `reuseExistingServer` locally; with `CI` set it builds and runs production servers.
- Plain CSS in `globals.css`, mobile first (`100dvh` grid). Design tokens are for the design team later.

## 6. Database, Prisma and test-database isolation

- Dev DB `heremita`, test template `heremita_test` (`TEST_DATABASE_URL`, must end in `_test` or the tests refuse to run).
- Vitest `projects`: `unit` (`src/**/*.test.ts`) and `integration` (`test/**/*.test.ts`, `globalSetup`). The global setup runs once per run: drops leftover `heremita_test_*` copies, drops/recreates the template and runs `prisma migrate deploy` on it.
- Each integration test file calls `createTestDatabase()`: `CREATE DATABASE heremita_test_<12 hex> TEMPLATE heremita_test` (~50-65 ms measured), and drops it `WITH (FORCE)` in `afterAll`. Files never share rows, so Vitest's default file parallelism (one forked worker per file) is safe.
- Concurrency proof: two temporary test files, each creating its database and polling until it saw another `heremita_test_*` database. Output:
  `PROOF pid=33117 own=heremita_test_0b49f2db4a02 others=heremita_test_bf02b92dd6cf`
  `PROOF pid=33118 own=heremita_test_bf02b92dd6cf others=heremita_test_0b49f2db4a02`
  `Test Files  2 passed (2)`. Different pids, each saw the other's live database. The temporary files were deleted after the run. (With the two real files, a pg_database poll showed no overlap only because each file lives ~100 ms; the barrier test removes that doubt.)
- Limitation: two simultaneous `vitest` runs against the same server are not supported (the global setup recreates the template).

## 7. Problems met (literal messages and fixes)

7.1 `pnpm db:reset` refused by Prisma 7.10.1 when run by an agent:
`As an AI agent, you are forbidden from performing this action without an explicit consent and review by the user. You must stop at this point and respond to the user ...` (it wants `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set to the user's consent message). Not bypassed and not re-implemented around the guard. The owner must run it once by hand. The script is now `prisma migrate reset --force && prisma db seed`: Prisma 7's `migrate dev` output shows no seeding step, and `migrate reset --help` mentions no seed, so the seed is run explicitly (it is idempotent, so a double run is harmless).

7.2 Shared change not reaching the API in dev. With `nest start --watch`, a change that alters only shared's emitted JS (probe: `z.int().min(400)` -> `min(399)`; `dist/problem.js` had 399, `dist/problem.d.ts` unchanged) recompiled shared (`File change detected. Starting incremental compilation...`) but Nest neither recompiled nor restarted: its TypeScript watch program only watches the `.d.ts` of dependencies, so the API would keep running stale shared code. Fix: API `dev` = `tsc -p tsconfig.build.json && pnpm run --parallel "/^dev:/"`, `dev:compile` = `tsc --watch`, `dev:serve` = `node --watch-path=dist --watch-path=../../packages/shared/dist --watch-preserve-output --enable-source-maps --env-file-if-exists=.env dist/main.js`. Re-probed: JS-only change -> `dev:serve: Restarting 'dist/main.js'` and new pid; APP_NAME change -> `[Bootstrap] HeremitaProbe API listening ...` and web `<h1 class="home__title">HeremitaProbe<`; API source change -> restart. A change may cause two quick restarts (shared emit, then API re-emit); harmless. All probes reverted and checked with grep.

7.3 `pnpm lint` failures inherited from predecessor 1:
- `@typescript-eslint/require-await` on `async rewrites()`: Next 16's type is `rewrites?: () => Promise<...> | Rewrite[] | {...}`, so the function now returns the array synchronously.
- react-hooks "Calling setState synchronously within an effect" in `map-view.tsx`: WebGL 2 support is now checked once in a lazy `useState(browserSupportsWebGL2)` initializer (the component is client-only), the unsupported case renders the alert without an effect, and the effect only creates the map, sets `loaded` from the map's `load` event, and calls `map.remove()` in cleanup. No rule disabled.
- Also fixed: `Pages directory cannot be found at . If using a custom path, please configure with the no-html-link-for-pages rule in your eslint config file.` `settings.next.rootDir: 'apps/web/'` was relative to each workspace's cwd; now `path.join(import.meta.dirname, 'apps/web')`.

7.4 TypeScript 6.0.3, not 7.0.2 (kept from predecessor 1, evidence re-read): `nest build` -> `Error  The installed TypeScript version (7.0.2) does not expose the programmatic compiler API that the Nest CLI requires. TypeScript 7.0 ships the "tsc" executable only; the compiler API is expected to return in 7.1.`; ESLint -> `Error: typescript-eslint does not support TS 7.0.` Revisit when 7.1 ships.

7.5 vitest 5.1.0, not 5.1.1 (kept): on 2026-11-18 5.1.1 was 6.9 h old (`2026-11-18T07:35:25Z`), younger than pnpm 11's default 24 h `minimumReleaseAge`. Pinned exactly in the catalog. Can move to 5.1.1 from 2026-11-19.

7.6 Prisma config file name: kept `apps/api/prisma7.config.ts`. In `@prisma/config` 7.10.1 the CLI looks first for `PRISMA7_CONFIG_FILE_CANDIDATES` (`prisma7.config.{js,ts,mjs,cjs,mts,cts}`, `.config/prisma7.*`) and then for `LEGACY_CONFIG_FILE_CANDIDATES` (`prisma.config.*`). `prisma init` in 7.10.1 writes `prisma7.config.ts`, and the CLI's completion lists it as "Default config path". Measured: both names load (`Loaded Prisma config from prisma.config.ts.` / `... from prisma7.config.ts.`), so `prisma7.config.ts` is the conventional name for this version, not an accident.

7.7 Fixed by predecessor 2 (recorded for completeness): `.env.example` pointed at 5433 (now 5434); liveness pinged the DB (now readiness only); API never loaded `.env`; API test lint `@typescript-eslint/no-unsafe-argument` on `request(app.getHttpServer())` (fixed with `INestApplication<App>` from `supertest/types.js`); generated Prisma types stale after `migrate dev` (`db:migrate` now runs `prisma generate` too).

7.8 `pnpm format:check` found 3 unformatted API test files: fixed with `pnpm format`; now `All matched files use Prettier code style!`.

## 8. Commands and verification status

| # | Command | Verified | Decisive output |
|---|---|---|---|
| 1 | remove all 4 `node_modules`, `pnpm install` | yes | `Done in 4.9s using pnpm v11.1.1`, exit 0; no `warn`/`ignored`/`error`/`deprecat` line; build scripts ran: `@prisma/engines postinstall`, `esbuild postinstall`, `prisma preinstall`, `apps/api postinstall` (`✔ Generated Prisma Client (7.10.1)`). One lockfile, one `.git`. |
| 2 | `pnpm typecheck` | yes | exit 0 (shared, api `tsc --noEmit`; web `next typegen && tsc --noEmit`) |
| 2 | `pnpm lint` | yes | exit 0, no warnings |
| 2 | `pnpm test` | yes | shared `Tests 5 passed (5)`, web `Tests 6 passed (6)`, api `Test Files 3 passed (3)` / `Tests 10 passed (10)` |
| 2 | `pnpm build` | yes | exit 0; web `✓ Compiled successfully`, routes `○ /`, `○ /_not-found`; api `prisma generate && nest build` Done |
| 2 | `pnpm format:check` | yes | `All matched files use Prettier code style!` |
| 3 | `pnpm db:up` | yes | `Container heremita-postgres-1 Healthy` |
| 3 | `pnpm db:migrate` | yes | `Already in sync, no schema change or pending migration was found.` + generate |
| 3 | `pnpm db:seed` | yes | `🌱  The seed command has been executed.`; `select name from placeholders` -> `seed` |
| 3 | `pnpm db:reset` | **no** | blocked by Prisma's AI-agent guard (7.1) |
| 3 | `pnpm env:init` | yes (predecessor 2) | `created ...` then `kept ...` |
| 4 | `pnpm dev` + `curl -i http://localhost:3100/api/v1/health/ready` | yes | `HTTP/1.1 200 OK`, `{"status":"ok","db":"up"}`; liveness `{"status":"ok"}` |
| 4 | shared change propagates to both apps | yes (after fix 7.2) | see 7.2 |
| 5 | `pnpm e2e` with dev servers running (reuse) | yes | `✓ 1 [mobile-chromium] › e2e/smoke.spec.ts:3:1 › the home page shows the map and a healthy API (1.7s)`, `1 passed` |
| 5 | `pnpm e2e` with nothing running (Playwright starts both dev servers) | yes | `1 passed (5.2s)`; ports free afterwards |
| 5 | `CI=1 pnpm e2e` (Playwright builds and starts production servers) | yes | `1 passed (8.1s)`; ports free afterwards |
| 6 | `pnpm build`, `NODE_ENV=production pnpm --filter @heremita/api start`, `pnpm --filter @heremita/web start`, curl through the rewrite | yes | `HTTP/1.1 200 OK`, `{"status":"ok","db":"up"}`, h1 `Heremita`; both stopped with SIGTERM, 3100/3101 free |
| - | API env fail-fast | yes | see 4 |

WebGL in headless Chromium: no browser flags were needed. Playwright 1.65.1's default headless Chromium (Pixel 7 profile) reached `data-map-status="ready"`, i.e. WebGL 2 context, worker, the OpenFreeMap style and the first tiles. Check again on CI Linux runners without a GPU (not verified here).

## 9. Not verified / open items

- `pnpm db:reset`: not run to completion (7.1). Owner: run `pnpm db:reset` once and confirm the seed runs (`select name from placeholders` -> `seed`).
- Whether Prisma 7 `migrate reset` seeds on its own: inferred from help text and `migrate dev` output, not proved; the explicit `&& prisma db seed` makes it safe either way.
- E2E needs network access to `tiles.openfreemap.org`; no offline fallback style yet.
- Headless WebGL on Linux CI: not tested (macOS only).
- `pnpm dev` with no `.env` files: API `dev:serve` would fail env validation (by design); run `pnpm env:init` first (README says so).
- Not in scope and not done: OpenAPI generation, design tokens/themes, i18n, error.tsx boundaries. These belong to later tasks.
