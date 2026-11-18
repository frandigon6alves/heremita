# Heremita

Plan your own trip: places on a map with your notes, a day-by-day itinerary, routes between the stops, and opinions from other travellers. Mobile first.

| Workspace         | What it is                                                    | Port |
| ----------------- | ------------------------------------------------------------- | ---- |
| `apps/web`        | Next.js (App Router, React 19), MapLibre GL JS + OpenFreeMap  | 3100 |
| `apps/api`        | NestJS REST API under `/api/v1`, Prisma 7, PostgreSQL         | 3101 |
| `packages/shared` | `@heremita/shared`: zod schemas and types shared by both apps | -    |

PostgreSQL runs in Docker on host port **5434** (databases `heremita` and `heremita_test`).

## Requirements

- Node.js 24 (`.node-version`) and pnpm 11 (`corepack enable` picks the version in `package.json`).
- Docker Desktop with Compose.

No API keys or third-party accounts are needed.

## First run

```sh
pnpm install
pnpm env:init        # creates apps/*/.env from the .env.example files (never overwrites)
pnpm db:up           # starts PostgreSQL and waits until it is healthy
pnpm db:migrate      # applies the migrations to the dev database
pnpm db:seed         # optional development data
pnpm dev             # shared (tsc --watch) + api (nest --watch) + web (next dev)
```

Open http://localhost:3100. The browser only talks to the web origin; Next.js forwards `/api/*` to the API (`API_URL` in `apps/web/.env`).

## Commands

| Command                  | What it does                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `pnpm dev`               | All three workspaces in watch mode, output prefixed by workspace                  |
| `pnpm build`             | Production builds (shared, then api and web)                                      |
| `pnpm typecheck`         | `tsc --noEmit` in every workspace                                                 |
| `pnpm lint`              | ESLint (one root config) in every workspace                                       |
| `pnpm test`              | Vitest in every workspace; the API integration tests need `pnpm db:up`            |
| `pnpm e2e`               | Playwright smoke test (mobile Chromium); starts or reuses the api and web servers |
| `pnpm e2e:install`       | Downloads the Playwright Chromium build (once per machine)                        |
| `pnpm format`            | Prettier (one root config) on the whole repository                                |
| `pnpm db:up` / `db:down` | Start / stop PostgreSQL (`db:down` keeps the data volume)                         |
| `pnpm db:migrate`        | `prisma migrate dev`: create and apply migrations on the dev database             |
| `pnpm db:seed`           | Run `apps/api/prisma/seed.ts`                                                     |
| `pnpm db:reset`          | Drop the dev database, re-apply every migration, run the seed                     |

Production mode, after `pnpm build`: `pnpm --filter @heremita/api start` and `pnpm --filter @heremita/web start`.

## Health

- `GET /api/v1/health`: liveness, checks nothing external.
- `GET /api/v1/health/ready`: `{ "status": "ok", "db": "up" }` once the database answers `SELECT 1`; otherwise 503 with an `application/problem+json` body.

## Tests and the database

`pnpm test` in `apps/api` rebuilds the template database `heremita_test` from the migrations once per run. Every test file that needs the database clones it (`CREATE DATABASE … TEMPLATE heremita_test`) and drops its copy at the end, so test files run in parallel without sharing rows.
