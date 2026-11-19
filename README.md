# Heremita

[![CI](https://github.com/frandigon6alves/heremita/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/frandigon6alves/heremita/actions/workflows/ci.yml)

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
- `packages/shared` is the contract. Every request and response shape is a zod schema there; the API validates every input with it, the web types its calls with it (and validates its forms with it), and `packages/shared/openapi.json` is generated from it (served at `GET /api/v1/openapi.json`).
- The web app imports values from the zod-free subpaths `@heremita/shared/plain` (limits, option lists such as `LOCALES`, `cleanText`) and `@heremita/shared/api-routes` (method and path of every endpoint), and the schemas only through `apps/web/src/lib/schemas.ts`, which turns zod's JIT off first (the CSP forbids `eval`). An ESLint rule enforces it, so zod only ships to pages with a form.
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

| Variable                                  | App       | Notes                                                                                                                                                                              |
| ----------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | api       | Dev: `postgresql://heremita:heremita@localhost:5434/heremita`. The only real secret.                                                                                               |
| `TEST_DATABASE_URL`                       | api       | Test template database; its name must end in `_test`.                                                                                                                              |
| `WEB_ORIGIN`                              | api       | Exact web origin; unsafe requests must come from it (CSRF check).                                                                                                                  |
| `PUBLIC_SITE_URL`                         | api       | Public site address, sent to the map providers in `User-Agent` and `Referer`. Required in production.                                                                              |
| `COOKIE_SECURE`                           | api       | `true` → cookie `__Host-hm_session` + `Secure` (needs HTTPS); `false` → `hm_session`. Default: true only in production.                                                            |
| `SESSION_COOKIE_NAME`                     | web       | Must match the API's cookie name (`hm_session` or `__Host-hm_session`).                                                                                                            |
| `TRUST_PROXY`                             | api       | Hops allowed to set `X-Forwarded-For` (rate limits key on the client IP). A production proxy must overwrite that header, not append.                                               |
| `SERVER_FETCH_SECRET`                     | api + web | Same value in both apps. Required in production (at least 32 characters; `openssl rand -base64 32`), optional in development. See [Signed client address](#signed-client-address). |
| `GEOCODING_PROVIDER` / `ROUTING_PROVIDER` | api       | `photon` / `osrm`, or `fake`. Fakes in a production build are refused unless `ALLOW_FAKE_PROVIDERS=true` (e2e only).                                                               |
| `PHOTON_URL`, `OSRM_URL`, `NOMINATIM_URL` | api       | Provider base URLs; never hard-coded, so a provider can ask us to switch.                                                                                                          |
| `NOMINATIM_ENABLED`                       | api       | `false` by default; see [Map and place providers](#map-and-place-providers).                                                                                                       |
| `API_URL`                                 | web       | Where `/api/*` is forwarded. Read when the dev server starts and **baked in at build time** for production: change it, then rebuild.                                               |
| `CONTACT_EMAIL`                           | web       | Operator contact shown on `/about`; the FOSSGIS terms require one. Required in production. Never commit a real address.                                                            |
| `NEXT_PUBLIC_MAP_STYLE_*`                 | web       | Basemap styles (OpenFreeMap light/dark, VersaTiles fallbacks). `NEXT_PUBLIC_*` values are inlined at build time.                                                                   |
| `DEMO_PASSWORD`                           | api       | Password the seed gives every demo account (at least 12 characters).                                                                                                               |

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
- **Order independence (web).** A web test ends only once every API call it made has been answered, and teardown hooks run in the order they were declared (`sequence.hooks: 'list'`): the setup file unmounts, the MSW harness waits for the answers still in flight, then the test file resets its shared stores (toasts, session storage, online state). So a late answer (a failed save's toast, a rollback) never lands in the next test. Check with `pnpm --filter @heremita/web exec vitest run --sequence.shuffle --sequence.seed=<n>`.
- **Live providers.** Tests never reach the internet. `pnpm --filter @heremita/api test:live` is the manual check that the adapters still match the real services.

## Performance budget

SPEC.md (section "I.web.budget") sets first-load JavaScript budgets, gzipped: 150 KB for a page, 200 KB for the planner before its map chunk (MapLibre loads afterwards, off the critical path). `pnpm budget` reads the last production build in `apps/web/.next` (run `pnpm build` first) and prints, per route, the gzip size of the shared runtime plus every client chunk its layouts and page import (1 KB = 1000 bytes), its budget and `WARNING over` when it exceeds it. It is a warning, never a gate: it always exits 0. Chunks loaded on demand (the map, the drag and drop of the planner list) are not counted.

Measured on 2026-11-19 (Next 16.4.6, Turbopack) before and after the performance part of the audit; every route is still over:

| Route                                                                    | Before   | After    | Budget |
| ------------------------------------------------------------------------ | -------- | -------- | ------ |
| `/[locale]/trips/[tripId]` (planner)                                     | 277.0 KB | 227.3 KB | 200 KB |
| `/[locale]/trips/[tripId]/settings`                                      | 262.2 KB | 240.7 KB | 150 KB |
| `/[locale]/trips/new`                                                    | 259.5 KB | 237.4 KB | 150 KB |
| `/[locale]/settings`                                                     | 241.2 KB | 231.5 KB | 150 KB |
| `/[locale]/places/[placeId]/review`                                      | 235.4 KB | 225.4 KB | 150 KB |
| `/[locale]/signup`                                                       | 232.6 KB | 222.7 KB | 150 KB |
| `/[locale]/login`                                                        | 232.4 KB | 222.5 KB | 150 KB |
| `/[locale]/t/[tripId]`, `/[locale]/s/[shareToken]`                       | 265.2 KB | 212.3 KB | 150 KB |
| `/[locale]/trips`                                                        | 227.6 KB | 194.5 KB | 150 KB |
| `/[locale]/places/[placeId]`                                             | 246.4 KB | 192.3 KB | 150 KB |
| `/[locale]/explore`                                                      | 225.8 KB | 183.9 KB | 150 KB |
| `/[locale]/u/[userId]`                                                   | 225.2 KB | 183.4 KB | 150 KB |
| `/[locale]/moderation`                                                   | 223.4 KB | 181.5 KB | 150 KB |
| `/[locale]`, `/[locale]/about`, `/[locale]/privacy`, not-found catch-all | 215.6 KB | 171.8 KB | 150 KB |

The floor every page shares is now about 172 KB: React DOM (73.4 KB), the Next.js client router and Turbopack runtime (about 62 KB), `intl-messageformat` from next-intl (12.4 KB), TanStack Query (5.5 KB) and the site header's client parts (language switcher, account menu), which Turbopack copies into the not-found chunk and again into each page's chunk (about 7 KB). zod and the shared schemas (about 39 KB) load only on the pages with a form (log in, sign up, settings, new trip, trip settings, review) and with the first failed API call; nuqs only on the planner, the read-only trip pages and the place page; dnd-kit (15.6 KB) only on the planner, part of its first load so the owner's rows are sortable from the first paint and never swapped under a tap. Loaded on demand and not counted: the map, the place search combobox (downshift, on the first focus of the field) and the report form (on its first open). Each page's HTML carries only the message namespaces its client components use (`ClientMessages`; `src/i18n/client-messages.test.ts` checks every route).

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
- **Migrations.** Change `apps/api/prisma/schema.prisma`, run `pnpm db:migrate`, read the generated SQL and add by hand what Prisma cannot express (CHECK constraints, partial indexes). One logical change per migration; never edit a migration that has shipped. In production `db:deploy` applies them before the new API starts (on Render's free plan, at the head of the start command; see [CI/CD](#cicd)).

## API contract changes

1. Change the zod schema or endpoint definition in `packages/shared/src`. A new or moved endpoint also needs its row in `src/api/route-table.ts` (a test compares both tables).
2. Run `pnpm --filter @heremita/shared openapi:generate` and commit the new `openapi.json` with the change (the drift test fails otherwise).
3. Implement or adjust the handler (`@Endpoint(endpoints.<name>)`) and its authorisation-matrix row.

Changes inside `/api/v1` are additive only: new endpoints, new optional request fields, new response fields. Removing or renaming a field, tightening validation or changing a status code needs a new version. Before each release, review `git diff <previous release tag> -- packages/shared/openapi.json` for anything that is not an addition. No release has been tagged yet, so the current document is the v1 baseline.

## Deliberate shortcuts

Simplifications made on purpose are marked in the code with a one-line `//` (or `#`) comment:

```ts
// SHORTCUT(owner): <what is simplified> — ceiling: <the limit>; upgrade: <the trigger to revisit>
```

`pnpm shortcuts` lists them and fails when a marker lacks the ceiling or the trigger, or sits in a block comment (where a text search for markers would miss it). Review the list before each release and whenever a trigger may have fired. Two have operational impact: rate-limit, login-attempt and provider-throttle state lives in API process memory, so **run a single API instance** until it moves to PostgreSQL; and there is no tracing, only access logs with response times.

## CI/CD

GitHub Actions runs CI; deploys are done by the hosts themselves (Render for the API, Vercel for the web app, Neon for the database), each told to wait for CI. No GitHub secret is needed.

### What runs when

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request to `main`. A newer push to the same branch or pull request cancels the run it supersedes. Two jobs run side by side, each with its own PostgreSQL 18 service on `localhost:5434` (same user, password and port as `docker-compose.yml`, so the `.env` examples work unchanged):

| Job      | Steps                                                                                                                                                                        | Takes about |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `checks` | `pnpm install --frozen-lockfile`, `env:init`, create `heremita_test`, `typecheck`, `lint`, `format:check`, `shortcuts`, `build`, `budget` (never fails), `test`              | 5 min       |
| `e2e`    | `pnpm install --frozen-lockfile`, `env:init`, Playwright Chromium (browser cached per Playwright version), `pnpm e2e` exactly as locally (builds, 3110/3111, `heremita_e2e`) | 6 min       |

`e2e` does not wait for `checks`: it builds its own servers anyway, so running them in parallel gives the answer in the time of the slower job. Node comes from `.node-version`, pnpm from `packageManager` in `package.json`, and the pnpm store is cached on the lockfile. WebKit (`pnpm e2e:webkit`) and `test:live` stay out of CI.

`.github/dependabot.yml` opens update pull requests every Monday: one for all minor and patch npm bumps, one per major, one for all GitHub Actions. It waits 2 days after a release, because pnpm 11 refuses versions younger than 24 hours. They go through CI like any other pull request.

### Reading a failure

- Open the red run from the pull request's checks or from the Actions tab; the failing step is expanded. Every step is a root `pnpm` command, so the same command reproduces it locally (`pnpm db:up` first for `test` and `e2e`).
- `format:check` failing: run `pnpm format` and commit. `test` failing only in CI: look for a timing assumption first (the runner has 4 slow cores).
- `e2e` failing: the run's Summary page has a `playwright-report` artifact (kept 14 days) with the HTML report and the traces. Download it (or `gh run download <run id> --name playwright-report`), then `pnpm --filter @heremita/web exec playwright show-report <unzipped folder>/playwright-report`; open a trace from the report or with `playwright show-trace <trace.zip>`. Retries are off on purpose (see [Tests](#tests)).
- The `budget` step prints warnings and is green by design; read it when a change adds client JavaScript.

### Deploys

Only commits on `main` whose CI is green reach production:

- **API (Render).** `render.yaml` sets `autoDeployTrigger: checksPass`: Render builds a new commit on `main` only after every GitHub check on it has concluded as success, neutral or skipped. A red or cancelled check, or a commit with no checks, is not deployed (push again or deploy it by hand from the dashboard).
- **Web (Vercel).** Vercel builds every push, but with Deployment Checks a production deployment is promoted to the production domain only once the required GitHub checks (`checks`, `e2e`) pass. Pull requests get preview deployments as usual.
- **Database (Neon).** Nothing to deploy: migrations travel with the API (below).

Renaming the `checks` or `e2e` job means updating the Vercel Deployment Checks too.

### One-time setup (owner, in this order)

The live demo already exists, so steps 1 to 4 describe how it should be configured (or how to recreate it). Two settings must be checked on the existing services, because they were created before CI existed:

- **Render:** if `heremita-api` was created from the Blueprint, the push of `autoDeployTrigger: checksPass` syncs on its own; otherwise (service created by hand) set Settings → Build & Deploy → Auto-Deploy → "After CI Checks Pass". Either way, confirm the dashboard shows that value.
- **Vercel:** add the Deployment Checks `checks` and `e2e` (step 3, last bullet). Until then Vercel promotes every successful build of `main`, green CI or not.
- **Both:** set `SERVER_FETCH_SECRET` (one value, generated once with `openssl rand -base64 32`) on Render (`heremita-api` → Environment) and on Vercel (Settings → Environment Variables, Production and Preview) **before** the next deploy of `main`. Without it the API refuses to start in production and the Vercel build fails. Set it on Render first: until Vercel is redeployed the API just keeps keying server renders by Vercel's address.

1. **Neon.** The repository is already linked to a Neon project (`neon.ts`, `.neon`, branch `production`). Make sure the project's region is AWS Frankfurt (`eu-central-1`, next to the Render service), then copy the **direct** (not pooled, no `-pooler` in the host) connection string of the `production` branch, with `sslmode=require`. Check the backup / point-in-time restore window of your plan.
2. **Render.** New → Blueprint → pick this repository; Render reads `render.yaml` and creates `heremita-api` (free plan, Frankfurt). Fill the `sync: false` variables: `DATABASE_URL` (step 1), `WEB_ORIGIN` and `PUBLIC_SITE_URL` (the Vercel production URL, e.g. `https://heremita.vercel.app`; set them after step 3 if the URL is not known yet, then redeploy), `SERVER_FETCH_SECRET` (generate it once with `openssl rand -base64 32`; Vercel gets the same value in step 3). `DEMO_PASSWORD` is generated. In the service's Settings → Build & Deploy, confirm Auto-Deploy shows "After CI Checks Pass". Note the service URL (`https://heremita-api.onrender.com` or similar).
3. **Vercel.** Add New → Project → import this repository, then in the project settings:
   - Root Directory `apps/web`, with "Include files outside the root directory in the Build Step" on (the build reads `packages/shared`). Framework preset Next.js, Node.js 24.x.
   - Install Command `pnpm install --frozen-lockfile`; Build Command `pnpm --dir ../.. build:shared && pnpm build`. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in `package.json` (pnpm 11; the workspace settings in `pnpm-workspace.yaml` need it).
   - Environment variables (Production and Preview): `API_URL` = the Render URL from step 2 (no trailing slash; baked in at build time, so change it → redeploy), `SESSION_COOKIE_NAME=__Host-hm_session` (the API runs with `NODE_ENV=production`, so its cookie is Secure), `CONTACT_EMAIL` = the operator address shown on `/about` (required in production). `SERVER_FETCH_SECRET` = the same value as on Render (required; the build fails without it). Optional: `NEXT_PUBLIC_MAP_STYLE_LIGHT`, `NEXT_PUBLIC_MAP_STYLE_DARK`, `NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT`, `NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK` (the defaults are OpenFreeMap and VersaTiles). Never set `NEXT_PUBLIC_E2E`.
   - Settings → Environments → Production: automatic aliasing (auto-assign custom domains) on. Settings → Build and Deployment → Deployment Checks → Add Checks → GitHub → select `checks` and `e2e`.
4. Back on Render, set `WEB_ORIGIN` / `PUBLIC_SITE_URL` to the final web URL if they were placeholders, and redeploy once. Then open `https://<web>/api/v1/health/ready`: it should answer `{"status":"ok","db":"up"}` through the Vercel rewrite.
5. GitHub (optional): Settings → Branches → add a rule or ruleset for `main` that requires the `checks` and `e2e` status checks, so a pull request cannot merge red.

The free Render instance sleeps after 15 minutes without traffic; the first request after that takes about a minute.

### How migrations reach production

A migration is committed with the code that needs it. After CI passes, Render builds the commit and its start command runs `pnpm --filter @heremita/api db:deploy` (`prisma migrate deploy`: applies pending migrations, never creates or resets anything) and only then starts the API. If the migration fails, the new instance never becomes healthy and Render keeps serving the previous one. Free Render instances have no pre-deploy step, hence the start command; on a paid plan move `db:deploy` to `preDeployCommand`. Because the old API keeps running while the new one migrates, every migration must also work with the previous release of the code (add first, remove in a later release).

### Rolling back

- **API.** Render dashboard → `heremita-api` → Events/Deploys → the last good deploy → Rollback. Rolling back pauses auto-deploys; turn them on again (Settings → Auto-Deploy → After CI Checks Pass) once the fix is on `main`. Migrations are **not** rolled back: the old code must work with the newer schema (the rule above). Undo a schema change with a new forward migration, never by editing or deleting a shipped one.
- **Web.** Vercel dashboard → Deployments → the last good production deployment → Instant Rollback. Vercel then stops promoting new production deployments until you promote one again (Promote, or Undo Rollback). To ship a fix, `git revert` the bad commit on `main` and let CI and the hosts redeploy.
- **Database.** For data damage, restore the Neon branch to a point in time before the incident (Neon console → Restore), within your plan's restore window; point `DATABASE_URL` at the restored branch if you restore to a new one.

## Running in production

The live demo runs on Vercel (web), Render (API) and Neon (database); their setup is in [CI/CD](#cicd). In general the code assumes this shape:

- A reverse proxy that terminates TLS (with HSTS), serves only the web app and overwrites `X-Forwarded-For`.
- The web app (`next start`, port 3100) and the API (`node dist/main.js`, port 3101, not exposed publicly), with `NODE_ENV=production`, `COOKIE_SECURE=true`, `SESSION_COOKIE_NAME=__Host-hm_session`, `PUBLIC_SITE_URL`, `WEB_ORIGIN`, `CONTACT_EMAIL`, the same `SERVER_FETCH_SECRET` in both apps and the real provider settings. Build the web app with its final `API_URL` and map styles.
- PostgreSQL 18 with backups; `db:deploy` as a one-off step before each API release. The seed refuses to run in production.
- One API instance (see [Deliberate shortcuts](#deliberate-shortcuts)).
- Health: `GET /api/v1/health` (liveness, checks nothing external) and `GET /api/v1/health/ready` (`{ "status": "ok", "db": "up" }`, or 503 with a problem body when the database does not answer). On SIGTERM or SIGINT the API stops accepting connections, finishes in-flight requests, closes the database pool and exits 0; past 10 s it exits 1. Health checks never ping the providers.
- Logs: one JSON line per request on stdout (`reqId`, `method`, route template, `status`, `userId`, `responseTime`). Cookies, passwords, tokens, search text and coordinates are never logged. Every response carries `X-Request-Id`.
- Security headers and a per-request nonce Content Security Policy come from `apps/web/src/proxy.ts` (policy built in `apps/web/src/csp.ts`); a new third-party origin (tiles, fonts, scripts) must be added there or browsers block it.

### Signed client address

Pages rendered on the server call the API from the web server, so on Vercel every signed-out render reaches the API from the same few egress addresses. To keep one busy visitor (or a crawler) from using up the anonymous rate limit of everyone, `serverFetch` (`apps/web/src/lib/api/server.ts`) sends the visitor's address (the last `X-Forwarded-For` entry, which Vercel or your proxy wrote) in `X-Heremita-Client-Ip`, plus `X-Heremita-Client-Ip-Signature: <unix ms>.<HMAC-SHA256>` over address and time with `SERVER_FETCH_SECRET`. The API (`apps/api/src/core/http/client-address.ts`) uses that address for anonymous rate limits and failed-login counting only when the signature checks out (constant-time compare) and is at most 60 s old or ahead; otherwise, or without a secret, it uses `req.ip` as before. To rotate the secret, set the new value on both hosts and redeploy both; until both run it, server renders fall back to the shared bucket.

Generate the value once and paste the same string on both hosts:

```sh
openssl rand -base64 32
```

- Render: `heremita-api` → Environment → `SERVER_FETCH_SECRET` (declared `sync: false` in `render.yaml`).
- Vercel: project → Settings → Environment Variables → `SERVER_FETCH_SECRET`, for Production and Preview (it is read at build and at run time; never prefix it with `NEXT_PUBLIC_`).

Locally, `.env.example` carries a public development value; never reuse it in production.

### Failed sign-ins

Wrong passwords are counted per e-mail **and** client address block (the /24 of an IPv4 address, the /64 of an IPv6 one): the sixth failure within 15 minutes from the same block answers 429 `too_many_attempts` with `Retry-After`, while the owner signing in from anywhere else is still checked normally. A backstop of 50 failures per e-mail in 15 minutes, from all addresses together, stops a guesser who rotates blocks; it is the only case where someone else can delay the owner, and it ends with the window. Nothing locks an account for good (`apps/api/src/auth/login-attempts.ts`).

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
