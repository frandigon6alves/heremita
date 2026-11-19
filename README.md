# Heremita

Plan your own trip: places on a map with your private notes, a day-by-day itinerary you can reorder by touch, a route per day (walk, bike or drive) with distance and time, and reviews and public trips from other travellers. Mobile first, works on desktop. UI in English (the official language) with Spanish and Brazilian Portuguese translations, light and dark themes. Every URL carries its locale (`/en`, `/es`, `/pt-BR`); `/` goes to the visitor's last used locale, else the best `Accept-Language` match, else English.

**Live demo:** https://heremita.vercel.app (web on Vercel, API on Render's free plan, PostgreSQL on Neon). The API sleeps when idle, so the first request after a while can take about a minute.

| Workspace         | What it is                                                                          | Dev port |
| ----------------- | ----------------------------------------------------------------------------------- | -------- |
| `apps/web`        | Next.js 16 (App Router, React 19), MapLibre GL JS, TanStack Query, next-intl, nuqs  | 3100     |
| `apps/api`        | NestJS 12 REST API under `/api/v1`, Prisma 7, PostgreSQL 18                         | 3101     |
| `packages/shared` | `@heremita/shared`: zod 4 schemas, the endpoint table and the generated OpenAPI doc | -        |

`SPEC.md` is the source of truth for behaviour, contracts and decisions (see [Project documents](#project-documents)). This README covers running, testing and operating the project.

## How it fits together

- The browser only talks to the web origin. Next.js rewrites `/api/*` to the API (`API_URL`), so the session cookie stays first-party. Server Components call the API server to server with the visitor's cookie (GET only). Every write goes from the browser to `/api/v1/*`; there are no Server Actions.
- `packages/shared` is the contract. Every request and response shape is a zod schema there; the API validates every input with it, the web types its calls with it, and `packages/shared/openapi.json` is generated from it (served at `GET /api/v1/openapi.json`).
- Sessions are opaque tokens stored hashed in PostgreSQL, in an HttpOnly cookie set by the API. Passwords use Argon2id. There is no e-mail delivery at all.
- Maps use OpenStreetMap data: basemap tiles from OpenFreeMap (VersaTiles as fallback), loaded by the browser; place search through Photon and routes through the FOSSGIS OSRM servers, called only by the API, which caches, throttles and retries them. No API keys, accounts or paid services.

## Requirements

- Node.js 24.15 (`.node-version`) and pnpm 11 (`corepack enable` picks the version pinned in `package.json`).
- Docker with Compose, for PostgreSQL.
- Ports 3100, 3101, 3110, 3111 and 5434 free on localhost.

## First run

```sh
pnpm install
pnpm env:init        # creates apps/*/.env from the .env.example files (never overwrites)
pnpm db:up           # starts PostgreSQL on 127.0.0.1:5434 and waits until it is healthy
pnpm db:migrate      # applies the migrations to the dev database
pnpm db:seed         # demo users, places, public trips and reviews
pnpm dev             # shared (tsc --watch) + api (watch + restart) + web (next dev)
```

Open http://localhost:3100. Sign in as `demo@example.com` with the password in `DEMO_PASSWORD` (`apps/api/.env`, default `heremita-demo-2026`). The seed also creates six other demo users on `example.com` with the same password; `ana@example.com` is a moderator. The demo login uses English, `diego@example.com` and `nuria@example.com` Spanish and `elena@example.com` English; the others use Brazilian Portuguese, so seeded reviews come in all three languages. Demo accounts carry an "Example"/"Ejemplo"/"Exemplo" badge wherever their name is shown. Public demo trips cover Lisboa, Rio de Janeiro, São Paulo, Paris and Barcelona (Núria's two-day plan, with her notes visible only when you sign in as her).

With the default `.env`, search and routing in development call the public Photon and OSRM servers. To work offline or spare them, set `GEOCODING_PROVIDER=fake` and `ROUTING_PROVIDER=fake` in `apps/api/.env`: the fakes answer from a fixed gazetteer of about 70 real places in Lisboa, São Paulo, Rio de Janeiro, Paris and Barcelona.

## Commands

Root commands fan out to every workspace; the ones that need it build `packages/shared` first.

| Command                  | What it does                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm dev`               | All three workspaces in watch mode, output prefixed by workspace                            |
| `pnpm build`             | Production builds (shared, then api and web)                                                |
| `pnpm typecheck`         | `tsc --noEmit` everywhere (web runs `next typegen` first)                                   |
| `pnpm lint`              | ESLint, one root config                                                                     |
| `pnpm test`              | Vitest, one workspace at a time; the API integration tests need `pnpm db:up`                |
| `pnpm format`            | Prettier on the whole repository (`format:check` only checks)                               |
| `pnpm e2e`               | Playwright on mobile and desktop Chromium, with its own production servers and database     |
| `pnpm e2e:webkit`        | The same journeys on mobile WebKit (informative, not part of the gate)                      |
| `pnpm e2e:install`       | Downloads the Playwright Chromium and WebKit builds (once per machine)                      |
| `pnpm shortcuts`         | Prints the ledger of deliberate shortcuts; exits 1 on a malformed marker (see below)        |
| `pnpm budget`            | First-load JS per route of the last `pnpm build` against its budget; a warning, exits 0     |
| `pnpm env:init`          | Creates missing `.env` files from the examples                                              |
| `pnpm db:up` / `db:down` | Start / stop PostgreSQL (`db:down` keeps the data volume)                                   |
| `pnpm db:migrate`        | `prisma migrate dev` + `prisma generate` on the dev database                                |
| `pnpm db:seed`           | Idempotent demo data (refuses to run with `NODE_ENV=production`)                            |
| `pnpm db:reset`          | Drop the dev database, re-apply every migration, seed. **Run by a person only** (see below) |

Workspace commands:

| Command                                                  | What it does                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm --filter @heremita/shared openapi:generate`        | Regenerates `packages/shared/openapi.json` after a contract change              |
| `pnpm --filter @heremita/api cli reset-password <email>` | Owner password reset (see [Owner operations](#owner-operations))                |
| `pnpm --filter @heremita/api test:live`                  | One real request per geocoding provider with the real headers; manual, never CI |
| `pnpm --filter @heremita/api db:deploy`                  | `prisma migrate deploy` (production and e2e; never creates migrations)          |
| `pnpm --filter @heremita/api start`                      | Production API from `dist/` (after `pnpm build`)                                |
| `pnpm --filter @heremita/web start`                      | Production web app on 3100 (after `pnpm build`)                                 |

## Configuration

Both apps validate their environment at start-up and stop with a list of the bad variables; the web app also fails `next build`. `apps/api/.env.example` and `apps/web/.env.example` document every variable with development values. The ones that matter beyond local development:

| Variable                                  | App | Notes                                                                                                                                |
| ----------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | api | Dev: `postgresql://heremita:heremita@localhost:5434/heremita`. The only real secret.                                                 |
| `TEST_DATABASE_URL`                       | api | Test template database; its name must end in `_test`.                                                                                |
| `WEB_ORIGIN`                              | api | Exact web origin; unsafe requests must come from it (CSRF check).                                                                    |
| `PUBLIC_SITE_URL`                         | api | Public site address, sent to the map providers in `User-Agent` and `Referer`. Required in production.                                |
| `COOKIE_SECURE`                           | api | `true` → cookie `__Host-hm_session` + `Secure` (needs HTTPS); `false` → `hm_session`. Default: true only in production.              |
| `SESSION_COOKIE_NAME`                     | web | Must match the API's cookie name (`hm_session` or `__Host-hm_session`).                                                              |
| `TRUST_PROXY`                             | api | Hops allowed to set `X-Forwarded-For` (rate limits key on the client IP). A production proxy must overwrite that header, not append. |
| `GEOCODING_PROVIDER` / `ROUTING_PROVIDER` | api | `photon` / `osrm`, or `fake`. Fakes in a production build are refused unless `ALLOW_FAKE_PROVIDERS=true` (e2e only).                 |
| `PHOTON_URL`, `OSRM_URL`, `NOMINATIM_URL` | api | Provider base URLs; never hard-coded, so a provider can ask us to switch.                                                            |
| `NOMINATIM_ENABLED`                       | api | `false` by default; see [Map and place providers](#map-and-place-providers).                                                         |
| `API_URL`                                 | web | Where `/api/*` is forwarded. Read when the dev server starts and **baked in at build time** for production: change it, then rebuild. |
| `CONTACT_EMAIL`                           | web | Operator contact shown on `/about`; the FOSSGIS terms require one. Required in production. Never commit a real address.              |
| `NEXT_PUBLIC_MAP_STYLE_*`                 | web | Basemap styles (OpenFreeMap light/dark, VersaTiles fallbacks). `NEXT_PUBLIC_*` values are inlined at build time.                     |
| `DEMO_PASSWORD`                           | api | Password the seed gives every demo account (at least 12 characters).                                                                 |

## Tests

| Level                | Where                                    | What                                                                                                   |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Shared unit          | `packages/shared/src/**/*.test.ts`       | Schemas, endpoint table, OpenAPI drift (fails when `openapi.json` is out of date)                      |
| API unit             | `apps/api/src/**/*.test.ts`              | Pure logic: optimiser, mappers on saved upstream responses, buckets and breakers with a fixed clock, … |
| API integration      | `apps/api/test/**/*.test.ts`             | The real Nest app on real PostgreSQL, fake providers, outbound network blocked                         |
| Web unit / component | `apps/web/{src,scripts}/**/*.test.ts(x)` | React Testing Library + user-event, MSW at the network boundary                                        |
| End to end           | `apps/web/e2e/*.spec.ts`                 | Production builds of both apps, fake providers, blank map style, axe and CSP checks on every page      |

- **Database isolation.** Each API test run drops, recreates and migrates the template database `heremita_test` once; every integration file then clones it (`CREATE DATABASE … TEMPLATE heremita_test`) and drops its copy at the end, so files never share rows. Because the template is rebuilt per run, **two simultaneous API test runs against the same PostgreSQL are not supported**.
- **Parallelism.** The API tests run on two workers and `pnpm test` runs the workspaces one after another: with more concurrency, the integration tests that loop many requests overran their timeouts. Pass `--maxWorkers=2` when running Vitest by hand.
- **Authorisation.** `apps/api/test/authz-matrix.test.ts` has a row for every endpoint of the contract (anonymous, non-owner, owner, moderator and crossed-id cases) and fails when an endpoint has none; `apps/api/test/route-table.test.ts` fails when a Nest handler has no endpoint definition or an endpoint has no handler. A new endpoint needs both.
- **End to end.** `pnpm e2e` builds and starts its own servers (API 3111, web 3110; it never reuses running ones), recreates the `heremita_e2e` database (drop and create, migrations, seed) before the API boots, uses the fake providers and a blank map style, and aborts any request that leaves localhost. Run `pnpm e2e:install` once per machine first. A run takes a few minutes because of the two production builds. Most journeys run in English; the sign-up journey runs in Brazilian Portuguese, the sharing journeys in Spanish, and the settings journey switches English → Spanish → Portuguese. Retries are off: a flaky test is a bug to fix or quarantine, never to retry. Reports land in `apps/web/playwright-report/`. The e2e builds go to `apps/api/dist-e2e` and `apps/web/.next-e2e`, so they never touch the dev servers' output.
- **Live providers.** Tests never reach the internet. `pnpm --filter @heremita/api test:live` is the manual check that the adapters still match the real services.

## Performance budget

SPEC.md (section "I.web.budget") sets first-load JavaScript budgets, gzipped: 150 KB for a page, 200 KB for the planner before its map chunk (MapLibre loads afterwards, off the critical path). `pnpm budget` reads the last production build in `apps/web/.next` (run `pnpm build` first) and prints, per route, the gzip size of the shared runtime plus every client chunk its layouts and page import (1 KB = 1000 bytes), its budget and `WARNING over` when it exceeds it. It is a warning, never a gate: it always exits 0. Chunks loaded on demand (the map, the drag and drop of the planner list) are not counted.

Measured on 2026-11-19 (Next 16.4.6, Turbopack), every route is over:

| Route                                                                    | JS gzip  | Budget |
| ------------------------------------------------------------------------ | -------- | ------ |
| `/[locale]/trips/[tripId]` (planner)                                     | 272.8 KB | 200 KB |
| `/[locale]/trips/[tripId]/settings`                                      | 258.8 KB | 150 KB |
| `/[locale]/trips/new`                                                    | 256.2 KB | 150 KB |
| `/[locale]/t/[tripId]`, `/[locale]/s/[shareToken]`                       | 246.8 KB | 150 KB |
| `/[locale]/settings`                                                     | 238.5 KB | 150 KB |
| `/[locale]/places/[placeId]/review`                                      | 233.0 KB | 150 KB |
| `/[locale]/signup`                                                       | 229.6 KB | 150 KB |
| `/[locale]/login`                                                        | 229.4 KB | 150 KB |
| `/[locale]/places/[placeId]`                                             | 229.2 KB | 150 KB |
| `/[locale]/trips`                                                        | 223.6 KB | 150 KB |
| `/[locale]/explore`                                                      | 222.3 KB | 150 KB |
| `/[locale]/u/[userId]`                                                   | 221.7 KB | 150 KB |
| `/[locale]/moderation`                                                   | 221.1 KB | 150 KB |
| `/[locale]`, `/[locale]/about`, `/[locale]/privacy`, not-found catch-all | 212.5 KB | 150 KB |

The floor every page shares is about 212 KB: React DOM (73.5 KB), the Next.js client router and Turbopack runtime (about 62 KB), zod with the shared schemas (32.7 KB, in the chunk shared by the locale layout and `app/global-error.tsx`), `intl-messageformat` from next-intl (12.4 KB), TanStack Query (7.6 KB) and nuqs (6.4 KB). The drag and drop (dnd-kit, 15.6 KB) loads only when the owner's editable stop list renders, so the read-only `/t` and `/s` pages never fetch it.

## Manual checks for the owner

These need a person with real devices or a real browser and were not automated:

- **Real devices.** One pass of the main journeys on a real iPhone and a real Android phone, including the spacing between touch targets (at least 8 px; the e2e suite checks sizes, not spacing).
- **Search ranking.** One search per locale (en, es and pt-BR) against the real Photon service, judging whether the results come in a sensible order.
- **Content Security Policy.** In a real browser with the console open, walk every page with the real map styles, then make OpenFreeMap unreachable (for example by blocking `tiles.openfreemap.org` in the browser's request blocking) so the map falls back to VersaTiles, and confirm no CSP violation is reported.

## Map and place providers

The public services Heremita uses are run by volunteers or small organisations, under usage policies the API is built to respect. Read them before raising traffic or changing a URL:

| Service                                     | Used for                                    | Policy                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photon (komoot), `photon.komoot.io`         | Search and "what's here" (API)              | "Reasonable" use; heavy use throttled or banned; no availability guarantee: https://github.com/komoot/photon                                                                                                                                                                       |
| OSRM on FOSSGIS, `routing.openstreetmap.de` | Day routes (API)                            | At most 1 request/s and one connection, an identifying `User-Agent` and `Referer`, an operator e-mail on the site, attribution with a "fix the map" link, no high-traffic or substantially commercial sites: https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ |
| Nominatim (OSMF), off by default            | Search fallback and save-time lookups (API) | At most 1 request/s, no autocomplete, no personal data, switch on request: https://operations.osmfoundation.org/policies/nominatim/                                                                                                                                                |
| OpenFreeMap, VersaTiles                     | Basemap tiles, fetched by the browser       | Free public tile servers; they see the visitor's IP (stated on `/privacy`)                                                                                                                                                                                                         |

What the API does about it: every upstream call carries `User-Agent: Heremita/<api version> (+<PUBLIC_SITE_URL>/about)` and `Referer`, and never a user identifier; per-host token buckets (Photon 1/s burst 3, Nominatim 1 per 1.1 s, OSRM 1/s with one connection), timeouts, at most two retries of idempotent GETs, a circuit breaker per host, a 60 s pause after a FOSSGIS 429 and a 1 h pause (logged as `error`) after a 403; successful answers are cached in the `provider_cache` table. Search needs a signed-in user; anonymous viewers of public trips get cached routes and straight-line estimates only. When a provider is down, routes fall back to estimates and the UI says so. The attribution `© OpenStreetMap contributors (ODbL) · OpenFreeMap · Routes: OSRM/FOSSGIS · Fix the map` stays visible near the map, and `/about` and `/privacy` name every service that receives user queries.

**Turning Nominatim on (owner decision).** Keep `NOMINATIM_ENABLED=false` in development and e2e. For production, read the Nominatim policy, then set `NOMINATIM_ENABLED=true` and `NOMINATIM_URL`. It is then used only for explicit searches where no Photon result name contains the query, and to look a place up again on save when its cached search result has expired. With it off, such a save answers 503 `geocoding_unavailable` and the app asks the user to search again.

Known gap: Photon answers only in English, German, French or local names, and does not index Spanish or Portuguese exonyms ("Torre Eiffel", "Munique"), so es and pt-BR users see local names.

Self-hosting is the way out when the terms stop fitting (sustained 429s, a high-traffic or commercial site) or Spanish or Portuguese search matters; only the base URLs change. A planet-wide Photon needs about 95 GB of disk and 64 GB of RAM, and Spanish or Portuguese names need the full JSON dump imported with `-languages es,pt,…`; a regional OSRM extract needs far less than the FOSSGIS servers.

## Owner operations

These are manual on purpose and belong to the project owner.

- **`pnpm db:reset`.** Prisma refuses `migrate reset` when it detects an AI agent, and agents must not bypass that guard. Tests never need it (they use their own databases); run it yourself when you want a fresh dev database.
- **Password reset.** There is no web flow and no e-mail. `pnpm --filter @heremita/api cli reset-password <email>` sets a random temporary password, prints it once and signs the user out everywhere; hand it over and ask them to change it in Settings. It needs only `DATABASE_URL`. Exit codes: 0 done, 1 unknown or malformed e-mail, 2 usage error.
- **Moderators.** The role is set only in the database (the seed makes `ana@example.com` one): `UPDATE users SET role = 'moderator' WHERE email = '…';`. Moderators get a Moderation link in the account menu and decide reports by hand; nothing is hidden automatically.
- **Migrations.** Change `apps/api/prisma/schema.prisma`, run `pnpm db:migrate`, read the generated SQL and add by hand what Prisma cannot express (CHECK constraints, partial indexes). One logical change per migration; never edit a migration that has shipped. In production apply them with `db:deploy` as a separate step before starting the new API, never on boot.

## API contract changes

1. Change the zod schema or endpoint definition in `packages/shared/src`.
2. Run `pnpm --filter @heremita/shared openapi:generate` and commit the new `openapi.json` with the change (the drift test fails otherwise).
3. Implement or adjust the handler (`@Endpoint(endpoints.<name>)`) and its authorisation-matrix row.

Changes inside `/api/v1` are additive only: new endpoints, new optional request fields, new response fields. Removing or renaming a field, tightening validation or changing a status code needs a new version. Before each release, review `git diff <previous release tag> -- packages/shared/openapi.json` for anything that is not an addition. No release has been tagged yet, so the current document is the v1 baseline.

## Deliberate shortcuts

Simplifications made on purpose are marked in the code with a one-line `//` (or `#`) comment:

```ts
// SHORTCUT(owner): <what is simplified> — ceiling: <the limit>; upgrade: <the trigger to revisit>
```

`pnpm shortcuts` lists them and fails when a marker lacks the ceiling or the trigger, or sits in a block comment (where a text search for markers would miss it). Review the list before each release and whenever a trigger may have fired. Two have operational impact: rate-limit, login-attempt and provider-throttle state lives in API process memory, so **run a single API instance** until it moves to PostgreSQL; and there is no tracing, only access logs with response times.

## Running in production

Nothing is deployed yet. The code assumes this shape:

- A reverse proxy that terminates TLS (with HSTS), serves only the web app and overwrites `X-Forwarded-For`.
- The web app (`next start`, port 3100) and the API (`node dist/main.js`, port 3101, not exposed publicly), with `NODE_ENV=production`, `COOKIE_SECURE=true`, `SESSION_COOKIE_NAME=__Host-hm_session`, `PUBLIC_SITE_URL`, `WEB_ORIGIN`, `CONTACT_EMAIL` and the real provider settings. Build the web app with its final `API_URL` and map styles.
- PostgreSQL 18 with backups; `db:deploy` as a one-off step before each API release. The seed refuses to run in production.
- One API instance (see [Deliberate shortcuts](#deliberate-shortcuts)).
- Health: `GET /api/v1/health` (liveness, checks nothing external) and `GET /api/v1/health/ready` (`{ "status": "ok", "db": "up" }`, or 503 with a problem body when the database does not answer). On SIGTERM or SIGINT the API stops accepting connections, finishes in-flight requests, closes the database pool and exits 0; past 10 s it exits 1. Health checks never ping the providers.
- Logs: one JSON line per request on stdout (`reqId`, `method`, route template, `status`, `userId`, `responseTime`). Cookies, passwords, tokens, search text and coordinates are never logged. Every response carries `X-Request-Id`.
- Security headers and a per-request nonce Content Security Policy come from `apps/web/src/proxy.ts` (policy built in `apps/web/src/csp.ts`); a new third-party origin (tiles, fonts, scripts) must be added there or browsers block it.

## Project documents

- `SPEC.md`: goals and constraints (§G, §C, including every decision and deviation), interfaces (§I: environment, endpoints, data model, providers, routes, design tokens), invariants with the test that guards each (§V), the task history (§T) and the bug log (§B). It uses a compressed notation: `!` must, `⊥` never or not, `∴` therefore, `∧`/`∨` and/or, `→` leads to; code, paths and identifiers are verbatim. Prettier skips it because tools parse its tables.
- `apps/web/AGENTS.md` is written by `next dev`; it points coding agents at the Next.js docs bundled in `node_modules/next/dist/docs/`, which match the installed version.
- Conventions: code, comments and docs in English; Conventional Commits (`type(scope): subject`, imperative, no AI attribution); `TODO(owner): … — YYYY-MM-DD` is the only accepted TODO form; no `console.log` (scripts write to `process.stdout` / `process.stderr`).

## Troubleshooting

- **The API stops at start with "Invalid environment variables".** Run `pnpm env:init`, or fix the listed variables in `apps/api/.env`.
- **The web build fails on the environment.** Same in `apps/web/.env`; `API_URL` and `NEXT_PUBLIC_*` are read at build time.
- **Signed in on the API but not on the web.** `SESSION_COOKIE_NAME` does not match the API's `COOKIE_SECURE`.
- **A change in `packages/shared` does not show up.** `pnpm dev` rebuilds it and restarts the API on any emitted change; outside `pnpm dev`, run `pnpm build:shared`.
- **TypeScript stays on 6.0.** The Nest CLI and typescript-eslint do not support TypeScript 7.0 (it ships no compiler API); revisit with 7.1.
- **`pnpm install` refuses a brand-new package version.** pnpm 11 waits 24 hours after a release (`minimumReleaseAge`); pin the previous version.
