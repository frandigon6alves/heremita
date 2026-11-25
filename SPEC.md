# SPEC — Heremita

Single source of truth. Caveman-encoded (see `spec`/`caveman` skills). Code, paths, ids, numbers, strings verbatim.
Written 2026-11-18 from design panel (domain/API, UX/frontend, quality/risk), critique, research (UX, MapLibre, providers) + skeleton. Those files are temporary: nothing below depends on them.
Ids: §I rows tagged `I.<area>`; endpoints `E<n>`; invariants `V<n>`; tasks `T<n>`; bugs `B<n>`. Numbering monotonic, never reused.

## §G goals

G1: mobile-first web app → independent traveller plans own trip: mark places on map + private notes; organise places day-by-day (easy reorder, touch included); route per day (walk|bike|drive) w/ distance + time; read other users' reviews + public trips.
G2: real FE + real BE: accounts, persistence, authorisation. Fully usable on phone (touch, 360 px), good on desktop.
G3: expected extras ∈ v1: sign-up/login, many trips/user, place search, share trip by link, copy public|link trip, en (default) + es + pt-BR UI, light/dark + user override, loading/empty/error states, demo seed so community ≠ empty on first run.
G4: ⊥ v1: payments, bookings, realtime collab, native apps, offline-first sync, AI trip gen, e-mail delivery, image uploads, guest drafts, Today/Trip mode, PWA install/service worker, export, day titles, day reorder, units pref (metric only), handles, opening-hours/website facts.

## §C constraints

### Stack (installed in skeleton, verify majors from installed types/CHANGELOG, never memory)
- pnpm workspaces monorepo `/Users/frangoncalves/Desktop/DEV/heremita`: `apps/web` (Next 16.4.6 App Router, React 19.3.1, TS), `apps/api` (NestJS 12.5.1 on Express 5.3.0, Prisma 7.10.1 + `@prisma/adapter-pg`, PostgreSQL 18.7 image `postgres:18`), `packages/shared` (`@heremita/shared`, compiled ESM `dist/`, zod 4.6.7).
- Node 24.15.0, pnpm 11.1.1 (default `minimumReleaseAge` 24 h → package published < 24 h ago ⊥ installable; pin previous), TypeScript 6.0.3 (⊥ 7.0.x: Nest CLI + typescript-eslint refuse it; revisit at 7.1), Vitest 5.1.0 (→ 5.1.1 allowed from 2026-11-19), Playwright 1.65.1, TanStack Query 5.108.0, maplibre-gl 6.19.0 (stay ≥ 6.16), ESLint 10, Prettier 3.10.
- Prisma: generator `prisma-client` → `apps/api/src/generated/prisma`; config `apps/api/prisma7.config.ts`; preview feature `partialIndexes` (fallback: hand SQL index if a Prisma upgrade drops it).
- Ports: web 3100, api 3101, Postgres host 5434 (dev DB `heremita`, test template `heremita_test`, e2e DB `heremita_e2e`), e2e web 3110, e2e api 3111. ⊥ use 3000, 5433; ⊥ touch other projects' containers; ⊥ kill processes not started by you.
- Maps: OSM data via MapLibre GL JS; basemap OpenFreeMap; geocoding Photon (+ Nominatim fallback, off by default); routing FOSSGIS OSRM. ⊥ API keys, ⊥ paid services, ⊥ accounts.
- UI langs: `en` (official, default), `es` (neutral: Spain + Latin America), `pt-BR`; order en, es, pt-BR everywhere (ID-i18n-en-es). All code, comments, docs in English.

### Lead decisions (fixed)
- L1 contract: zod v4 schemas in `packages/shared` = single source of truth for request+response shapes; API validates every input with them; OpenAPI 3.1 generated from them, never hand-written.
- L2 JSON camelCase everywhere (bodies + query). Timestamps ISO-8601 UTC strings (`Z`). IDs opaque strings (UUIDv7). Calendar dates `YYYY-MM-DD`, months `YYYY-MM` (formatted w/ `timeZone: 'UTC'`).
- L3 errors RFC 9457 `application/problem+json`: `type, title, status, detail, instance`, `errors[{pointer, detail}]` on 422, extension `code` (stable). Problem schema in shared; web parses error bodies with it. Success payloads trusted via shared types (⊥ parse on web). Third-party responses always validated on server.
- L4 lists: keyset. Request `limit` (server-capped) + `cursor` (opaque); response `{items, nextCursor}` (`null` at end).
- L5 auth: opaque server sessions in PG (store hash only), HttpOnly cookie (Secure in prod, SameSite=Lax) set by API. Browser talks only to web origin; Next rewrites `/api/*` → API. Unsafe methods: SameSite + Origin/Sec-Fetch-Site check. Argon2id m=19 MiB t=2 p=1. ⊥ e-mail delivery.
- L6 FE: Server Components default; client only at interactive leaves. TanStack Query v5 client server-state. RSC fetch API server-to-server forwarding session cookie. RHF + zod for non-trivial forms. URL search params for selected day, place, route mode. Error boundaries = `error.tsx`, ⊥ hand-written class components.
- L7 styling: CSS Modules + CSS custom-property tokens (light, dark, user override). ⊥ Tailwind, ⊥ CSS-in-JS, ⊥ component library. Small headless pkgs only where native falls short (bottom sheet, DnD, combobox), each verified for React 19.
- L8 health: `GET /api/v1/health` liveness (nothing external); `GET /api/v1/health/ready` DB pool usable. ⊥ ping providers.
- L9 retries: API retries idempotent provider GETs (capped jittered backoff, honour `Retry-After`). Web ⊥ retries mutations; queries retry ≤ 1, network errors only.
- L10 geocoding + routing via API (cache, throttle, provider-neutral shapes); deterministic fake provider by env for tests + e2e.
- L11 field errors: `aria-invalid` + `aria-describedby` → error element `role="alert"`. Type sizes: `clamp()` bounded by type-scale steps.
- L12 ⊥ commits by agents. Owner commits later: Conventional Commits, ⊥ AI attribution.

### Engineering rulebook (owner standards, binding; summary)
- Clean code: YAGNI → stdlib → platform → installed dep → minimum code. ⊥ WHAT-comments, ⊥ commented code, ⊥ feature flags, ⊥ compat shims/`_v2`, ⊥ nested ternary, ⊥ `console.log`, ⊥ magic number used twice. `TODO(owner): … — YYYY-MM-DD` only.
- Deliberate shortcut ! marked `// SHORTCUT(owner): <what> — ceiling: <limit>; upgrade: <trigger>` (line comment `//` or `#` only, so ledger grep finds it).
- Tests: many unit, some integration (real PG, real Nest pipeline), few e2e. Behaviour via public interface; AAA; one behaviour per test named after it (`rejects_expired_token`); injected clock, seeded RNG; fakes > mocks (mock only boundaries we do not own); each test owns its data; cover empty/one/many, boundaries, invalid, error paths. Playwright: role+name locators, web-first assertions, ⊥ `waitForTimeout`. Flaky = bug (quarantine w/ owner, ⊥ retry to green). RTL + user-event (⊥ `fireEvent`), MSW at network boundary.
- FE: search before creating; `shared/` never imports `features/`; features never import each other (compose in `app/`); one hook per file; `key` = stable id; React 19 (`ref` prop, `<Context value>`, `use()`); derived → render, ⊥ mirror props/URL into state; effects only for external systems w/ cleanup; React Compiler off → no hand `useMemo`/`useCallback`/`memo` unless Profiler shows need; query keys include every `queryFn` input via `queryOptions()`; `useMutation` + `invalidateQueries`, ⊥ copy server data into state; set `staleTime`; v5 `gcTime`.
- BE: object-level authz on every id; parameterised queries; ⊥ secrets in code/logs; explicit timeout on every outbound call; env validated at boot (fail fast); JSON logs stdout; paginate every list; additive-only API changes in `/v1`; ⊥ network inside DB tx, side effects after commit; N+1 forbidden; invariants in schema (UNIQUE/FK/CHECK/NOT NULL); index FKs + filter/sort cols; `timestamptz`; migrations generated + read, one logical change, never edit shipped one, run as one-off step ⊥ on boot.
- Paths plural nouns, ⊥ verbs; non-CRUD action = noun sub-resource (Express 5 path-to-regexp 8 treats `:` as param ∴ `:action` style impossible — accepted deviation from rulebook). PUT replace, PATCH partial, DELETE idempotent. 201 + `Location` on create; 204 no body; 400 malformed; 422 invalid; 401; 403; 404 also for others' objects (⊥ 403); 409 conflict/state; 429 + `Retry-After`. ⊥ 200 w/ error body.
- Visual identity: ⊥ Inter, ⊥ purple/violet gradients, ⊥ dead-centred card, ⊥ safe greys everywhere (tokens §I.tokens satisfy this).

### Rendering + platform decisions (from critique, binding)
- `next.config.ts`: `cacheComponents: false`, `partialPrefetching: false` (nonce CSP incompatible w/ PPR; pages are session/visibility dependent; avoids stale public page after trip made private). ⊥ `'use cache'`; `getViewer` uses React `cache()`.
- Nonce CSP generated per request in `apps/web/src/proxy.ts` (§I.web.csp), enforced (⊥ report-only).
- ⊥ Server Actions (`'use server'` banned by lint in `apps/web/src`); all mutations browser → `/api/v1/*` rewrite → Nest. RSC → API: GET only.
- ⊥ guest mode: public browsing (landing, explore, public/link trips, place pages, profiles) w/o account; creating anything needs 3-field sign-up. `// SHORTCUT(owner): signup required to create a trip — ceiling: users who abandon at the signup form; upgrade: if signup-start → signup-done drops below 60%, add server-side guest accounts that convert on signup`.
- Search + reverse geocoding: signed-in only. Anonymous viewers of day routes: cache hits + straight-line estimates, ⊥ upstream call.
- Nominatim: `NOMINATIM_ENABLED=false` default (dev + e2e); owner opts in for prod after reading https://operations.osmfoundation.org/policies/nominatim/. Off + `place:v1:<key>` cache miss on save → 503 `geocoding_unavailable` (client re-searches). Known gap: Photon ⊥ indexes Portuguese exonyms ("Torre Eiffel", "Munique") → pt-BR + es users see local/English names (Photon langs = default/de/en/fr).
- Ordering model: dense integer `position` per day; every structural write starts w/ ONE trip-row lock statement bumping `plan_version`; whole-day position rewrite two-phase (`+1000` then final). ⊥ client version in bodies; stale full-list write → 409 `plan_changed`. Why: only model run against PG 18.7; one lock per trip removes two-day lock ordering; Prisma cannot model `DEFERRABLE` unique.
- Ideas = trip place w/ no stop (same trip place may be on several days, e.g. hotel). Notes live on trip place (⊥ stop) and never leave owner (⊥ shown on link/public views, ⊥ copied).
- Moderation: role `moderator` (seed/SQL only), report queue + manual decisions, ⊥ auto-hide (brigading risk).
- Account deletion deletes reviews (⊥ anonymise). Sign-up 409 `email_taken` reveals accounts: accepted risk, owner = project owner, mitigated by 5 sign-ups/h/IP; revisit when e-mail delivery exists.
- Password reset: ⊥ web flow; owner CLI sets temporary password + deletes user sessions.
- Icons: inline SVG set in `apps/web/src/shared/icons/` (Lucide-derived paths, ISC notice) — ⊥ `lucide-react` dep.
- Single API instance assumed: throttles, login attempts, token buckets in process. `// SHORTCUT(owner): rate-limit, login-attempt and upstream token-bucket state in API process memory — ceiling: one API instance, counters reset on restart; upgrade: before a second API instance runs, move them to a Postgres-backed store`.
- ⊥ OpenTelemetry v1: `// SHORTCUT(owner): no OpenTelemetry, latency only in access logs — ceiling: no traces across web→api→provider; upgrade: first production incident logs cannot explain, or a second API instance`.
- ⊥ `Idempotency-Key` v1: UNIQUE(trip, place) dedups OSM adds; duplicate custom pin on manual Retry accepted: `// SHORTCUT(owner): no Idempotency-Key on POST /trips/{tripId}/places — ceiling: a manual Retry after a lost response can duplicate a custom pin; upgrade: first user report of duplicates`.
- Note autosave last-write-wins across tabs: `// SHORTCUT(owner): note autosave has no concurrency control — ceiling: two tabs editing one note, last write wins; upgrade: first report of a lost note`.
- Public trip search ILIKE: `// SHORTCUT(owner): public-trip text search is ILIKE over title and destination — ceiling: a few thousand public trips; upgrade: when p95 of /public-trips passes 200 ms, add pg_trgm or full-text search`.
- Optimiser on straight lines: `// SHORTCUT(owner): stop order optimised on straight-line distances — ceiling: +7.5 % walking time vs OSRM /trip on the 25-stop sample; upgrade: a self-hosted router without the 6/min table limit`.
- Process: Foundation (§T) lands first by one engineer at a time; afterwards each workstream owns disjoint dirs (named in §T). Hot files (lockfile + every `package.json`, `pnpm-workspace.yaml`, `apps/api/prisma/**` incl. migrations + seed, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/app.setup.ts`, `apps/api/src/core/**`, `apps/api/src/providers/{core,fake}/**`, `packages/shared/**`, `apps/web/src/{proxy.ts,env.ts,i18n,lib,shared/styles,shared/icons}/**`, base shared components of T21, `apps/web/src/messages/*/common.json`, `apps/web/src/app/[locale]/layout.tsx`, configs) belong to `[core]`; a workstream needing a change ! amend §I first (spec skill) then ask `[core]`. Only `[core]` runs `pnpm add|install|update` and `prisma migrate dev`, serialised. Nobody runs `prisma migrate reset`/`pnpm db:reset` (Prisma AI-agent guard; owner runs it by hand).
- Dev servers: one shared `pnpm dev` (3100/3101). E2E never reuses dev servers.

### Spike outcomes (T9, 2026-11-18; throwaway app run as `next build`+`start` and `next dev`, Playwright mobile+desktop chromium, all green ×3–5; StrictMode double-mount asserted in dev)
- S-a `zod-openapi` 6.0.2 ✓ (⊥ fallback): `createDocument({openapi:'3.1.0'})` over real `tripPlanSchema` → `TripPlan {oneOf:[$ref TripPlanOwner, $ref TripPlanViewer], discriminator:{propertyName:'viewerRole', mapping}}`; doc valid vs OAS 3.1 schema 2022-10-07; every component compiles as strict JSON Schema 2020-12 (ajv) ∧ accepts zod-parsed owner payload, rejects wrong tag; ⊥ `nullable` (type arrays). T11 ! keep default `reused:'inline'` (`'ref'` → `__schemaN` noise). Gaps for T11: `textSchema` input side renders bare `{type:string}` (pipe input ⊥ min/max) → add `minLength`/`maxLength` via `.meta({override})` in `textSchema`; output `z.object` renders `additionalProperties:false` → T11 decides (override off for responses keeps additive changes non-breaking for generated clients); refines ⊥ representable (expected).
- S-b `@dnd-kit/core` 6.3.1 + `sortable` 10.0.0 ✓ under React 19.3.1 StrictMode (⊥ fallback `@dnd-kit/react`): keyboard (Space, arrows, Space; focus stays on handle), mouse, touch long-press (`TouchSensor {delay:200, tolerance:8}` via CDP touch + `page.clock.runFor`), quick swipe ⊥ drag. ! `<DndContext id={useId()}>`: module counter `aria-describedby="DndDescribedBy-N"` ≠ server → hydration mismatch. KeyboardSensor attaches keydown one task after pick-up → key pressed same ms dropped: e2e ! assert live region (`[id^="DndLiveRegion"]`) per key (retry via `expect().toPass`), ⊥ timeouts. Handle `touch-action:none`.
- S-c `downshift` 9.5.0 `useCombobox` ✓ under StrictMode: type-filter, arrows + `aria-activedescendant`, Enter selects + closes, click option.
- S-d ✓ build + dev: `next-intl` 4.15.1 plugin (`createNextIntlPlugin('./src/i18n/request.ts')`), `proxy.ts` = `createMiddleware(routing)`, `i18n/request.ts` reads `locale` from `next/root-params` (⊥ `setRequestLocale`: deprecated), `[locale]/layout.tsx` `hasLocale` else `notFound()` (unknown locale → 404), `<NextIntlClientProvider>` w/o props inherits; nuqs `NuqsAdapter` from `nuqs/adapters/next/app`; `/` → `Accept-Language` (en-US → `/en`, de-DE → `/pt-BR`). nuqs writes URL async (throttled): tests ! await URL before Back; `place` push / `day`,`mode` replace verified. T19 ! set `timeZone:'UTC'` in request config (default = server TZ). `next/root-params` ⊥ in Route Handlers/Server Actions/client.
- S-e ✓ `(public)/places/[placeId]` + `(app)/places/[placeId]/review` (+ `(app)/layout.tsx`) coexist under one `[locale]` root; client nav between them OK.

### Deviations from critic (one line each)
- CD1: i18n namespace `legal` added (about/privacy pages the critic requested had no namespace).
- CD2: `DELETE /me/blocks/{userId}` and `DELETE /places/{placeId}/reviews/mine` → 204 even when nothing to delete (rulebook: DELETE idempotent); critic kept API's 404.
- CD3: `problemDetailsSchema.code` required string (+ optional `currentPlanVersion`, `tripPlaceId`) instead of optional/loose; `errorCodeSchema` enum types API side.
- CD4: session cookie name chosen by `COOKIE_SECURE` (default true iff `NODE_ENV=production`), not `NODE_ENV`, so e2e production builds on http://localhost work (`__Host-` needs Secure).
- CD5: `TripAccessService`, `RatingSummaryReader`, block filter, `PlaceResolver`, cursor codec owned by `[core]` (`apps/api/src/core/**`, `apps/api/src/providers/core/**`) for disjoint ownership; contract unchanged.
- CD6: `FAKE_PROVIDER_FAILURE` env dropped: fake fault injection = constructor option only (⊥ reachable via env/HTTP); e2e provider-down journey stubs `/api/v1/**/route` in browser.
- CD7: report `POST /reports` 201 carries `Location: /api/v1/moderation/reports/{id}` (rulebook 201+Location; no public report GET).
- CD8: deleting a day that still has stops asks confirmation (`<dialog>`) instead of Undo (re-creating day + stops is not one inverse call); empty day deletes immediately.
- ID-T8: extra deps beyond T8 list: web `server-only` (TS 6 `noUncheckedSideEffectImports` default on), `@dnd-kit/utilities` (direct `CSS` import, pnpm strict), web dev `pg` + `@types/pg` (T23 globalSetup; both now `catalog:`); `undici` ^7.30.2 ⊥ 8 (= Node 24.15 bundled undici 7 → `MockAgent` global dispatcher interop); `allowBuilds` `@swc/core`/`@parcel/watcher` false (next-intl deps, prebuilt binaries); `console.*` in `main.ts`/seed/`init-env` → `process.stdout|stderr.write`.
- ID-T10: additive shared exports beyond §I.shared: `ERROR_STATUS` (code → status), `implicitErrorCodes(def)`, `THROTTLE_NAMES`, `EndpointDef.alternateStatus` (E46 200), `EndpointRequest<E>` (z.input), `pageQuerySchema(size)`, `lngLatInputSchema` (strict), `tripDestinationSchema` (output; `destinationSchema` = input), `placeResultsSchema` (E42/E43 `{items}`), `placeReviewsQuerySchema` (E45), `shareTokenSchema`, `currentPasswordSchema`; `ref.osmId` = positive safe int. CD3 `code` required → `apps/api/src/http/problem-details.filter.ts` (typecheck) + `apps/web/src/lib/api/query-client.test.ts` (typecheck) + `apps/web/src/components/health/health-status.test.tsx` (fixture) lack `code`: red until T14/T20 owners add it.
- ID-T11: S-a gaps closed: `textSchema`/`emailSchema` restate bounds via `.meta({override})`; response objects drop `additionalProperties:false` (createDocument override, `io:'output'`) so additive fields stay non-breaking; `reused:'inline'` kept. `openapi:generate` Prettier-formats `openapi.json` → drift test compares parsed JSON, ⊥ bytes. Subpath exports `@heremita/shared/openapi` + `@heremita/shared/openapi.json`.
- ID-T12: `prisma migrate dev` refuses non-TTY → `20261118160412_v1_model/migration.sql` = `prisma migrate diff --from-config-datasource` (dev DB at `init`) `--to-schema` + §I.data.sql, applied via `migrate deploy`; `20261118144214_init` kept (unshipped but already applied to dev DB; v1_model drops `placeholders`) → 2 migrations, ⊥ 1.
- ID-T13: saved T7 Photon bodies had ⊥ Paris + ⊥ `lang=en` → 116 new bodies (58 queries × `lang=default|en`, 1.2 s apart) in `apps/api/test/fixtures/upstream/responses-seed/` (+`requests.log`); one-off generator (reference mapper; deleted in T78) → `gazetteer.ts` 58 places, `localized: Record<Locale,{name,label,address}>` + `GAZETTEER_KEYS`. `seedDatabase(prisma, env)` parses `NODE_ENV`/`DEMO_PASSWORD` itself (throws `SeedRefusedError` in prod); keeps stored hash while it verifies (run twice → identical rows); canonical places upserted by OSM ref (user-added row keeps its id). `DEMO_PASSWORD` added to `apps/api/.env.example`.
- ID-T19: env = `env.schema.ts` (hand validators, web ⊥ direct `zod` dep; run by `next.config.ts` → build fails) + `env.ts` (server-only) + `public-env.ts` (`NEXT_PUBLIC_*` inlining; map styles may be `/`-paths for e2e); `next` guard `isSafeNextPath` plain fn in `lib/routes.ts` (also ⊥ `\`); CSP builder `src/csp.ts` (proxy imports); dev `style-src 'self' 'unsafe-inline'` ⊥ nonce (nonce → browsers ignore unsafe-inline → dev styles blocked); browser zod JIT off: `lib/zod-jitless.ts` calls `disableZodJit()` (`@heremita/shared/zod-config`, public `config({jitless:true})`) imported first by the only zod doors `lib/schemas.ts` + lazy `lib/api/problem-schema.ts` (zod's `Function("")` probe = CSP violation; `instrumentation-client.ts` gone → zod ⊥ every route); web ⊥ direct `zod` dep kept (audit); ESLint `no-restricted-imports`: web values ⊥ `@heremita/shared` root (types ok) → `/plain` (consts, option arrays, `cleanText`), `/api-routes` (`apiRoutes` {name, method, path}), schemas via `@/lib/schemas`; signed-in `data-theme`, header viewer + switcher PATCH E9 wiring → T20/T22 (need `getViewer`); `[locale]/[...rest]/page.tsx` → localized 404; Next 16.4 serves `notFound()` as error shell + client render (status 404) → theme script ⊥ runs on 404 pages; `AppBar` + `Toaster` (store + one polite live region, `announce()`) built here, T21 adds tests/polish.
- ID-T21: icons = `shared/icons/{icon,icons}.tsx` (paths from lucide-static 0.460.0, `LICENSE`); `offline-banner` presentational (`online` prop) → T20 renders it w/ `useOnline()`; `dialog/` also exports `ConfirmDialog` + `initialFocus` marker (`data-initial-focus`); RTL helper `src/test-utils/render.tsx` (`renderWithIntl` + user-event); `vitest.setup.ts` polyfills `showModal`/`close` (jsdom lacks them); token `--color-backdrop` added; `common.password.*` keys; toast held while hovered/focused.
- ID-T14: E14 `errors` += `user_not_found` (malformed path id → 404; unit test asserts every path param's 404 code ∈ `def.errors`), openapi regenerated; `GEOCODING_PROVIDER`/`ROUTING_PROVIDER` required (⊥ default), `apps/api/vitest.config.ts` `test.env` forces fake + Nominatim off; `PUBLIC_SITE_URL` unset outside prod → `http://localhost:3100`; problem filter moved to `apps/api/src/core/http/` (`src/http` gone); nestjs-pino keeps ONE root logger per process → log-capturing tests in own file (`test/logging.test.ts`, override `PARAMS_PROVIDER_TOKEN` w/ `loggerParams(env, stream)`); `NODE_ENV=test` w/o capture stream → level `silent`; access line = `{reqId, method, route, status, userId, responseTime}` at `info`, ⊥ req/res objects; guard order in `app.module.ts` providers: `CsrfGuard`, [T16 `SessionGuard` here], `AppThrottlerGuard`.
- ID-T15: blocklist vendored as `apps/api/src/core/password/common-passwords.ts` (`COMMON_PASSWORDS`, MIT notice in header) ⊥ `.txt` (tsc dev build copies no assets); only 10 entries ≥ 12 chars matter today; `TripAccessService.resolve(ref, viewer) → {tripId, role} | null` (token routes need the id) + `require()` → 404 `trip_not_found`, pure rule `decideTripAccess` in `core/trip-access.ts`; block filter = `andAuthorNotBlockedBy(viewerId, Prisma.raw(col))` (raw SQL) + `userNotBlockedBy(viewerId)` (Prisma `where` on author/owner relation); cursor = `CURSOR_TUPLES` + `encodeCursor`/`decodeCursor` (timestamps → `Date`) + `toPage(rows limit+1)`; rating `average` unrounded (UI formats); seed now imports `hashPassword`/`verifyPassword`.
- ID-T20: `lib/api/request.ts` = shared `endpointPath` + `RequestArgs<E>` (options omittable when every part optional); non-problem non-2xx → `HttpError {status, requestId}` (`ApiProblemError` adds `requestId`, `retryAfterSeconds`, `code`, `fieldErrors`, `currentPlanVersion`, `tripPlaceId`); 401 redirect only for code `unauthenticated` (⊥ `invalid_credentials`) via `makeQueryClient(navigation?)` (browser: `window.location.assign`, full load) + `isPublicPath`/`loginRedirectFor` in `lib/routes.ts`; query factories `*Query()` in `query-keys.ts` (+ prefix keys for invalidation); `getViewer` skips API w/o cookie; layout `data-theme={viewer?.theme}` (`getViewer().catch(() => null)`); `OfflineStatus` in root layout (banner + live-region announce, key `common.onlineAgain`); `dates.ts` + `addDays`; ['viewer'] seeding from RSC, header viewer, switcher PATCH E9 → T22/T67; msw 3 option = `onUnhandledFrame` (⊥ `onUnhandledRequest`).
- ID-T16: E8 `GET /me` lives in `apps/api/src/auth/auth.controller.ts` (T30 adds E9–E11 in `me/`, importing `AuthModule`); `AuthModule` exports `SessionService` (`rotate(sessionId)`, `deleteOthersOf(userId, keep)`, `deleteAllOf`) + `SessionCookies` (`set(res, session)`, `clear(res)`) for E10/E11; `auth/me.mapper.ts` exports `toMe`/`ME_SELECT`/`toDbLocale`/`fromDbLocale`; `SessionGuard` = `APP_GUARD` `useExisting`, skips session lookup when `auth:'none'`; cookie written by hand (`Max-Age` floored, ⊥ `Expires`: Express derives it from system time ⊥ `CLOCK`), read w/o `cookie-parser`; login 429 checked before password verify (right password inside window → 429, after window → 201); purge job = unref'd `setInterval` in `core/jobs/purge.job.ts` (⊥ `@nestjs/schedule`), `run()` public for tests; integration tests key per-IP throttles via distinct `X-Forwarded-For` (trusted loopback hop).
- ID-T17: provider `PlaceResult` = `providerPlaceSchema` in `providers/core/contract.ts` (shared PlaceResult ⊥ `placeId`/`rating` + `osmKey`/`osmValue`); `SearchQuery.limit` + `ReverseQuery.{radiusMeters,limit}` required (service applies defaults); `ProviderError` + `retryAfterSeconds`; selection = `ProvidersModule.forRoot({photon?, nominatim?, osrm?})` (adapter factories get `{env, outbound, cache}`) registered in `app.module.ts` → T40/T42 ask `[core]` to register theirs; selected-but-unregistered adapter → boot error `ProviderSelectionError` ∴ `apps/api/.env.example` (+ local `.env`) set `GEOCODING_PROVIDER=fake`/`ROUTING_PROVIDER=fake` until T40/T42 flip back; token `PLACE_LOOKUP` = Nominatim iff enabled, else geocoder's own `lookup` (fake), else `null`; resolver lookup miss/failure → 503 `geocoding_unavailable` (E29 has ⊥ `place_not_found`); `place:v1:<key>` stays provider-neutral (table) — the only key ⊥ provider id; prod fake refusal = env schema refine (`logger-params.test.ts` fixture + `ALLOW_FAKE_PROVIDERS`); outbound `get({host:'photon'\|'nominatim'\|'osrm', url, autocomplete?, signal})` resolves 2xx + 4xx ≠ 403/429 as `{status, body}` (adapters map OSRM 400s), `autocomplete` = 4 s, ⊥ retry, ⊥ token wait, throws for nominatim; 403 pause applies to every host; breaker counts per attempt; single-flight aborts upstream only when every caller left; lockdown = Vitest `setupFiles` `test/support/network-lockdown.ts` (Node 24.15 global fetch honours undici 7 `MockAgent`, verified); `PHOTON_INCLUDE` (category → Photon `include`) left to T40 (Photon vocabulary); fake geocoder matches names in both locales, prefix rank on shown name.
- ID-T22: layouts cannot read the URL → `proxy.ts` sets request header `REQUEST_PATH_HEADER` (`x-heremita-path`, path + query; const in `lib/routes.ts`), `ViewerGate` (`features/auth/viewer-gate.tsx`) validates it as `next`; gate seeds `['viewer']` via `HydrationBoundary`; `(app)/layout.tsx` = gate only; site chrome = `[locale]/layout.tsx` `SiteChrome` (client: header + footer except trip screens = last segment is `tripId` ∨ `shareToken` param → planner, `/t`, `/s` own app bar; one copy of header client code in layout chunk); `SiteHeader` takes no prop, reads `getViewer()` itself (signed in: "My trips" + `AccountMenu` = name button → native `popover="auto"` w/ Settings + `LogoutButton`), `not-found.tsx` updated; `(auth)/layout.tsx` redirects signed-in → `/trips`, noindex; `safeNext()` in `lib/routes.ts`; login success → `next ?? /<locale>/trips`; success = `setQueryData(['viewer'])` + `router.replace` + `router.refresh()` (root layout `data-theme` re-renders); logout = `apiFetch` (⊥ mutation: global 401 handler) → 401 counts as logged out → `queryClient.clear()` + `/<locale>`; server 422 field errors shown w/ localized per-field text (API `detail` English).
- ID-T23: Playwright starts `webServer` BEFORE `globalSetup` ∴ `heremita_e2e` drop/create (`WITH (FORCE)`) + `db:deploy` + `db:seed` = `e2e/support/prepare-database.ts`, first step of api webServer command (⊥ globalSetup); e2e api build = `tsc -p tsconfig.build.json --outDir dist-e2e` (`nest build` `deleteOutDir` wipes dev `dist/`), web e2e build `distDir: '.next-e2e'` when `NEXT_PUBLIC_E2E`; `pnpm e2e` = mobile + desktop chromium, `pnpm e2e:webkit` separate (non-blocking; green 3/3), `e2e:install` += webkit; `SecurityHeadersOptions.httpsOnly` (= ¬dev ∧ ¬`NEXT_PUBLIC_E2E`) gates `upgrade-insecure-requests` + HSTS (WebKit upgrades http://localhost assets → TLS fail); temp `[locale]/page.tsx` = `notFound()` (Next's built-in `_not-found` for `/pt-BR` is prerendered → scripts ⊥ nonce → V54 fails) → T55 ! delete it when adding `(public)/page.tsx`; signup throttle 5/h/IP → fixtures send per-test/per-worker `X-Forwarded-For` (trusted loopback hop, Next rewrite appends); fixtures `test`/`signedInTest`/`expectAccessible`/`uniqueEmail` in `e2e/support/fixtures.ts`; MSW `setupApiServer`/`onEndpoint`/`respondWith`/`failWith`/`networkErrorOn`/`buildMe`; `renderWithProviders` → `{user, queryClient, urlUpdates}`; `TestIntlProvider` exported from `src/test-utils/render.tsx`; vitest includes `test/**`; lint bans `waitForTimeout` in `e2e/**`.
- ID-T18: support adds `test/support/{http,authz-world,pending-endpoints}.ts`; `authz-matrix.test.ts` `MATRIX` satisfies `Record<EndpointName, Case[]>` (compile + runtime completeness: 401 anon ∀ session endpoint, non-owner 404 ∀ `{tripId}` path, ≥ 2 nested IDOR cases ∀ `{dayId|stopId|tripPlaceId}` path, 403 ∀ moderator endpoint); one `AuthzWorld` per endpoint row; case runs iff endpoint ∧ its `needs` (endpoints that build its world; `blockUser` for actor blocker) ∉ `PENDING_ENDPOINTS`, else `it.todo` ∴ a task removing ids ! run the matrix; list checks by ids ⊥ counts (canonical places + public feed shared by all rows of the file); route-throttled rows ≤ 5 calls per actor.
- ID-T33: reuse ∈ `apps/api/src/trips/`: `trip.mapper.ts` (`TRIP_SELECT`, `toTripOwner`, `toTripPublic` → E24/E26 trip part), `PreviewPointsReader` (exported by `TripsModule`); `previewPoints` = stops in visit order (day, position) then ideas, ≤ 20; `PublicTripsReader.page({viewerId, ownerId, …})` exported by `DiscoveryModule` → E16 = same query w/ `ownerId`; `copiedFrom` rule applies to owner shape too; `defaultMode` bump only when value differs; private keeps its `share_token` (dead via access rule); E21 = one raw `UPDATE`; copy = one data-modifying-CTE statement after user-row `FOR UPDATE` (limit race) + source `FOR SHARE`; test helper `apps/api/test/trips/plan-rows.ts` (direct plan rows).
- ID-T30: E12 order `(created_at DESC, blocked_id DESC)` (newest block first; repeat PUT keeps first `created_at`); E13 self check before existence (self → 422 even though row exists); E15 counts = what E16/E17 show that viewer (block filter → 0; author counts own hidden reviews); E16 = `PublicTripsReader` w/ `ownerId` (`UsersModule` imports `DiscoveryModule`) after 404 check; E10 also rejects new password = e-mail ∨ local part (422 `/body/newPassword`, server-side: shared refine ⊥ exported) + sets `password_changed_at`; E9 updates via `updateManyAndReturn` (user gone → 401); T32 CLI = plain script `src/me/cli/main.ts` (⊥ Nest boot; reads `DATABASE_URL` only), logic `resetPassword(prisma, clock, email)` in `reset-password.ts` (one tx: hash + `password_changed_at` + delete sessions; 24-char base64url temp pw), exit 0 ok / 1 unknown or malformed e-mail / 2 usage; account-test content rows via `apps/api/test/users/content.ts` (direct Prisma).
- ID-T50: rich components take every visible/SR string as props (callers translate in own namespace; only `DemoBadge` reads `common.demoBadge`) ∴ ⊥ new message keys; SortableList pointer sensor = `MousePenSensor` (`PointerSensor` ignoring `pointerType:'touch'`, distance 4) so touch stays w/ `TouchSensor` 200/6 (quick swipe scrolls); row handle = `<DragHandle label>` (context, ⊥ prop threading); dnd-kit own live region kept (e2e selector) + `announcements` callbacks + localized `roleDescription`; BottomSheet controlled (`snap` + `onSnapChange`), peek/full px read from its CSS `min-height`/`max-height`, focus entering body at peek → half; RatingInput = `fieldset role="radiogroup"` (`aria-invalid` on group: radios ⊥ support it); PopoverMenu anchored via CSS anchor positioning, fallback bottom strip; test helper `shared/hooks/match-media.test-support.ts` (`installFakeMatchMedia`).
- ID-T53: `MapContext`/`useMap`/`isMapAlive` in `shared/map/map-context.ts` (⊥ maplibre runtime → layer components importable w/o map chunk; only `map-view.tsx` via `TripMap` + `DraftPin` dynamic `import('maplibre-gl')` load it); `useMap()` → `MapHandle {map, theme, fonts, styleRevision}` (resolved theme, glyph font stack or `null` when style has ⊥ `glyphs` → ⊥ number/count layers, e.g. e2e blank style; `styleRevision` ++ per later `style.load` → children reapply feature-state); `MapView({initialView:{center,zoom}|{bounds}, label?, cooperativeGestures?, geolocate?, className?})`, children render only after `load`; style switching in `basemap-controller.ts`; fallback before first `load` = `setStyle(fallback, {diff:false, transformStyle: undefined})` (a transform waits forever on the failed style); theme from `<html data-theme>` (MutationObserver) + `useMediaQuery` for system; `NavigationControl` (zoom, ⊥ compass) top-right; ctrl buttons 44 px via CSS; DraftPin = maplibre default marker (accent teardrop, built-in arrows 1 px / Shift 10 px, `role=button`) ⊥ crosshair glyph; long-press = `<LongPressHandler onLongPress>` + `consumeLiftClick(map)`, PinsLayer owns the map `click` (pin → `onSelect(id)`, empty → `onSelect(null)`, cluster → expand); estimated legs = own dashed layer over shared casing; helpers `fitToPoints(map, points)`, `decodePolyline5`, `boundsOf`, `cameraDuration`; fake map for RTL `shared/map/testing/{fake-maplibre,render-map}` (`vi.mock('maplibre-gl', () => import(...))`, `renderInMap`, `defineTokens`, `setPageTheme`); `messages/*/map.json` filled by ws-web-map.
- ID-T55: trip forms (`features/trips/{trip-form,trip-details-form}`) take the destination search as `renderDestination(picker)` composed in `app/` (features ⊥ import each other); destination hint + error are sibling `<p>` (PlaceSearch has ⊥ hint/error props); create form dates = SegmentedControl "Sem datas" (Número de dias 1–60) | "Com datas" (first + last day → `dayCount`); trip writes disable submit offline (mutations pause, ⊥ silent queue); settings: "Gerar novo link" asks confirm (old link dies), `CopyTripButton({source:{tripId}|{shareToken}})` covers E25 + E28 for T62; Explore `?q=` = `next/form` GET (`replace`, works w/o JS) ⊥ nuqs; `PublicTripFeed` takes the infinite query result (E48/E16); landing/explore/profile layouts + chrome own (no `(public)` layout); temp `[locale]/page.tsx` deleted.
- ID-T63: `features/place-search/index.ts` exports `PlaceSearch` (+ `intent`, `showLabel`, `defaultValue`, `onInputChange` for T55 destination) + `WhatsHereCard` (custom-name step inside card, `onAddCustom({name, location})`), downshift direct (⊥ shared combobox); E42/E43 failure kinds `geocoding-failure.ts`; BlockUserButton → `BlockUserDialog` opened from ReviewItem `PopoverMenu` (dialog inside popover hides w/ it); `ReportDialog({target:{type,id}})` reusable by T62 via `app/`; E44 loader `features/reviews/load-place.ts` (`cache`, 404 → `notFound()`) shared by both place routes; place/review/moderation pages own `layout.tsx` w/ SiteHeader+SiteFooter (no `(public)` layout exists); moderation queue `refetchOnMount` off when RSC page given (staleTime 0); review delete = confirm dialog (⊥ Undo).
- ID-T45: E46 = one `INSERT … ON CONFLICT (place_id, author_id) DO UPDATE … RETURNING (xmax = 0)` (created → 201 + `Location`; replaced → 200, ⊥ `Location`); replace keeps moderation `status` (edit ⊥ undoes hide), rewrites `language` = caller locale, `created_at`/`updated_at` from `CLOCK`; future `visitedMonth` → 422 `validation_failed` `/body/visitedMonth` (UTC month); E45 = published ∨ own, `author` not blocked; reuse `apps/api/src/reviews/review.mapper.ts` (`REVIEW_SELECT`, `toReview`, `toVisitedMonth`) for E44 `myReview`.
- ID-T46: E49 trip visible = `visibility ∈ {link,public} ∧ ¬moderation_hidden_at` by id (link reader has the id from `/s` page → T62 report link works) ∨ own; review visible = published ∨ own; own check after visibility (own private trip / own hidden review → 422); blank `details` → NULL; any P2002 → 409. E51 content change via raw SQL (⊥ bump `updated_at` of review/trip); decided report always re-resolved (re-decision allowed: restore from `actioned` queue) + other `open` reports on same target; `excerpt` = first 200 UTF-16 units ⊥ split surrogate.
- ID-T40: adapters `PhotonGeocoder`/`photonAdapter` (`providers/photon/photon.geocoder.ts`) + `NominatimGeocoder`/`nominatimAdapter` (`providers/nominatim/nominatim.geocoder.ts`: `lookup` + submit-only `search`), each caches its own `geo:v1:` entry under the canonical URL; `PHOTON_INCLUDE` in `photon.mapper.ts`; Nominatim `/lookup` sends `addressdetails=1` ⊥ `extratags=1` (address + `countryCode` for the places row; extratags unused, G4); Nominatim label = `display_name` minus its name; `[core]` registers `ProvidersModule.forRoot({photon: photonAdapter, nominatim: nominatimAdapter})` + `test:live` = `tsx --env-file-if-exists=.env test/places/live-providers.ts` (Photon search + Nominatim lookup iff enabled; T42 adds OSRM). T41: submit fallback = `SEARCH_FALLBACK` token in `PlacesModule` (`nominatimAdapter` iff `NOMINATIM_ENABLED`, shares `OutboundClient` buckets), rule + merge in `places/search-fallback.ts` (fold-insensitive name ⊇ q; fallback hits first, dedupe, cap `limit`; fallback failure → Photon results kept); E43 re-sorted by haversine; enrichment = one `unnest(types, ids) JOIN places LEFT JOIN reviews GROUP BY` query; E44 `inMyTrips` order trip `updated_at DESC`; client disconnect ⊥ aborts upstream (no request signal).
- ID-T42: OSRM adapter `apps/api/src/providers/osrm/{osrm.schemas,osrm.mapper,osrm-router}.ts`, factory `osrmAdapter` → `[core]` registers `ProvidersModule.forRoot({osrm: osrmAdapter})`; Ok w/o `geometry` → `bad_response` (we always ask `overview=full`); `DayRoute.modeOverride` = `mode` query echoed (null w/o it) ⊥ `day.modeOverride`; leg `unroutable` = snap rule ∨ stop named by OSRM `NoSegment` (`stopIndex`), provider down/throttled → estimated ∧ ¬unroutable; `attribution` = `OSM_ATTRIBUTION`; routed legs upserted by one awaited `setMany` after provider answers, before HTTP answer (⊥ tx); day ∉ trip → 404 `not_found` (E27/E40/E41); E41 non-owner (even public trip) → 404 `trip_not_found`, `estimated` = any leg of before ∨ after estimated, before routed first so after reuses its cached legs.
- ID-T36: plan lock `updated_at = <Clock now>` (⊥ DB `now()`: FixedClock tests order E18 by it); `writeDayOrder` phase 2 also `SET day_id = $1` scoped by the day's trip (⊥ `s.day_id = $1`) so a cross-day E37 = source rewrite then target rewrite; days writer = `writeTripDayOrder`; E30 = `holdPlan` (`SELECT … FOR UPDATE` on trip, same lock order) then bump only if pin moved; E29 checks ownership before resolving (stranger ⊥ costs a lookup), duplicate check before insert (⊥ P2002 inside tx); E24/E26 = access + 4 reads in one `RepeatableRead` batch + ratings + leg cache (one each); E36 409 `currentPlanVersion` = pre-lock version; V20/V23 loops call `StopsService` directly (per-user 120/min throttle), HTTP paths covered per endpoint.
- ID-T59: plan mutation toasts = localized per-action copy (⊥ API `detail`, English) + one action (Retry or Undo: toast store holds one, ∴ "Alterar" ⊥; day = card "Dia ▾"); `usePlanMutation` (`features/itinerary/use-plan-mutation.ts`) invalidates plan only when it is the last queued edit of the trip (`isMutating === 1`, else refetch hides queued optimistic edits); E29 409 `place_already_in_trip` handled inside `mutationFn` (→ E35 or select); Undo of delete-from-trip = E29 + E35 per extra stop in one mutation; optimistic rows use `pending-N` ids (pins `saving`, controls off); chip switch clears `place` in the same replace; card replaces list (phone + panel) ∴ row `scrollIntoView` moot; "Add here" = `DraftPin` following map centre (moveend 400 ms) ⊥ CSS crosshair; app bar ⋯ = link to trip settings (PopoverMenu links open new tab); `loadPlan` (`features/itinerary/load-plan.ts`) returns `{plan, fetchedAt}` for T62.
- ID-T60: visible days' route (E40/E27) always fetched when ≥ 2 stops (⊥ only on null summary legs: summaries lack polylines, map needs them); route key `mode` = URL mode only when ≠ day's saved mode (else `null`); "Todos" fetches every day w/ ≥ 2 stops (route throttle 5/2.5 s → beyond 5 days some 429 → those days drawn as dashed estimates); day mode change ⊥ optimistic on plan (URL shows it; saved mode arrives w/ bumped `planVersion`, else old route reused under new mode); stale (placeholder) route only on map (dimmed), list shows summary/"Calculando…"; client straight-line estimate after route error duplicates API constants in `features/itinerary/day-route.ts` (⊥ shared helper); Apple hand-off = `https://maps.apple.com/directions?source&destination&mode=walking|cycling|driving`; `partial` banner names stops whose every adjacent leg is `unroutable`; T61 preview = `<dialog>` all widths, plan_changed toast ⊥ Retry (`usePlanMutation.canRetry`); T62 copy CTA in app bar w/ short label "Copiar"/"Copy" (360 px), `?copy=1` resume = `useCopyTrip` hook (`features/trips/use-copy-trip.ts`) run once iff tab marker `sessionStorage['hm-copy-intent']` (set on signed-out Copy, `copy-intent.ts`) matches; crafted `?copy=1` alone ⊥ copy, author byline + report link in panel body.
- ID-verify-workstreams: `app.module.ts` registers `ProvidersModule.forRoot({photon, nominatim, osrm})` (`.env.example` back to photon/osrm; `providers-module.test.ts` asserts real adapters wired + refusal via unregistered `forRoot({})`); api scripts `test:live` + `cli` added; authz matrix review rows target the owner's reviewed place (`reviewedPlace`, builds `w.reviews()` first); `AccountMenu` shows a Moderation link when `viewer.role = 'moderator'` (key `auth.account.moderation`; ⊥ in §I.web.screens, /moderation otherwise unreachable).
- ID-T70: About + Privacy also name VersaTiles (basemap fallback, browser fetches its tiles → sees IP) + credit Lucide icons (ISC); web ⊥ knows `NOMINATIM_ENABLED` ∴ Nominatim worded "only when this installation turns it on" (⊥ new web env); shell `LegalPage`/`LegalSection`/`LegalList`/`externalLink`, `ContactSection`, `SERVICE_LINKS` in `(public)/about/_components/`, privacy imports them; content = sync components (`AboutContent`, `PrivacyContent`, prop `contactEmail`) RTL-tested, pages pass `env.CONTACT_EMAIL`; privacy deletion link → `/settings#account`; footer links existed (`site-footer.tsx`).
- ID-T72: journeys run on mobile + desktop chromium (long-press = CDP touch on mobile, right-click twin on desktop; reorder = row menu on mobile, drag on desktop); data arranged via API (`e2e/support/api.ts` `ApiClient`/`arrangeTrip`), each journey own account (`accountTest`, `makeAccount`), extra people = `openContext` (same network + CSP guards); long-press test emulates reduced motion (page clock also holds CSS transitions); controlled radios clicked via `checkOnceHydrated` (pre-hydration click lost); `next build` type-checks `e2e/**`. App fixes: map container collapsed to 0 px in prod CSS order (`.map > .canvas`), PlaceSearch lost keys + wiped first edit after a pick (downshift 9 reports `inputValue` from an effect), settings nav got a client reference for `PREFERENCES_ANCHOR` (→ `features/settings/sections.ts`), sheet body keyboard-focusable (axe `scrollable-region-focusable`).
- ID-T76: vitest catalog 5.1.1 (lock: only vitest + `@vitest/{mocker,spy}`); default parallelism ⊥ reliable even idle (load ≤ 3.5): API integration on 7 workers + PG share 8 cores ∧ root `pnpm --recursive` ran api ∥ web → V17 random-sequence + V20 fifty-times tests (~1.5 s alone) pass 5 s timeout (fail 3/3 concurrent idle runs, ⊥ only under load) ∴ `apps/api/vitest.config.ts` `maxWorkers: 2` + root `test` = `--workspace-concurrency=1` (green 4/4 idle, ~41 s wall); per-test timeouts ⊥ raised (symptom).
- ID-T73: `--sheet-peek` 148 px ⊥ 136 (handle 44 + chip row 4+44+4 + summary 44 + header pad 8; 136 clipped summary + day ⋯); phone search pill stops short of map control column (zoom + locate stay top-right, attribution moves below pill); `.floating` top = max(mid visible map, below control column) ∴ "Adicionar aqui" ⊥ covers "Minha localização" on short phones; SegmentedControl = inline-grid equal `1fr` columns (flex basis 0 squeezed icons); checks in `e2e/a11y-mobile.spec.ts` (widths, 44 px + uncovered targets, input font, icon size, headings, peek, focus order + ring, reduced motion, planner list SR tree) + `shared/styles/motion-rules.test.ts`; spacing ≥ 8 px ⊥ asserted (see T73 for_owner).
- ID-T74: `pnpm shortcuts` = node script ⊥ grep (sh brace expansion ⊥ portable; grep also hit SPEC/README quotes + missed block-comment markers silently) ∴ skips `*.md`, validates V74 form; ledger review: §C signup + OpenTelemetry markers missing in code → added (`features/auth/viewer-gate.tsx`, `core/logging/logger-params.ts`); `openapi.json` = HEAD `d0b2710`, ⊥ release tag yet ∴ current doc = v1 baseline (README: diff vs last tag before release); design docs' operational knowledge moved to README.
- ID-final-verify: T73 x on automated parts (`e2e/a11y-mobile.spec.ts`, `tokens.test.ts` contrast pairs, `motion-rules.test.ts`); owner still owes manual pass on one real iPhone + one Android + 8 px target spacing review (V56 ⊥ asserted). T75 x: Photon search + OSRM routes ✓ live (prior run); `SortableList` via `next/dynamic` in `stop-list.tsx` ∴ dnd-kit (15.6 KB) ⊥ first-load; `pnpm budget` (`apps/web/scripts/bundle-budget.ts`, exit 0 always) → every route over (212–273 KB, numbers in README); device pass + search ranking + CSP/VersaTiles sweep → README "Manual checks for the owner".
- ID-i18n-en-es: owner decision 2026-11-19: official lang = English, translations es + pt-BR (was pt-BR default + en). Locales `en` (default) / `es` (neutral, code exactly `es`) / `pt-BR`, order en, es, pt-BR; URLs always prefixed, unprefixed → cookie → best `Accept-Language` → `/en`; signed-in saved locale still wins; sign-up locale = route locale; DB `Locale` += `es`, default `en` (migration `20261119125830_locale_es_default_en`, existing rows kept); seed demo login English, Diego Spanish; e2e mostly en, `walking-skeleton` pt-BR, `sharing` es, settings switch en → es → pt-BR.

### CI/CD (T79, 2026-11-19)
- CI `.github/workflows/ci.yml`: push + PR → `main`; concurrency per ref, cancel superseded. Jobs parallel (e2e builds own servers ∴ waiting = slower answer): `checks` (install `--frozen-lockfile`, `env:init`, `heremita_test`, typecheck, lint, format:check, shortcuts, build, budget `continue-on-error`, test) ∧ `e2e` (Chromium cached per PW version, `pnpm e2e` as local, report artifact on failure). Each job own `postgres:18` service on `localhost:5434` heremita/heremita ∴ `.env.example` + e2e env unchanged. Node ← `.node-version`, pnpm ← `packageManager`.
- CD: ⊥ GitHub deploy job, ⊥ secrets. API: `render.yaml` `autoDeployTrigger: checksPass` (⊥ deprecated `autoDeploy`) → Render deploys `main` commit only when all GitHub checks success/neutral/skipped. Web: Vercel Git integration + Deployment Checks (GitHub: `checks`, `e2e`) → prod alias only after green. Job rename ! update Vercel checks. Migrations: `db:deploy` at head of Render `startCommand` (free plan ⊥ pre-deploy) ∴ every migration ! compatible w/ previous release; rollback ⊥ reverts schema → forward migration.
- Dependabot: npm (pnpm) + github-actions weekly, minor+patch grouped, majors alone, `cooldown` 2 d (pnpm 11 `minimumReleaseAge` 24 h).

## §I interfaces

### I.env — environment (zod-validated at boot; fail fast w/ list of bad vars)
API `apps/api/src/config/env.ts` (dev values in `apps/api/.env.example`, copied by `pnpm env:init`):

var|type / default|note
---|---|---
`NODE_ENV`|`development\|test\|production`, default `development`|exists
`PORT`|int, default 3101|exists
`DATABASE_URL`|postgres URL|exists; dev `postgresql://heremita:heremita@localhost:5434/heremita`
`TEST_DATABASE_URL`|postgres URL, db name ends `_test`|tests only; exists
`WEB_ORIGIN`|URL, default `http://localhost:3100`|CSRF Origin match (exact)
`PUBLIC_SITE_URL`|URL ! set in prod; dev default `http://localhost:3100`|UA + Referer to providers
`COOKIE_SECURE`|bool, default `NODE_ENV==='production'`|true → cookie `__Host-hm_session` + `Secure`; false → `hm_session`
`TRUST_PROXY`|string, default `loopback, uniquelocal`|`app.set('trust proxy', …)`; prod proxy ! overwrite `X-Forwarded-For`
`LOG_LEVEL`|`fatal\|error\|warn\|info\|debug`, default `info`|
`GEOCODING_PROVIDER`|`photon\|fake`|
`ROUTING_PROVIDER`|`osrm\|fake`|
`AI_PROVIDER`|`claude\|fake\|off`, default `off`|E52 idea generator; `off` → 503 `ai_unavailable`; `fake` refused in prod unless `ALLOW_FAKE_PROVIDERS` (e2e)
`ANTHROPIC_API_KEY`|string, ! when `AI_PROVIDER=claude`|secret; ⊥ logged
`AI_MODEL`|string, default `claude-opus-5-5`|Claude model id
`AI_DAILY_LIMIT`|int ≥ 0, default 200|E52 calls per UTC day, whole API (cost cap); 0 = none allowed
`ALLOW_FAKE_PROVIDERS`|bool, default false|fake + `NODE_ENV=production` refused unless true (e2e prod build)
`PHOTON_URL`|URL, ! when photon (`.env.example`: `https://photon.komoot.io`)|⊥ hard-coded default in code (FOSSGIS/OSMF ask switchable URLs)
`NOMINATIM_ENABLED`|bool, default false|
`NOMINATIM_URL`|URL, ! when enabled (`https://nominatim.openstreetmap.org`)|
`OSRM_URL`|URL, ! when osrm (`https://routing.openstreetmap.de`)|profiles `routed-foot`, `routed-bike`, `routed-car`
`DEMO_PASSWORD`|string ≥ 12, default `heremita-demo-2026`|seed only
`SERVER_FETCH_SECRET`|string ≥ 32, blank = unset; ! in prod|= web value; verifies signed client IP (I.throttle); gen `openssl rand -base64 32`

Web `apps/web/src/env.ts` (server-only module, `import 'server-only'`; build fails on missing var):

var|note
---|---
`API_URL`|default `http://localhost:3101`; read at build time for rewrites + at runtime by `serverFetch`
`SESSION_COOKIE_NAME`|`hm_session\|__Host-hm_session`, ! match API `COOKIE_SECURE`
`NEXT_PUBLIC_MAP_STYLE_LIGHT`|default `https://tiles.openfreemap.org/styles/positron`
`NEXT_PUBLIC_MAP_STYLE_DARK`|default `https://tiles.openfreemap.org/styles/dark`
`NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT`|default `https://tiles.versatiles.org/assets/styles/colorful/style.json`
`NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK`|default `https://tiles.versatiles.org/assets/styles/eclipse/style.json`
`CONTACT_EMAIL`|operator contact shown on `/about` (FOSSGIS requires one); ! in prod; dev unset → page says "not configured". ⊥ a real person's address in repo files
`SERVER_FETCH_SECRET`|≥ 32 chars, ! when `NODE_ENV=production` (build + run), = API value; unset → `serverFetch` ⊥ sends client IP
`NEXT_PUBLIC_E2E`|`1` only in e2e builds → exposes `window.__heremitaMap` test hook

E2E overrides: web 3110 / api 3111, `DATABASE_URL=…/heremita_e2e`, `GEOCODING_PROVIDER=fake`, `ROUTING_PROVIDER=fake`, `ALLOW_FAKE_PROVIDERS=true`, `COOKIE_SECURE=false`, `SESSION_COOKIE_NAME=hm_session`, `WEB_ORIGIN=http://localhost:3110`, `API_URL=http://localhost:3111`, map styles → `/dev/blank-style.json` (served from `apps/web/public/dev/`, `{version:8,sources:{},layers:[{id:'bg',type:'background'}]}`), `NEXT_PUBLIC_E2E=1`.

### I.cmd — scripts (root `package.json`; fan-out `pnpm --recursive`, shared builds first)
cmd|effect|status
---|---|---
`pnpm env:init`|copy each `*/.env.example` → `.env`, never overwrite|exists
`pnpm db:up` / `db:down`|compose `postgres:18` on 127.0.0.1:5434|exists
`pnpm db:migrate`|`prisma migrate dev && prisma generate` ([core] only)|exists
`pnpm db:seed`|`prisma db seed` → `apps/api/prisma/seed.ts`|exists
`pnpm db:reset`|`prisma migrate reset --force && prisma db seed`; owner only (agent guard)|exists
`pnpm dev`|shared `tsc --watch` + api (`tsc --watch` + `node --watch-path`) + web `next dev --port 3100`|exists
`pnpm build` / `typecheck` / `lint` / `test` / `format` / `format:check`|as named|exists
`pnpm e2e` / `e2e:install`|Playwright (own servers 3110/3111) / install chromium (+ webkit)|exists; T23 changes config
`pnpm --filter @heremita/shared openapi:generate`|write `packages/shared/openapi.json`|T11
`pnpm --filter @heremita/api cli reset-password <email>`|set random temporary password (printed once), delete all user sessions|T32
`pnpm shortcuts`|`node scripts/shortcuts.mjs`: list `SHORTCUT(` markers ∀ git-listed non-`.md` file (tracked + untracked, `.gitignore` honoured); exit 1 if marker ⊥ `//`\|`#` line comment w/ owner + ceiling + upgrade|exists
`pnpm --filter @heremita/api test:live`|manual, one real call per provider w/ real UA; ⊥ CI|T40
`pnpm --filter @heremita/api eval:suggestions [--generator=claude\|fake\|null] [--reps=N] [--cases=id,…] [--no-judge]`|E52 eval (`apps/api/evals/`): golden set → production generator + grounding → scores + LLM judge → `evals/reports/<run>/`; exit 1 under the bar; spends money w/ claude; manual + `.github/workflows/evals.yml` (dispatch)|T82

### I.shared — `packages/shared/src` files (all schemas here; types = `z.infer` outputs, `z.input` request bodies)
Every request body/params/query schema = `z.strictObject` (unknown key → 422). Output schemas = `z.object` (strip = output allowlist). Component schemas carry `.meta({ id: '<Name>' })`. Every user free-text field goes through `cleanText` (text.ts) before length checks.

file|exports
---|---
`constants.ts` (exists)|`APP_NAME='Heremita'`, `API_PREFIX='/api/v1'`
`health.ts` (exists)|`livenessResponseSchema {status:'ok'}`, `readinessResponseSchema {status:'ok', db:'up'}`
`limits.ts`|`LIMITS` (§I.limits)
`text.ts`|`cleanText(s)`: NFC → strip C0/C1 except `\n` → strip U+202A–U+202E, U+2066–U+2069 → collapse > 2 consecutive blank lines → trim; `textSchema(min,max)` = `z.string().transform(cleanText).pipe(z.string().min(min).max(max))`
`common.ts`|`idSchema=z.uuid()`, `timestampSchema=z.iso.datetime()` (Z only), `isoDateSchema=z.iso.date()`, `yearMonthSchema=/^\d{4}-(0[1-9]\|1[0-2])$/`, `localeSchema=z.enum(['en','es','pt-BR'])`, `DEFAULT_LOCALE='en'`, `themeSchema=z.enum(['system','light','dark'])`, `travelModeSchema=z.enum(['walk','bike','drive'])`, `placeCategorySchema=z.enum(['sight','food','cafe','nightlife','lodging','shopping','nature','beach','culture','transport','activity','other'])`, `lngLatSchema={lng:-180..180, lat:-90..90}`, `cursorSchema=z.string().max(200).regex(/^[A-Za-z0-9_-]+$/)`, `limitQuery(max, fallback)` (z.coerce, query only), `pageSchema(item)={items:item[], nextCursor:cursor\|null}`, `userCardSchema {id, displayName, isDemo}`
`problem.ts` (exists → extend)|`PROBLEM_CONTENT_TYPE`, `problemFieldErrorSchema {pointer, detail}`, `problemDetailsSchema {type, title, status 400–599, detail, instance, code:string, errors?, currentPlanVersion?:int, tripPlaceId?:id}`
`error-codes.ts`|`errorCodeSchema = z.enum([...§I.errors])`, `ErrorCode`, `ERROR_TITLES: Record<ErrorCode,string>` (fixed English phrase)
`auth.ts`|`emailSchema` (trim + lowercase THEN `z.email().max(254)`; `" A@b.com"` valid → `a@b.com`), `passwordSchema` (12–128 chars, ⊥ composition rules), `signUpBodySchema {email, password, displayName: textSchema(1,50), locale}` + refine password ≠ email ∧ ≠ e-mail local part (pointer `/body/password`), `logInBodySchema {email, password: 1–128}`
`me.ts`|`meSchema` Me `{id, email, displayName, locale, theme, role:'user'\|'moderator', isDemo, createdAt}`; `updateMeBodySchema {displayName?, locale?, theme?}` ≥ 1 key; `changePasswordBodySchema {currentPassword:1–128, newPassword: passwordSchema}`; `deleteAccountBodySchema {password:1–128}`
`users.ts`|`userProfileSchema` UserProfile `{id, displayName, isDemo, joinedMonth:yearMonth, publicTripCount, reviewCount}`
`places.ts`|`placeKeySchema=/^osm:[NWR]:[1-9]\d{0,19}$/` (e.g. `osm:W:1370081491`); `placeSummarySchema` PlaceSummary `{id, source:'osm'\|'custom', key:placeKey\|null, name, label\|null, category, location:lngLat, countryCode\|null}`; `ratingSummarySchema` RatingSummary `{count, average:1–5\|null, distribution:[n1,n2,n3,n4,n5]\|null}` (non-null iff count ≥ 6); `placeResultSchema` PlaceResult `{key, ref:{osmType:'N'\|'W'\|'R', osmId}, name, label, category, kind:'poi'\|'address'\|'street'\|'area', location, bbox?:{west,south,east,north}, address:{houseNumber?,street?,district?,city?,state?,postcode?,country?,countryCode?}, placeId:id\|null, rating:RatingSummary\|null}` (placeId+rating set when canonical row exists); `searchPlacesQuerySchema {q: trim ≤120 default '', locale, intent:'autocomplete'\|'submit' default autocomplete, near?:"lng,lat", zoom?:0–22, within?:"w,s,e,n", categories?:"sight,food", limit: limitQuery(20,6)}` refine q ≥ 3 chars ∨ categories set (pointer `/query/q`); `reverseQuerySchema {lng, lat, locale}` (coerced); `placeDetailSchema` PlaceDetail `{place:PlaceSummary, rating, inMyTrips:[{tripId, tripTitle, tripPlaceId}], myReview: Review\|null}` (inMyTrips `[]` + myReview `null` when anonymous)
`trips.ts`|`visibilitySchema=z.enum(['private','link','public'])`; `destinationSchema {name: textSchema(1,120), countryCode: 2 upper letters\|null, center: lngLat\|null}`; `createTripBodySchema {title: textSchema(1,120), destination?: destination\|null =null, startDate?: isoDate\|null =null, dayCount?: int 0–60 =1, defaultMode?: =walk}`; `updateTripBodySchema {title?, description?: textSchema(0,2000)\|null, destination?, startDate?, defaultMode?, visibility?}` ≥ 1 key (⊥ dayCount: days change via E32/E34); `copyTripBodySchema {title?: textSchema(1,120)}`; `tripOwnerSchema` TripOwner `{viewerRole:'owner', id, title, description\|null, destination\|null, startDate\|null, dayCount, placeCount, defaultMode, visibility, shareToken\|null, author:UserCard, copiedFrom:{id,title}\|null, createdAt, updatedAt}`; `tripPublicSchema` TripPublic `{viewerRole:'viewer', id, title, description\|null, destination\|null, dayCount, placeCount, defaultMode, visibility:'link'\|'public', author, copiedFrom\|null, publishedAt\|null, copyCount}`; `tripSchema = discriminatedUnion('viewerRole',[TripOwner,TripPublic])`; `myTripCardSchema` MyTripCard `{id, title, destinationName\|null, startDate\|null, dayCount, placeCount, visibility, updatedAt, previewPoints: lngLat[] ≤20}`; `publicTripCardSchema` PublicTripCard `{id, title, destinationName\|null, countryCode\|null, dayCount, placeCount, defaultMode, copyCount, author:UserCard, previewPoints ≤20, publishedAt}`; `shareTokenResponseSchema {shareToken}`
`plan.ts`|`stopSchema {id, tripPlaceId, modeToNext: mode\|null}`; `dayOwnerSchema {id, number ≥1, date: isoDate\|null, mode, modeOverride\|null, stops: Stop[]}` (visit order; `mode` = effective day mode); `dayViewerSchema` = same ⊥ `date`; `tripPlaceOwnerSchema {id, place:PlaceSummary, note\|null, rating, addedAt}`; `tripPlaceViewerSchema` = same ⊥ `note`; `legSummarySchema {fromStopId, toStopId, mode, distanceMeters, durationSeconds, estimated}`; `dayRouteSummarySchema {dayId, legs: (LegSummary\|null)[], distanceMeters\|null, durationSeconds\|null}` (null leg = not cached; totals null unless every leg known); `tripPlanOwnerSchema` TripPlanOwner `{viewerRole:'owner', trip:TripOwner, planVersion, places:TripPlaceOwner[], days:DayOwner[], routes:DayRouteSummary[]}`; `tripPlanViewerSchema` TripPlanViewer `{viewerRole:'viewer', trip:TripPublic, planVersion, places:TripPlaceViewer[], days:DayViewer[], routes}`; `tripPlanSchema` = discriminatedUnion of both (meta `TripPlan`); `addTripPlaceBodySchema {place: discriminatedUnion('type', [{type:'osm', key}, {type:'custom', name: textSchema(1,200), category =other, location}]), note?: textSchema(0,4000)\|null =null, schedule?: {dayId, index?: int ≥0}\|null =null}`; `addTripPlaceResponseSchema {tripPlace:TripPlaceOwner, stopId\|null, planVersion}`; `updateTripPlaceBodySchema {note?, name?, category?, location?}` ≥1 key (name/category/location custom only); `updateTripPlaceResponseSchema {tripPlace, planVersion}`; `createDayBodySchema {index?: int ≥0}` (default append); `createDayResponseSchema {day:DayOwner, planVersion}`; `updateDayBodySchema {modeOverride: mode\|null}`; `addStopBodySchema {tripPlaceId, index?}`; `addStopResponseSchema {stop, planVersion}`; `stopOrderBodySchema {stopIds: id[] ≤25}` refine unique (pointer `/body/stopIds`); `stopPlacementBodySchema {dayId, index: int ≥0}` (clamped); `updateStopBodySchema {modeToNext: mode\|null}`; `planChangeSchema` PlanChange `{planVersion}`
`routes.ts`|`routeQuerySchema {mode?: travelMode}`; `legSchema` Leg = LegSummary + `{polyline (precision 5), provider, unroutable}`; `dayRouteSchema` DayRoute `{dayId, planVersion, modeOverride: mode\|null, quality:'routed'\|'partial'\|'estimated', distanceMeters, durationSeconds, legs:Leg[], attribution}`; `orderSuggestionQuerySchema {keepLast: 'true'\|'false' → bool, default true}`; `orderSuggestionSchema` OrderSuggestion `{dayId, planVersion, stopIds, before:{distanceMeters,durationSeconds}, after:{…}, estimated}`
`reviews.ts`|`reviewSortSchema=z.enum(['recent','lowest'])`; `putReviewBodySchema {rating: int 1–5, body: textSchema(10,2000), visitedMonth: yearMonth}` (⊥ future: server checks vs injected clock → 422 pointer `/body/visitedMonth`; client checks too); `reviewSchema` Review `{id, place:{id,name,category}, rating, body, visitedMonth, language: locale, author:UserCard, status:'published'\|'hidden', createdAt, updatedAt, isMine}`
`reports.ts`|`reportReasonSchema=z.enum(['spam','offensive','misleading','personal_data','other'])`; `createReportBodySchema {target:{type:'review'\|'trip', id}, reason, details?: textSchema(0,1000)}`; `createdIdSchema {id}`; `reportItemSchema` ReportItem `{id, target:{type, id, excerpt (≤200 chars of review body or trip title)}, contentStatus:'visible'\|'hidden', reason, details\|null, status:'open'\|'actioned'\|'dismissed', reporter:UserCard\|null, createdAt, resolvedAt\|null}`; `moderationDecisionBodySchema {decision:'hide_content'\|'restore_content'\|'dismiss'}`; `reportStatusQuerySchema {status ='open', limit, cursor}`
`discovery.ts`|`publicTripsQuerySchema {q?: trim 1–80, countryCode?: 2 letters, limit: limitQuery(30,12), cursor?}`
`suggestions.ts`|`suggestPlacesBodySchema {prompt: textSchema(3, SUGGEST_PROMPT_MAX), locale, count: int 1–`SUGGEST_COUNT.max`, default `SUGGEST_COUNT.default`}`; `placeSuggestionSchema` PlaceSuggestion `{place: PlaceResult, reason: string}`; `placeSuggestionsSchema` PlaceSuggestions `{items: PlaceSuggestion[], dropped: int ≥ 0}`
`api/endpoints.ts`|`EndpointDef {method, path:'/x/{param}' (OpenAPI style, relative to /api/v1), auth:'none'\|'optional'\|'required'\|'moderator', params?, query?, body?, status:200\|201\|204, response?, throttle?: ThrottleName, errors: readonly ErrorCode[]}`; `endpoint()` helper; `endpoints` = one entry per E1–E51 (names = §I.api `name` col); `EndpointInput<E>`, `EndpointOutput<E>` types
`openapi/document.ts` (subpath export `@heremita/shared/openapi`, ⊥ imported by web)|`buildOpenApiDocument(): OpenAPI 3.1` via `zod-openapi` 6.0.2 `createDocument` (fallback if spike T9 fails: `z.toJSONSchema` draft-2020-12 + hand-assembled paths); every `def.errors` → `application/problem+json` response w/ `ProblemDetails`
`index.ts`|re-export everything except openapi

Generated file: `packages/shared/openapi.json` (committed, generated; drift test fails on diff; served by E3).

### I.limits — `LIMITS` (`packages/shared/src/limits.ts`; used by schemas + services)
`STOPS_PER_DAY 25` · `DAYS_PER_TRIP 60` · `PLACES_PER_TRIP 300` · `TRIPS_PER_USER 100` · `TRIP_TITLE_MAX 120` · `TRIP_DESCRIPTION_MAX 2000` · `DESTINATION_NAME_MAX 120` · `NOTE_MAX 4000` · `PLACE_NAME_MAX 200` · `DISPLAY_NAME_MAX 50` · `EMAIL_MAX 254` · `PASSWORD_MIN 12` · `PASSWORD_MAX 128` · `REVIEW_BODY_MIN 10` · `REVIEW_BODY_MAX 2000` · `REPORT_DETAILS_MAX 1000` · `RATING_AVERAGE_MIN_COUNT 6` (average + distribution shown iff count ≥ 6) · `SEARCH_Q_MIN 3` · `SEARCH_Q_MAX 120` · `SEARCH_LIMIT {default 6, max 20}` · `REVERSE_LIMIT 5` · `REVERSE_RADIUS_KM 0.15` · `PUBLIC_TRIPS_Q_MAX 80` · `OPTIMISE_MIN_STOPS 3` · `BODY_MAX_BYTES 65536` · page sizes `{trips: 20/50, publicTrips: 12/30, userLists: 12/30, reviews: 10/50, blocks: 20/50, moderation: 20/50}` (default/max) · `PREVIEW_POINTS_MAX 20` · `SUGGEST_PROMPT_MAX 300` · `SUGGEST_COUNT {default 6, max 8}` · `SUGGEST_RADIUS_KM 25` (grounded place ≤ 25 km from the trip's centre).

### I.api — REST endpoints under `/api/v1`
Auth: `none` · `opt` (session read if cookie present) · `req` (no session → 401 `unauthenticated`) · `owner` = `req` + caller owns trip (else 404 `trip_not_found`) · `mod` = `req` + `role=moderator` (else 403 `forbidden`).
Implicit on every endpoint (not repeated): 422 `validation_failed` (when it has input), 429 `rate_limited`, 400 `malformed_request`, 413 `payload_too_large`, 415 `unsupported_media_type` (unsafe methods w/ body), 403 `csrf_rejected` (unsafe methods), 500 `internal_error`, 401 `unauthenticated` (req/owner/mod). Malformed path UUID → 404 of that resource. Every list = keyset `{items, nextCursor}`, bad cursor → 422 `invalid_cursor`.
"Plan" = `PlanChange {planVersion}`. Bodies by schema name (§I.shared).

id|name|method path|auth|throttle|request|success|errors
---|---|---|---|---|---|---|---
E1|getLiveness|GET `/health`|none|-|-|200 `{status:'ok'}` (no DB)|- (exists)
E2|getReadiness|GET `/health/ready`|none|-|-|200 `{status:'ok',db:'up'}`|503 `database_unavailable` (also while shutting down) (exists)
E3|getOpenApi|GET `/openapi.json`|none|-|-|200 OpenAPI 3.1 (= `packages/shared/openapi.json`)|-
E4|signUp|POST `/users`|none|signup|`signUpBodySchema`|201 Me + Set-Cookie; `Location: /api/v1/me`|409 `email_taken`
E5|logIn|POST `/sessions`|none|auth|`logInBodySchema`|201 Me + Set-Cookie; `Location: /api/v1/sessions/current`|401 `invalid_credentials`, 429 `too_many_attempts`
E6|logOut|DELETE `/sessions/current`|req|-|-|204 + clearing cookie (`Max-Age=0`)|-
E7|logOutEverywhere|DELETE `/sessions`|req|-|-|204 + clearing cookie; all user sessions deleted|-
E8|getMe|GET `/me`|req|-|-|200 Me|-
E9|updateMe|PATCH `/me`|req|-|`updateMeBodySchema`|200 Me|-
E10|changePassword|PUT `/me/password`|req|auth|`changePasswordBodySchema`|204 + new cookie (current session rotated: new token); other sessions deleted|422 `wrong_password` (pointer `/body/currentPassword`)
E11|deleteAccount|DELETE `/me`|req|auth|`deleteAccountBodySchema`|204 + clearing cookie|422 `wrong_password` (pointer `/body/password`)
E12|listBlocks|GET `/me/blocks`|req|-|`limit`(≤50,20), `cursor`|200 page of UserCard|-
E13|blockUser|PUT `/me/blocks/{userId}`|req|-|-|204 (idempotent)|404 `user_not_found`, 422 `cannot_block_self`
E14|unblockUser|DELETE `/me/blocks/{userId}`|req|-|-|204 (also when not blocked)|-
E15|getUserProfile|GET `/users/{userId}`|opt|-|-|200 UserProfile|404 `user_not_found`
E16|listUserTrips|GET `/users/{userId}/trips`|opt|-|`limit`(≤30,12), `cursor`|200 page of PublicTripCard (public, not hidden; ⊥ if viewer blocked author → empty)|404 `user_not_found`
E17|listUserReviews|GET `/users/{userId}/reviews`|opt|-|`limit`(≤30,12), `cursor`|200 page of Review (published only, or own hidden when self)|404 `user_not_found`
E18|listMyTrips|GET `/trips`|req|-|`limit`(≤50,20), `cursor`|200 page of MyTripCard, order `(updated_at DESC, id DESC)`|-
E19|createTrip|POST `/trips`|req|-|`createTripBodySchema`|201 TripOwner; `Location: /api/v1/trips/{id}`; creates `dayCount` days|409 `limit_reached`
E20|getTrip|GET `/trips/{tripId}`|opt|-|-|200 TripOwner (owner) \| TripPublic (public ∧ ¬hidden)|404 `trip_not_found`
E21|updateTrip|PATCH `/trips/{tripId}`|owner|-|`updateTripBodySchema`|200 TripOwner. Leaving `private` → `share_token` generated in same statement if null; becoming `public` → `published_at=now`; leaving `public` → `published_at=NULL`; `defaultMode` change bumps planVersion|404 `trip_not_found`
E22|deleteTrip|DELETE `/trips/{tripId}`|owner|-|-|204 (cascades days, stops, trip places, custom places)|404 `trip_not_found`
E23|rotateShareToken|PUT `/trips/{tripId}/share-token`|owner|-|-|200 `{shareToken}` (new token; old dies at once)|404 `trip_not_found`, 409 `trip_is_private`
E24|getTripPlan|GET `/trips/{tripId}/plan`|opt|-|-|200 TripPlanOwner (owner) \| TripPlanViewer (public ∧ ¬hidden). 6 fixed queries, ⊥ provider call|404 `trip_not_found`
E25|copyTrip|POST `/trips/{tripId}/copies`|req|-|`copyTripBodySchema`|201 TripOwner of copy; `Location`. Source ∈ own trips (duplicate) ∪ public ¬hidden|404 `trip_not_found`, 409 `limit_reached`
E26|getSharedPlan|GET `/shared/{shareToken}/plan`|opt|-|-|200 TripPlanViewer (always viewer shape, even for owner)|404 `trip_not_found`
E27|getSharedDayRoute|GET `/shared/{shareToken}/days/{dayId}/route`|opt|route|`routeQuerySchema`|200 DayRoute (same policy as E40 for viewers)|404 `trip_not_found`, `not_found`
E28|copySharedTrip|POST `/shared/{shareToken}/copies`|req|-|`copyTripBodySchema`|201 TripOwner; `Location`|404 `trip_not_found`, 409 `limit_reached`
E29|addTripPlace|POST `/trips/{tripId}/places`|owner|-|`addTripPlaceBodySchema`|201 `{tripPlace, stopId\|null, planVersion}`; `Location: /api/v1/trips/{tripId}/places/{tripPlaceId}`|404 `trip_not_found`, `not_found` (schedule.dayId), 409 `place_already_in_trip` (+`tripPlaceId`), 409 `limit_reached`, 409 `day_full`, 503 `geocoding_unavailable`
E30|updateTripPlace|PATCH `/trips/{tripId}/places/{tripPlaceId}`|owner|-|`updateTripPlaceBodySchema`|200 `{tripPlace, planVersion}` (bump only if `location` changed)|404 `trip_not_found`, `not_found`, 422 `not_a_custom_place`
E31|deleteTripPlace|DELETE `/trips/{tripId}/places/{tripPlaceId}`|owner|-|-|200 Plan (its stops removed; custom place row deleted)|404 `trip_not_found`, `not_found`
E32|createDay|POST `/trips/{tripId}/days`|owner|-|`createDayBodySchema`|201 `{day, planVersion}`; `Location: /api/v1/trips/{tripId}/days/{dayId}`|404 `trip_not_found`, 409 `limit_reached`
E33|updateDay|PATCH `/trips/{tripId}/days/{dayId}`|owner|-|`updateDayBodySchema`|200 Plan|404 `trip_not_found`, `not_found`
E34|deleteDay|DELETE `/trips/{tripId}/days/{dayId}`|owner|-|-|200 Plan (its stops deleted → their places stay as ideas; later days renumbered)|404 `trip_not_found`, `not_found`
E35|addStop|POST `/trips/{tripId}/days/{dayId}/stops`|owner|-|`addStopBodySchema`|201 `{stop, planVersion}`; `Location: /api/v1/trips/{tripId}/stops/{stopId}`; index default append, clamped|404 `trip_not_found`, `not_found`, 409 `day_full`
E36|putStopOrder|PUT `/trips/{tripId}/days/{dayId}/stop-order`|owner|-|`stopOrderBodySchema`|200 Plan|404 `trip_not_found`, `not_found`, 409 `plan_changed` (+`currentPlanVersion`)
E37|putStopPlacement|PUT `/trips/{tripId}/stops/{stopId}/placement`|owner|-|`stopPlacementBodySchema`|200 Plan (same or other day; index clamped to [0,n])|404 `trip_not_found`, `not_found`, 409 `day_full`
E38|updateStop|PATCH `/trips/{tripId}/stops/{stopId}`|owner|-|`updateStopBodySchema`|200 Plan|404 `trip_not_found`, `not_found`
E39|deleteStop|DELETE `/trips/{tripId}/stops/{stopId}`|owner|-|-|200 Plan (trip place stays; idea if no other stop)|404 `trip_not_found`, `not_found`
E40|getDayRoute|GET `/trips/{tripId}/days/{dayId}/route`|opt (owner or public viewer)|route|`routeQuerySchema` (`mode` overrides every leg, read-only)|200 DayRoute; `Cache-Control: private, no-cache`|404 `trip_not_found`, `not_found`
E41|getOrderSuggestion|GET `/trips/{tripId}/days/{dayId}/order-suggestion`|owner|route|`orderSuggestionQuerySchema`|200 OrderSuggestion (writes nothing; apply via E36)|404 `trip_not_found`, `not_found`, 422 `too_few_stops` (< 3)
E42|searchPlaces|GET `/places/search`|req|search|`searchPlacesQuerySchema`|200 `{items: PlaceResult[]}` (bounded, not paged); `Cache-Control: private, max-age=300`|503 `geocoding_unavailable` \| `geocoding_busy` + `Retry-After`
E43|reversePlaces|GET `/places/reverse`|req|reverse|`reverseQuerySchema`|200 `{items}` ≤ 5, nearest first, radius 150 m|503 `geocoding_unavailable` \| `geocoding_busy`
E44|getPlace|GET `/places/{placeId}`|opt|-|-|200 PlaceDetail|404 `place_not_found` (custom places → 404 for everyone)
E45|listPlaceReviews|GET `/places/{placeId}/reviews`|opt|-|`limit`(≤50,10), `cursor`, `sort`=recent\|lowest|200 page of Review (published; own hidden visible to self; blocked authors excluded)|404 `place_not_found`
E46|putMyReview|PUT `/places/{placeId}/reviews/mine`|req|ugc|`putReviewBodySchema`|201 Review (created) \| 200 (replaced); `Location: /api/v1/places/{placeId}/reviews/mine`; `language` = caller locale|404 `place_not_found`
E47|deleteMyReview|DELETE `/places/{placeId}/reviews/mine`|req|-|-|204 (also when none)|404 `place_not_found`
E48|listPublicTrips|GET `/public-trips`|opt|-|`publicTripsQuerySchema`|200 page of PublicTripCard, order `(published_at DESC, id DESC)`; `q` = `unaccent(lower(title ' ' destination_name)) ILIKE %q%`|-
E49|createReport|POST `/reports`|req|ugc|`createReportBodySchema`|201 `{id}`; `Location: /api/v1/moderation/reports/{id}`|404 `not_found` (target invisible to caller), 409 `already_reported`, 422 `cannot_report_own`
E50|listReports|GET `/moderation/reports`|mod|-|`reportStatusQuerySchema` (limit ≤50,20)|200 page of ReportItem, order `(created_at ASC, id ASC)`|403 `forbidden`
E51|decideReport|PATCH `/moderation/reports/{reportId}`|mod|-|`moderationDecisionBodySchema`|200 ReportItem. `hide_content`: review → `status=hidden, hidden_at=now`; trip → `moderation_hidden_at=now`; report → `actioned`. `restore_content`: inverse, report → `actioned`. `dismiss`: report → `dismissed`. Other open reports on same target resolved identically|403 `forbidden`, 404 `not_found`
E52|suggestPlaces|POST `/trips/{tripId}/suggestions`|owner|ai|`suggestPlacesBodySchema`|200 PlaceSuggestions; writes nothing (owner adds a pick via E29 `{type:'osm', key}`); every item grounded (V77); `Cache-Control: no-store`|404 `trip_not_found`, 422 `destination_required` (⊥ destination centre ∧ ⊥ places), 429 `ai_quota_exhausted` + `Retry-After` (daily budget), 503 `ai_unavailable` (AI off, model error, refusal, unusable output) \| `geocoding_unavailable` (⊥ idea grounded and geocoder failed) \| `geocoding_busy`

Removed on purpose (⊥ implement): `GET /shared/{token}` → tripId, `?shareToken=` query anywhere (tokens only in path), `PUT /trips/{id}/day-order`, day `title`, report target `user`, review sort `highest`, `sort=copied`, `GET /me/export`, `POST /client-errors`, `Idempotency-Key`, route `ETag`.

### I.api.mechanics — how endpoints behave
- Cursor codec (`apps/api/src/core/cursor.ts`): `base64url(JSON.stringify(tuple))`, decoded + zod tuple validated; tuples: my trips `[updatedAt, id]`; public trips + user trips `[publishedAt, id]`; reviews recent + user reviews `[createdAt, id]`; reviews lowest `[rating, createdAt, id]` (order `rating ASC, created_at DESC, id DESC`); blocks `[createdAt, blockedId]`; reports `[createdAt, id]`. Fetch `limit+1` → `nextCursor`.
- `TripAccessService.resolve(tripId|shareToken, viewer) → 'owner'|'viewer'|null` (`apps/api/src/core/trip-access.service.ts`): owner = `owner_id = viewer.id`; viewer via id = `visibility='public' ∧ moderation_hidden_at IS NULL`; viewer via token = `share_token = $t ∧ visibility ∈ {link,public} ∧ moderation_hidden_at IS NULL`; else null → 404 `trip_not_found`.
- Plan lock (`apps/api/src/plan/plan-lock.ts`), first statement of every structural write, inside `prisma.$transaction`: `UPDATE trips SET plan_version = plan_version + 1, updated_at = now() WHERE id = $1 AND owner_id = $2 RETURNING plan_version` → 0 rows → 404 `trip_not_found`. Preconditions (membership, limits, permutation) checked after lock on fresh data. Provider calls (key resolution) happen BEFORE tx.
- `writeDayOrder(tx, dayId, orderedStopIds)` only writer of `stops.position`: `UPDATE stops SET position = position + 1000 WHERE day_id = $1;` then `UPDATE stops s SET position = v.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS v(id, ord) WHERE s.id = v.id AND s.day_id = $1;` Same two-phase writer for `days.position`. (One-statement permutation/shift fails `stops_day_id_position_key`: PG checks non-deferrable UNIQUE per row.)
- planVersion bumps (I5): add/delete trip place, add/delete day, add/move/reorder/delete stop, stop `modeToNext`, day `modeOverride`, trip `defaultMode`, custom place `location`. ⊥ bump: note, name, category, title, description, visibility, startDate.
- Effective leg mode = `query.mode ?? stop.modeToNext ?? day.modeOverride ?? trip.defaultMode`. Day `mode` in plan = `day.modeOverride ?? trip.defaultMode`.
- E29 flow: osm → `PlaceResolver.resolve(key)` (cache `place:v1:<key>` → else Nominatim `/lookup` iff `NOMINATIM_ENABLED` → else 503 `geocoding_unavailable`, nothing written); tx: lock → limits (`PLACES_PER_TRIP`, `day_full`) → `INSERT … ON CONFLICT (osm_type, osm_id) DO UPDATE SET last_seen_at = now() RETURNING id` → insert trip place (UNIQUE(trip, place) conflict → 409 `place_already_in_trip` w/ existing `tripPlaceId`) → optional stop at clamped index. Custom → insert place (`source=custom, trip_id`) + trip place. Client-sent names/coords for osm ⊥ stored.
- Copy (E25/E28) one tx of `INSERT … SELECT`: new trip (`visibility=private`, `start_date NULL`, `share_token NULL`, `copied_from_trip_id = source`, title = body.title ?? `"Copy of <title>"` (copier locale en) / `"Copia de <title>"` (es) / `"Cópia de <title>"` (pt-BR), truncated 120), custom places cloned w/ new `trip_id`, trip places (note NULL), days, stops (modes kept). Copier limits checked first (trips count, ⊥ need others since source ≤ limits). `copyCount` = `count(*) WHERE copied_from_trip_id = $id`. `copiedFrom` exposed only if source public ∧ ¬hidden (else null).
- Rating summary (`apps/api/src/core/rating-summary.reader.ts`): one grouped query `WHERE place_id = ANY($1) AND status='published' AND author_id NOT IN (blocked by viewer)`; average/distribution null when count < 6. Computed on read (⊥ denormalised counter).
- Block filter (`apps/api/src/core/block-filter.ts`): `author_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = $viewer)` in E16, E17, E45, E48, rating summaries, PlaceResult rating.
- Sessions: token `randomBytes(32).toString('base64url')`; DB `token_hash = sha256(token)` bytea UNIQUE; cookie `HttpOnly; SameSite=Lax; Path=/; Max-Age=<seconds until absolute_expires_at>` (+ `Secure` when `COOKIE_SECURE`), name `__Host-hm_session` | `hm_session`. Lifetimes: idle 30 d (`expires_at`), absolute 90 d (`absolute_expires_at`, never extended). Guard query `… WHERE token_hash=$1 AND expires_at > now AND absolute_expires_at > now`; if `last_used_at < now − 1 h` → `last_used_at=now, expires_at=least(now+30d, absolute_expires_at)` (⊥ re-send cookie). Login/sign-up always new session. Hourly purge job deletes expired sessions + expired `provider_cache` rows in batches of 1000.
- Login: unknown e-mail → verify against fixed dummy Argon2id hash; same 401 body as wrong password. Per normalised e-mail 5 failures / 15 min → 429 `too_many_attempts` + `Retry-After` until window end; cleared on success; ⊥ account lockout.
- Passwords: `@node-rs/argon2` 2.2.2 `hash(pw, {memoryCost: 19456, timeCost: 2, parallelism: 1})` (omit `algorithm`: default = Argon2id; its `Algorithm` const enum unusable under `isolatedModules`); PHC prefix `$argon2id$v=19$m=19456,t=2,p=1$`. Common-password blocklist: vendored 10k list (SecLists `10k-most-common.txt`, MIT — confirm licence when vendoring) at `apps/api/src/core/password/common-passwords.txt`, checked server-side → 422 pointer `/body/password` (or `/body/newPassword`).
- Account deletion: one tx deletes user → cascades sessions, trips (+ days, stops, trip places, custom places), reviews, blocks, reports against own content; reports filed survive w/ `reporter_id NULL`; others' copies survive w/ `copied_from_trip_id NULL`.
- CSRF guard (global, first): methods POST/PUT/PATCH/DELETE. `Sec-Fetch-Site` present → ! `same-origin` (⊥ `same-site`); absent → `Origin` ! == `WEB_ORIGIN`; else 403 `csrf_rejected`. Body present → `Content-Type: application/json` else 415. Applies to E4/E5 (login CSRF).
- Pipeline: `CsrfGuard` → `SessionGuard` (sets `req.user`, enforces `def.auth`) → `AppThrottlerGuard` (tracker `req.user?.id ?? req.ip`) → `ContractInterceptor` (parse params → 404 on fail; query/body → 422 pointers `/query/...`, `/body/...`; result parsed by `def.response`, strip; parse failure → log `error` + 500) → handler (`@Input()`, `@CurrentUser()`). Handlers parse+return; logic in services; explicit field mapping to Prisma (⊥ spread).
- `@Endpoint(def)` = `applyDecorators(<Method>(<path with :params>), HttpCode(def.status), SetMetadata(ENDPOINT, def), Throttle(...))`. Route-table test: Nest `DiscoveryService` set of handlers w/ ENDPOINT metadata == `Object.values(endpoints)` minus `PENDING_ENDPOINTS` (list in test, shrinks to empty by T71).
- Exception filter: `ApiProblem extends HttpException {code, detail, extensions?, retryAfterSeconds?}` → `type: urn:heremita:problem:<code>`, `title: ERROR_TITLES[code]`, `instance: req.originalUrl` (query stripped), `Retry-After` header. `ThrottlerException` → 429 `rate_limited` keeping `Retry-After`. Body-parser `entity.parse.failed` → 400, `entity.too.large` → 413. Prisma P2002 on `users_email_key` → 409 `email_taken`. Anything else → 500 `internal_error`, logged once w/ request id. ⊥ stack traces/SQL in bodies.
- Headers: `helmet` 8.3.0 defaults, `x-powered-by` off, `Cache-Control: no-store` default on every API response (except E42 `private, max-age=300`, E40/E27 `private, no-cache`), `X-Request-Id` echoed (incoming accepted iff `^[A-Za-z0-9-]{8,64}$`, else UUIDv7 generated).
- JSON body limit 64 kB (`app.useBodyParser('json', {limit: '64kb'})`).
- Graceful shutdown: SIGTERM → `shuttingDown=true` → E2 503 at once → drain ≤ 10 s → close pool → exit 0 (skeleton has 10 s deadline).

### I.errors — error codes (`errorCodeSchema`)
status|codes
---|---
400|`malformed_request`
401|`unauthenticated`, `invalid_credentials`
403|`csrf_rejected`, `forbidden` (moderation only; ownership misses are 404)
404|`not_found`, `trip_not_found`, `place_not_found`, `user_not_found`
409|`email_taken`, `plan_changed` (+`currentPlanVersion`), `place_already_in_trip` (+`tripPlaceId`), `already_reported`, `trip_is_private`, `limit_reached`, `day_full`
413|`payload_too_large`
415|`unsupported_media_type`
422|`validation_failed` (+`errors[]`), `invalid_cursor`, `too_few_stops`, `destination_required`, `not_a_custom_place`, `cannot_block_self`, `cannot_report_own`, `wrong_password` (+`errors[]` w/ pointer)
429|`rate_limited`, `too_many_attempts`, `ai_quota_exhausted` (all + `Retry-After` seconds)
500|`internal_error`
503|`database_unavailable`, `geocoding_unavailable`, `geocoding_busy` (+`Retry-After`), `ai_unavailable`
Pointers: JSON Pointer rooted at request part: `/body/stopIds/3`, `/query/limit`.

### I.throttle — client limits (`@nestjs/throttler` 6.8.0, single `default` throttler, per-endpoint limit via `@Throttle({default})`, keyed tracker + handler)
name|limit|key
---|---|---
default|120 / 60 s|user id ?? IP
`auth`|10 / 60 s (E5, E10, E11) + login failures 5 / 15 min per (e-mail, IP block /24 ∨ /64) + backstop 50 / 15 min per e-mail|IP (E5), user (E10, E11); login failures IP = signed client IP ?? `req.ip`
`signup`|5 / 3600 s|IP
`search`|10 / 2 s|user
`reverse`|3 / 3 s|user
`route`|5 / 2.5 s (E27, E40, E41)|user ?? IP
`ugc`|10 / 3600 s (E46, E49)|user
`ai`|10 / 3600 s (E52)|user
Over limit → 429 + `Retry-After` (seconds). IP = `req.ip` under `TRUST_PROXY`, except RSC call w/ valid signed client IP: `serverFetch` sends `X-Heremita-Client-Ip` (last `X-Forwarded-For` entry) + `X-Heremita-Client-Ip-Signature: <unix ms>.<hex HMAC-SHA256(SERVER_FETCH_SECRET, "heremita-client-ip:v1\n<ip>\n<ms>")>`; API trusts iff secret set ∧ valid IP ∧ |now − ms| ≤ 60 s ∧ `timingSafeEqual`; else `req.ip`. IPv6 → /64 (throttler `normalizeIp`).

### I.authz — authorisation matrix (test: `apps/api/test/authz-matrix.test.ts`)
resource / action|anonymous|signed-in non-owner|owner
---|---|---|---
E48, E15–E17, E44, E45|read|read minus authors they blocked|read
E20, E24, E40 on public ¬hidden trip|viewer shape|viewer shape|owner shape
same on private/link trip or hidden trip|404|404|owner shape
E26–E27 w/ valid token, trip link\|public, ¬hidden|viewer shape|viewer shape|viewer shape
E26–E28 w/ bad/rotated token or private trip|404|404|404
E21–E23, E29–E39, E41|401|404|yes
E25 copy|401|public ¬hidden only, else 404|yes (duplicate)
E28 copy via token|401|valid token|valid token
E46, E47|401|own review only (`/reviews/mine`, ⊥ by review id)|-
E49|401|visible review/trip not own|own → 422 `cannot_report_own`
hidden review|invisible|invisible|author sees `status:'hidden'`
custom place E44–E47|404|404|404 (only via its trip)
E42, E43|401|yes|yes
E50, E51|401|403 unless moderator|-
Nested IDOR rows: B's `tripId` + A's `dayId|stopId|tripPlaceId` and A's `tripId` + B's child id → 404 and A's rows unchanged.

### I.data — Prisma schema (`apps/api/prisma/schema.prisma`; replaces `Placeholder`; one migration `<ts>_v1_model`)
Ids from PG 18 `uuidv7()` (raw-SQL copy needs DB-side ids). Snake_case DB names, `timestamptz(3)`. Create w/ `prisma migrate dev --create-only`, append §I.data.sql, apply. Verified shape: `prisma validate` + generated SQL ran on PG 18.7 (design phase); re-verify after edits below.

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  previewFeatures = ["partialIndexes"]
}
datasource db { provider = "postgresql" }

enum Locale { en  es  pt_BR @map("pt-BR") }
enum ThemePreference { system light dark }
enum UserRole { user moderator }
enum TripVisibility { private link public }
enum PlaceSource { osm custom }
enum OsmType { N W R }
enum PlaceCategory { sight food cafe nightlife lodging shopping nature beach culture transport activity other }
enum TravelMode { walk bike drive }
enum ReviewStatus { published hidden }
enum ReportTarget { review trip }
enum ReportReason { spam offensive misleading personal_data other }
enum ReportStatus { open actioned dismissed }

model User {
  id                String          @id @default(dbgenerated("uuidv7()")) @db.Uuid
  email             String          @unique @db.VarChar(254)   // trimmed + lower-cased by service
  passwordHash      String          @map("password_hash")
  displayName       String          @map("display_name") @db.VarChar(50)
  role              UserRole        @default(user)
  locale            Locale          @default(en)
  theme             ThemePreference @default(system)
  isDemo            Boolean         @default(false) @map("is_demo")
  passwordChangedAt DateTime        @default(now()) @map("password_changed_at") @db.Timestamptz(3)
  createdAt         DateTime        @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime        @updatedAt @map("updated_at") @db.Timestamptz(3)
  sessions Session[]  trips Trip[]  reviews Review[]
  reportsFiled    Report[]    @relation("ReportReporter")
  reportsResolved Report[]    @relation("ReportResolver")
  blocking        UserBlock[] @relation("Blocker")
  blockedBy       UserBlock[] @relation("Blocked")
  @@map("users")
}

model Session {
  id                String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tokenHash         Bytes    @unique @map("token_hash") @db.ByteA       // sha256(token)
  userId            String   @map("user_id") @db.Uuid
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  lastUsedAt        DateTime @default(now()) @map("last_used_at") @db.Timestamptz(3)
  expiresAt         DateTime @map("expires_at") @db.Timestamptz(3)            // idle, slides ≤ hourly
  absoluteExpiresAt DateTime @map("absolute_expires_at") @db.Timestamptz(3)  // createdAt + 90 d
  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}

model Trip {
  id                     String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  ownerId                String         @map("owner_id") @db.Uuid
  owner                  User           @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title                  String         @db.VarChar(120)
  description            String?        @db.VarChar(2000)
  destinationName        String?        @map("destination_name") @db.VarChar(120)
  destinationCountryCode String?        @map("destination_country_code") @db.Char(2)
  destinationLng         Float?         @map("destination_lng")
  destinationLat         Float?         @map("destination_lat")
  startDate              DateTime?      @map("start_date") @db.Date        // owner only; day n = start + n−1
  visibility             TripVisibility @default(private)
  shareToken             String?        @unique @map("share_token") @db.VarChar(32) // 16 random bytes base64url (22 chars)
  defaultMode            TravelMode     @default(walk) @map("default_mode")
  planVersion            Int            @default(0) @map("plan_version")
  publishedAt            DateTime?      @map("published_at") @db.Timestamptz(3)
  moderationHiddenAt     DateTime?      @map("moderation_hidden_at") @db.Timestamptz(3)
  copiedFromTripId       String?        @map("copied_from_trip_id") @db.Uuid
  copiedFrom             Trip?          @relation("TripCopies", fields: [copiedFromTripId], references: [id], onDelete: SetNull)
  copies                 Trip[]         @relation("TripCopies")
  createdAt              DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt              DateTime       @updatedAt @map("updated_at") @db.Timestamptz(3)
  days Day[]  tripPlaces TripPlace[]  customPlaces Place[]  reports Report[]
  @@index([ownerId, updatedAt(sort: Desc), id(sort: Desc)])
  @@index([publishedAt(sort: Desc), id(sort: Desc)], map: "trips_discovery_idx", where: raw("visibility = 'public' AND moderation_hidden_at IS NULL"))
  @@index([ownerId, publishedAt(sort: Desc), id(sort: Desc)], map: "trips_author_public_idx", where: raw("visibility = 'public' AND moderation_hidden_at IS NULL"))
  @@index([copiedFromTripId])
  @@map("trips")
}

model Place {
  id          String        @id @default(dbgenerated("uuidv7()")) @db.Uuid
  source      PlaceSource
  osmType     OsmType?      @map("osm_type")
  osmId       BigInt?       @map("osm_id")            // > 32 bits (N14183629101)
  tripId      String?       @map("trip_id") @db.Uuid   // custom only
  trip        Trip?         @relation(fields: [tripId], references: [id], onDelete: Cascade)
  name        String        @db.VarChar(200)
  label       String?       @db.VarChar(300)
  category    PlaceCategory
  osmKey      String?       @map("osm_key") @db.VarChar(64)
  osmValue    String?       @map("osm_value") @db.VarChar(64)
  lng         Float
  lat         Float
  address     Json?                                    // placeResultSchema.address shape
  countryCode String?       @map("country_code") @db.Char(2)
  lastSeenAt  DateTime?     @map("last_seen_at") @db.Timestamptz(3)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)
  tripPlaces TripPlace[]  reviews Review[]
  @@unique([osmType, osmId])
  @@index([tripId])
  @@map("places")
}

model TripPlace {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tripId    String   @map("trip_id") @db.Uuid
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  placeId   String   @map("place_id") @db.Uuid
  place     Place    @relation(fields: [placeId], references: [id], onDelete: Restrict)
  note      String?  @db.VarChar(4000)                 // owner-private, never copied
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  stops Stop[]
  @@unique([tripId, placeId])
  @@unique([id, tripId])                               // target of composite FK from stops
  @@index([placeId])
  @@map("trip_places")
}

model Day {
  id           String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tripId       String      @map("trip_id") @db.Uuid
  trip         Trip        @relation(fields: [tripId], references: [id], onDelete: Cascade)
  position     Int                                      // dense 0..n−1; "Day n" = position+1
  modeOverride TravelMode? @map("mode_override")        // NULL = trip.defaultMode
  createdAt    DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  stops Stop[]
  @@unique([tripId, position])
  @@unique([id, tripId])
  @@map("days")
}

model Stop {
  id          String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tripId      String      @map("trip_id") @db.Uuid    // denormalised for composite FKs
  dayId       String      @map("day_id") @db.Uuid
  day         Day         @relation(fields: [dayId, tripId], references: [id, tripId], onDelete: Cascade)
  tripPlaceId String      @map("trip_place_id") @db.Uuid
  tripPlace   TripPlace   @relation(fields: [tripPlaceId, tripId], references: [id, tripId], onDelete: Cascade)
  position    Int                                      // dense 0..n−1 within day
  modeToNext  TravelMode? @map("mode_to_next")         // NULL = day mode; ignored on last stop
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  @@unique([dayId, position])
  @@index([tripPlaceId])
  @@index([tripId])
  @@map("stops")
}

model Review {
  id        String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  placeId   String       @map("place_id") @db.Uuid
  place     Place        @relation(fields: [placeId], references: [id], onDelete: Restrict)
  authorId  String       @map("author_id") @db.Uuid
  author    User         @relation(fields: [authorId], references: [id], onDelete: Cascade)
  rating    Int          @db.SmallInt
  body      String       @db.VarChar(2000)
  visitedOn DateTime     @map("visited_on") @db.Date    // first day of visit month
  language  Locale
  status    ReviewStatus @default(published)
  hiddenAt  DateTime?    @map("hidden_at") @db.Timestamptz(3)
  createdAt DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  reports Report[]
  @@unique([placeId, authorId])
  @@index([placeId, status, createdAt(sort: Desc), id(sort: Desc)])
  @@index([placeId, status, rating, createdAt(sort: Desc), id(sort: Desc)])
  @@index([authorId, createdAt(sort: Desc), id(sort: Desc)])
  @@map("reviews")
}

model Report {
  id           String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  reporterId   String?      @map("reporter_id") @db.Uuid
  reporter     User?        @relation("ReportReporter", fields: [reporterId], references: [id], onDelete: SetNull)
  targetType   ReportTarget @map("target_type")
  reviewId     String?      @map("review_id") @db.Uuid
  review       Review?      @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  tripId       String?      @map("trip_id") @db.Uuid
  trip         Trip?        @relation(fields: [tripId], references: [id], onDelete: Cascade)
  reason       ReportReason
  details      String?      @db.VarChar(1000)
  status       ReportStatus @default(open)
  resolvedById String?      @map("resolved_by_id") @db.Uuid
  resolvedBy   User?        @relation("ReportResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolvedAt   DateTime?    @map("resolved_at") @db.Timestamptz(3)
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  @@unique([reporterId, reviewId])
  @@unique([reporterId, tripId])
  @@index([status, createdAt])
  @@index([reviewId])
  @@index([tripId])
  @@map("reports")
}

model UserBlock {
  blockerId String   @map("blocker_id") @db.Uuid
  blocker   User     @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId String   @map("blocked_id") @db.Uuid
  blocked   User     @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@id([blockerId, blockedId])
  @@index([blockedId])
  @@map("user_blocks")
}

model ProviderCache {
  key       String   @id                               // content-addressed (§I.providers)
  value     Json
  expiresAt DateTime @map("expires_at") @db.Timestamptz(3)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  @@index([expiresAt])
  @@map("provider_cache")
}
```
(Relation-list fields shown on one line for brevity: write one per line in the real file.)

#### I.data.sql — hand-written, appended to the generated migration (Prisma cannot model CHECK/extension)
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER TABLE places ADD CONSTRAINT places_source_shape_chk CHECK (
  (source = 'osm' AND osm_type IS NOT NULL AND osm_id IS NOT NULL AND trip_id IS NULL)
  OR (source = 'custom' AND osm_type IS NULL AND osm_id IS NULL AND trip_id IS NOT NULL));
ALTER TABLE places ADD CONSTRAINT places_lng_lat_chk CHECK (lng BETWEEN -180 AND 180 AND lat BETWEEN -90 AND 90);
ALTER TABLE trips ADD CONSTRAINT trips_destination_point_chk CHECK ((destination_lng IS NULL) = (destination_lat IS NULL));
ALTER TABLE trips ADD CONSTRAINT trips_published_chk CHECK ((visibility = 'public') = (published_at IS NOT NULL));
ALTER TABLE trips ADD CONSTRAINT trips_share_token_chk CHECK (visibility = 'private' OR share_token IS NOT NULL);
ALTER TABLE trips ADD CONSTRAINT trips_plan_version_chk CHECK (plan_version >= 0);
ALTER TABLE days ADD CONSTRAINT days_position_chk CHECK (position >= 0);
ALTER TABLE stops ADD CONSTRAINT stops_position_chk CHECK (position >= 0);
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE reviews ADD CONSTRAINT reviews_body_len_chk CHECK (char_length(body) BETWEEN 10 AND 2000);
ALTER TABLE reviews ADD CONSTRAINT reviews_visited_on_chk CHECK (extract(day FROM visited_on) = 1);
ALTER TABLE reviews ADD CONSTRAINT reviews_hidden_chk CHECK ((status = 'hidden') = (hidden_at IS NOT NULL));
ALTER TABLE reports ADD CONSTRAINT reports_target_chk CHECK (
  (target_type = 'review' AND review_id IS NOT NULL AND trip_id IS NULL)
  OR (target_type = 'trip' AND trip_id IS NOT NULL AND review_id IS NULL));
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_not_self_chk CHECK (blocker_id <> blocked_id);
```
DB-level guarantees (verified on PG 18.7 in design): stop mixing trips → FK violation `stops_trip_place_id_trip_id_fkey`; deleting trip w/ custom place + trip places + stops cascades in 1 statement; deleting canonical place used by a trip → RESTRICT violation.
Migration naming `YYYYMMDDHHMMSS_<area>_<change>`; prod: `SET lock_timeout = '5s'` on DDL; `prisma migrate deploy` as one-off step.

### I.providers — geocoding + routing (API only; `apps/api/src/providers/**`)
- Interfaces (`providers/core/contract.ts`): `GeocodingProvider {id:'photon'|'nominatim'|'fake', search(SearchQuery, signal) → PlaceResult[], reverse(ReverseQuery, signal) → PlaceResult[], lookup?(keys[]) → PlaceResult[]}`; `RoutingProvider {id:'osrm-fossgis'|'fake', capabilities:{modes, maxStops:25}, route({mode, stops: LngLat[2..25]}, signal) → RouteResult}`; `RouteResult {provider, mode, quality, distanceMeters, durationSeconds, legs:[{distanceMeters, durationSeconds, polyline(p5), estimated}], snapped:[{location, offNetworkMeters, routable}], attribution}`; `ProviderError {provider, kind: bad_request|no_route|unroutable_stop|too_many_stops|rate_limited|timeout|unavailable|bad_response, retryable (timeout|unavailable), stopIndex?}`.
- Outbound client (`providers/core/outbound.ts`, the only `fetch` to the internet): per attempt `AbortSignal.any([caller, AbortSignal.timeout(ms)])` within 8 s request deadline; timeouts Photon autocomplete 4 s, Photon other + Nominatim 5 s, OSRM 6 s; retries GET only on network error/timeout/5xx/429, ≤ 2, full jitter from 250 ms capped 2 s, honour `Retry-After`, never past deadline, `warn` per retry; ⊥ retry autocomplete, ⊥ retry 4xx. Per-host token bucket: Photon 1/s burst 3 (autocomplete fails fast 503 `geocoding_busy` `Retry-After: 1`; submit waits ≤ 2 s); Nominatim 1 per 1.1 s burst 1, 1 connection, skip after 2 s; OSRM 1/s burst 1, 1 connection, legs → estimates after 3 s w/o token. Breaker per host: 5 consecutive retryable failures → open 30 s → one probe. FOSSGIS 429 → pause host 60 s (its 429 is HTML w/o `Retry-After`); 403 → pause 1 h + log `error`. Single-flight identical keys. Headers on every call: `User-Agent: Heremita/<api package version> (+<PUBLIC_SITE_URL>/about)`, `Referer: <PUBLIC_SITE_URL>/`. ⊥ user identifiers in requests.
- Photon: `GET {PHOTON_URL}/api/?q&lang&limit&lat&lon&zoom&bbox&include` (`lang`: en → `en`, es + pt-BR → `default` (one cache entry); `lang=pt`/`es` is a 400); reverse `GET {PHOTON_URL}/reverse?lat&lon&radius=0.15&limit=5&lang`. Parse envelope, then each feature alone (drop + count bad ones), dedupe by OSM ref. Category = category mapping table below. Plain address w/o name → "street number". `extent` = `[west, north, east, south]`.
- Nominatim (iff `NOMINATIM_ENABLED`): `/search?q&format=jsonv2&accept-language=en|es|pt-BR&limit&addressdetails=1` only for `intent=submit` when no Photon result name contains the query; `/lookup?osm_ids=W1,N2&format=jsonv2&accept-language&extratags=1` for save-time cache misses. ⊥ autocomplete. Coordinates are strings; `boundingbox` = `[south, north, west, east]`.
- OSRM: `GET {OSRM_URL}/routed-{foot|bike|car}/route/v1/driving/{lng},{lat};…?overview=full&geometries=polyline&steps=false&generate_hints=false&alternatives=false`. Try `OsrmRouteOk` then `OsrmError` whatever status (200 can carry error code). Cut route polyline at snapped waypoints into per-leg polyline5. Snap rule: waypoint `distance` > 1000 m (walk/bike) or > 3000 m (drive) → stop unroutable → its legs estimated, quality `partial`. Never call `/table` or `/trip` (each matrix cell = 1 request under 1 r/s policy).
- Day route algorithm (E40/E27): access → stops w/ coords + effective modes → leg keys → one `SELECT … WHERE key = ANY($1) AND expires_at > now()` → group uncached legs into maximal same-mode consecutive runs → one OSRM call per run (2–25 coords) → split, snap check → upsert routed legs `ON CONFLICT (key) DO UPDATE` after response, outside tx → failed/timeout/no-token legs = estimates. Anonymous viewer: steps up to cache read only; misses → estimates (⊥ upstream). quality: `routed` (none estimated) | `estimated` (all) | `partial`.
- Estimates: straight line (haversine) × 1.4 at walk 4.6 km/h, bike 15 km/h, drive 30 km/h (65 km/h beyond 10 km); `estimated:true`, `provider:'estimate'`, polyline = 2 points; ⊥ cached.
- Plan summaries (E24/E26 `routes`): cache read only, `null` legs for misses; ⊥ provider call.
- Optimiser (`apps/api/src/routing/optimise.ts`): open path on straight-line matrix, first stop fixed, last fixed iff `keepLast`; exact Held-Karp ≤ 12 free stops; above: nearest-neighbour + cheapest-insertion seeds improved by 2-opt + Or-opt; deterministic. Then route suggestion legs (cache/OSRM/estimates) so `after` is real where possible.
- Cache (`provider_cache`, `providers/core/provider-cache.service.ts`): only parsed + mapped successes cached; estimates + errors never. Keys built from validated canonical params (coords rounded 4 decimals for geo, 5 for legs), provider id in key:

what|key|TTL
---|---|---
Photon search|`geo:v1:photon:` + canonical upstream URL|24 h (1 h if empty)
Photon reverse|`geo:v1:photon:` + URL (point rounded 4 decimals)|7 d
Nominatim search / lookup|`geo:v1:nominatim:` + URL|24 h / 30 d
Fake geocoder|`geo:v1:fake:` + …|24 h
Place served to client (search/reverse result)|`place:v1:osm:W:1370081491` → PlaceResult|24 h
Route leg|`leg:v1:{provider}:{mode}:{lng5},{lat5}>{lng5},{lat5}` → `{distanceMeters, durationSeconds, polyline, snapped}`|7 d
- `PlaceResolver.resolve(key)` (`providers/core/place-resolver.ts`): `place:v1:` cache → Nominatim `/lookup` iff enabled → else throw 503 `geocoding_unavailable`.
- Fakes (`providers/fake/`, deterministic, ⊥ clock, ⊥ randomness, same cache + throttle path, provider id `fake` in keys): `gazetteer.ts` ≈ 67 real OSM objects (Lisboa, São Paulo, Rio de Janeiro, Paris, Barcelona) w/ real keys, names per Photon lang (`default` + `en` where they differ; es + pt-BR read `default`), categories, coords — also used by seed. Fake geocoder: case + diacritic-insensitive substring, prefix matches first, then distance to bias, then name; reverse = nearest within 2 km else `[]`; `lookup` resolves gazetteer keys. Fake router: haversine × 1.3 at estimate speeds, 2-point polyline, `estimated:false`, `provider:'fake'`; stop w/ lat > 85 = snapped too far → its legs estimated, `quality:'partial'`. Fault injection: constructor option `{failWith?: ProviderErrorKind}` only.
- Category mapping (`providers/core/categories.ts`), order exact `key=value` → key default → `other`:

category|exact|key default
---|---|---
sight|tourism=attraction,viewpoint,artwork; amenity=place_of_worship,fountain,monastery; man_made=tower,lighthouse,watermill,pier,bridge; building=cathedral,church,chapel,mosque,temple,synagogue,castle; bridge=yes|historic=*, other tourism=*
food|amenity=restaurant,fast_food,food_court|
cafe|amenity=cafe,ice_cream; shop=bakery,pastry,coffee,tea,confectionery,ice_cream|
nightlife|amenity=bar,pub,nightclub,biergarten,casino,stripclub,hookah_lounge,karaoke_box|
lodging|tourism=hotel,hostel,guest_house,motel,apartment,chalet,alpine_hut,wilderness_hut,camp_site,caravan_site; leisure=resort; building=hotel|
shopping|amenity=marketplace|shop=*
nature|leisure=park,garden,nature_reserve; boundary=national_park,protected_area; waterway=waterfall; landuse=forest; tourism=picnic_site|natural=*
beach|natural=beach; leisure=beach_resort|
culture|tourism=museum,gallery; amenity=theatre,arts_centre,cinema,library,planetarium,concert_hall,exhibition_centre|
transport|amenity=bus_station,ferry_terminal,taxi,car_rental,bicycle_rental,parking,fuel,charging_station; highway=bus_stop; building=train_station|railway=*, aeroway=*, public_transport=*, aerialway=*
activity|tourism=theme_park,zoo,aquarium,wine_cellar; craft=winery,brewery; amenity=public_bath,dive_centre,spa|leisure=*, sport=*
other|tourism=information; leisure=playground,dog_park; natural=tree,tree_row; railway=level_crossing,crossing,switch,rail,signal|everything else
Photon `include` for category browsing: nature uses `osm.waterway.waterfall` (⊥ `osm.natural.waterfall`: returns mis-tagged results).
- Attribution text (visible near map, above sheet): pt-BR `© OpenStreetMap contributors (ODbL) · OpenFreeMap · Rotas: OSRM/FOSSGIS · Corrigir o mapa` (link https://www.openstreetmap.org/fixthemap); en `© OpenStreetMap contributors (ODbL) · OpenFreeMap · Routes: OSRM/FOSSGIS · Fix the map`.
- Upstream fixtures: saved real Photon/OSRM (Ok + `NoSegment`, `NoRoute`, `TooBig`, `InvalidQuery`, `InvalidOptions`, `InvalidValue`)/Nominatim bodies → `apps/api/test/fixtures/upstream/`; mapper + schema tests run on them offline (T7, T40, T42).

### I.seed — demo data (`apps/api/prisma/seed.ts` → `seed-database.ts` → `apps/api/prisma/seed/*.ts`)
- Idempotent (`upsert` by fixed UUIDv7 constants, e.g. `0193a000-0000-7000-8000-000000000101`), deterministic (fixed 2026 `createdAt` dates, ⊥ `now()`), ⊥ network, refuses `NODE_ENV=production`. Password for all = `DEMO_PASSWORD` hashed at seed time.
- Users (7, all `is_demo=true`, `@example.com`): `demo@example.com` "Demo Traveller" (en; fixed demo login), "Ana Ribeiro-Teste" (pt-BR, `role=moderator`), "Bruno Cavalcanti-Teste" (pt-BR), "Carla Mendes-Teste" (pt-BR), "Diego Lorenzo-Prueba" (es), "Elena Hart-Test" (en), "Núria Ferrer-Prueba" (es, Barcelona). Names invented, ⊥ real people.
- Places ≈ 67 canonical from `providers/fake/gazetteer.ts` (Barcelona 9: bodies `responses-seed/seed_barcelona_*`, 15 Photon calls 2026-11-19, 1 unused body dropped).
- Trips (11): 8 public (2 Lisboa, 2 Rio, 2 São Paulo, 1 Paris, 1 Barcelona by Núria w/ notes; 2–4 days, 3–7 stops/day, mixed modes; 2 are copies of others → `copyCount`, `copiedFrom` render), 1 `link`, 2 private of demo user ("Lisboa em 3 dias": 2 days scheduled + 4 ideas, notes on some places; "Próxima viagem": empty → empty state).
- Reviews ≈ 115 en + es + pt-BR, written for the seed (⊥ copied from review sites), `visited_on` 2025–2026: some places ≥ 6 reviews (average shown), many 1–5 (count only), some 0.
- Reports: 1 review w/ 2 open reports, 1 dismissed report → moderation queue ≠ empty.
- Exported constants for tests: `DEMO_USER`, `SEED_USERS`, `LISBON_TRIP_ID`, `BARCELONA_TRIP_ID`, gazetteer keys.

### I.web.routes — route tree (`apps/web/src/app/`; locale always prefixed, segments English in both locales)
path|file|render|access|index
---|---|---|---|---
`/` → `/<locale>`|`proxy.ts` (next-intl: `NEXT_LOCALE` cookie → best `Accept-Language` match ∈ en/es/pt-BR → `en`)|-|all|-
`/[locale]`|`[locale]/(public)/page.tsx` landing|RSC; community strip E48 `limit=6` (hidden if empty/error); CTA "Começar a planejar" → signup (signed in → `/trips`)|all|yes
`/[locale]/explore?q=`|`(public)/explore/page.tsx`|RSC first page, "Load more" client|all|yes
`/[locale]/t/[tripId]?day=&place=&mode=`|`(public)/t/[tripId]/page.tsx`|RSC E24 → read-only planner (map lazy)|public ¬hidden (owner → redirect to `/trips/[tripId]`)|yes
`/[locale]/s/[shareToken]?day=&place=&mode=`|`(public)/s/[shareToken]/page.tsx`|RSC E26 → read-only planner|token holders|`noindex`
`/[locale]/places/[placeId]`|`(public)/places/[placeId]/page.tsx`|RSC E44 + first E45 page|all|iff ≥ 1 review
`/[locale]/u/[userId]`|`(public)/u/[userId]/page.tsx`|RSC E15–E17|all|iff public content
`/[locale]/about`, `/[locale]/privacy`|`(public)/{about,privacy}/page.tsx`|static RSC|all|yes
`/[locale]/login?next=`, `/[locale]/signup?next=`|`(auth)/{login,signup}/page.tsx`|RSC shell + client form|all (signed in → redirect `/trips`)|`noindex`
`/[locale]/trips`|`(app)/trips/page.tsx`|RSC first page E18 + client "Load more"|req|`noindex` (all `(app)`)
`/[locale]/trips/new`|`(app)/trips/new/page.tsx`|client form → E19 → planner `?day=ideas`|req|
`/[locale]/trips/[tripId]?day=&place=&mode=`|`(app)/trips/[tripId]/page.tsx` + `_components/`|RSC E24 → `PlannerScreen` client root (`initialData`)|owner (viewer → redirect `/t/[tripId]`, else `notFound()`)|
`/[locale]/trips/[tripId]/settings`|`(app)/trips/[tripId]/settings/page.tsx`|RSC E20 + client forms|owner|
`/[locale]/places/[placeId]/review`|`(app)/places/[placeId]/review/page.tsx`|RSC E44 (`myReview` prefill) + client form|req|
`/[locale]/settings`|`(app)/settings/page.tsx`|RSC E8 + client leaves|req|
`/[locale]/moderation`|`(app)/moderation/page.tsx`|RSC E50 + client decision buttons|mod (else `notFound()`)|
Files: `[locale]/layout.tsx` (root: `<html lang data-theme>`, fonts, nonce'd theme script, providers, Toaster), `[locale]/error.tsx`, `[locale]/not-found.tsx`, `app/global-error.tsx`, `(app)/layout.tsx` = `ViewerGate` (`getViewer()` null → `redirect('/<locale>/login?next=<path>')`), each data route ships `loading.tsx` skeleton.
`next` param valid iff starts `/<locale>/` ∧ ⊥ starts `//` (zod in `lib/routes.ts`). Language switcher = link to same path under other prefix (+ PATCH E9 `locale` when signed in).

### I.web.dirs — folders (`apps/web/src/`; shared ⊥ imports features; features ⊥ import each other; composition in `app/`)
- `proxy.ts` (next-intl locale + CSP nonce + security headers), `env.ts`, `i18n/{routing.ts,request.ts,navigation.ts}` (next-intl 4.15.1; locale from `[locale]` param / `next/root-params`), `messages/{en,es,pt-BR}/<ns>.json` (namespaces: `common`, `auth`, `trips`, `itinerary`, `place-search`, `reviews`, `explore`, `settings`, `map`, `legal`; `en` = source type, `es` + `pt-BR` `satisfies` it).
- `lib/api/`: `client.ts` (`apiFetch(def, {params, query, body, signal})`: builds `/api/v1` URL from `def.path`, JSON, `!res.ok` → throw `ApiProblemError(problemDetailsSchema.parse(body))`, returns body typed `EndpointOutput<def>` ⊥ parse), `server.ts` (`import 'server-only'`; `serverFetch(def, …)` → `API_URL`, forwards ONLY `Cookie: <SESSION_COOKIE_NAME>=<value>` + `X-Request-Id`, 5 s timeout, GET only; `getViewer()` = React `cache()` around E8, 401 → `null`), `problem.ts` (exists: `ApiProblemError`, `errorFromResponse`), `query-client.ts` (exists: V24 policy; + global `QueryCache`/`MutationCache` `onError` 401 → login redirect except `['viewer']` queries + public routes), `query-keys.ts` (§I.web.keys, all keys + `queryOptions` factories).
- `lib/format/`: `distance.ts` (< 1 km → metres rounded 10 m; else km 1 decimal; `Intl.NumberFormat` unit; metric only), `duration.ts` (`Intl.DurationFormat` when present else `{h} h {m} min`; ≥ 1 h drops seconds; < 1 min → "< 1 min"), `dates.ts` (`YYYY-MM-DD`/`YYYY-MM` w/ `timeZone:'UTC'`; relative time w/ `now` from server render).
- `lib/routes.ts`: typed builders for every route above.
- `shared/styles/{tokens.css,reset.css,base.css}` (imported once in root layout), `shared/icons/` (inline SVG components from Lucide, `aria-hidden`, + ISC `LICENSE` notice; set listed in `icons.test.tsx`), `shared/theme/` (`theme.ts`: script, `applyTheme`, `THEME_COLORS`; `use-chosen-theme.ts`), `shared/components/{brand-mark,mode-icon,trip-thumbnail}/`, `shared/hooks/` (`use-media-query`, `use-reduced-motion`, `use-online` via TanStack `onlineManager`).
- `shared/components/`: base (T21): `button`, `icon-button` (! `aria-label`), `link-button`, `field` (label + hint + error wiring L11), `text-field`, `text-area`, `password-field` (show/hide, paste allowed), `dialog` (native `<dialog>` + `showModal()`, initial focus least destructive, focus returns), `toast` (Toaster + single polite live region; actions Undo/Retry/Change), `skeleton` (appears after 250 ms), `empty-state`, `error-state` (message + Retry + `code` + request id), `spinner`, `status-line` (Saving… / Saved / Not saved), `visually-hidden`, `app-bar`, `offline-banner`. Rich (T50–T52): `bottom-sheet`, `sortable-list` (generic ids + render fn), `popover-menu` (native `popover="auto"` + `<button>` list, ⊥ `role="menu"`), `segmented-control`, `chip-row` (h-scroll, selected scrolled into view), `rating-input` (radio group of 5, 44 px, arrows), `rating-stars`, `demo-badge` ("Exemplo"/"Example").
- `shared/map/`: `map-view.tsx` (moved from skeleton `components/map`; `MapView`, `useMap`, `isMapAlive`), `basemap.ts` (style URLs from env, `localizeLabels`, `keepOurLayers`, fallback), `pins-layer.tsx` (generic `{id, label?, colorToken, variant:'stop'|'idea'|'saving', order?}`), `route-line-layer.tsx`, `draft-pin.tsx`, `long-press.ts`, `geo.ts` (polyline5 decode, bounds), `use-map-padding.ts`, `trip-map.tsx` (`next/dynamic({ssr:false})` wrapper). Knows pins/lines/colours, ⊥ stops/days.
- `features/auth/` (LoginForm, SignupForm, LogoutButton, viewer hooks), `features/trips/` (TripCard, TripList, TripForm, VisibilitySettings, ShareLink, CopyTripButton, DeleteTripDialog), `features/explore/` (PublicTripCard, ExploreSearch, Landing), `features/itinerary/` (DayChips, DaySummary, ModeSwitch, StopList (read-only), EditableStopList (owner, dnd-kit), StopRow, StopActions, LegRow, LegActions, OptimisePreview, PlaceCard (trip context: note + day + `communitySlot` prop), NoteEditor, AddHereButton, ReadOnlyItinerary, `trip-to-geojson.ts`, `nav-links.ts`, `apply-plan-ops.ts` (pure `applyMove`, `applyReorder`, `applyRemove`, …), `use-planner-params.ts`, mutations), `features/place-search/` (PlaceSearch combobox, WhatsHereCard), `features/reviews/` (RatingSummary, ReviewList, ReviewItem, ReviewForm, ReportDialog, BlockUserButton, ModerationQueue), `features/settings/` (ProfileForm, PreferencesForm, PasswordForm, BlockedUsers, DeleteAccountDialog).
- Planner client root `app/[locale]/(app)/trips/[tripId]/_components/planner-screen.tsx` composes itinerary + place-search + reviews + `shared/map`; public/shared pages compose `ReadOnlyItinerary` + `shared/map`.
- Skeleton migration: `src/components/map/*` → `shared/map/`; `src/components/health/*` + `src/app/page.tsx` + `src/app/globals.css` removed (landing + tokens replace them); `src/app/layout.tsx` → `[locale]/layout.tsx`.

### I.web.params — URL state (nuqs 2.10.3; fallback `useSearchParams` + router; ⊥ mirrored into `useState`)
param|values|history|scope
---|---|---|---
`day`|`ideas` \| `all` \| dayId|replace|planner, `/t`, `/s` (default: first day w/ stops, else `ideas`; new trip → `ideas`)
`place`|tripPlaceId|push (Back deselects)|planner, `/t`, `/s`
`mode`|`walk\|bike\|drive`; absent = day's saved mode|replace|planner, `/t`, `/s` (owner change → URL replace + PATCH E33 `modeOverride`; viewer → URL only, E40/E27 `?mode=`)
`q`|text ≤ 80|replace|explore
`sort`|`recent\|lowest`|replace|place page reviews
`next`|validated path|-|login/signup
`copy`|`1`|-|`/t`, `/s` after login → resume copy iff this tab's `hm-copy-intent` marker matches
All `shallow: true`. Sheet snap, draft pin, "What's here" mode, optimise preview open = local `useState` in `PlannerScreen` (+ `PlannerUiContext` for snap only).

### I.web.keys — TanStack Query keys (`apps/web/src/lib/api/query-keys.ts`, `queryOptions()` factories)
key|endpoint|staleTime / notes
---|---|---
`['viewer']`|E8|5 min; seeded from RSC; 401 → `null`, ⊥ redirect
`['trips','mine']`|E18|30 s; `useInfiniteQuery`, `getNextPageParam: p => p.nextCursor`
`['trips', tripId]`|E20|30 s
`['trips', tripId, 'plan']`|E24|30 s, `refetchOnWindowFocus: true`; `initialData` from RSC + `initialDataUpdatedAt`
`['trips', tripId, 'route', dayId, planVersion, mode]`|E40 (`mode` = URL mode or `null`)|`Infinity`, `gcTime` 30 min, `placeholderData: keepPreviousData`; fetched only for visible day(s) whose summary has a null leg, or when `mode` ≠ saved
`['trips', tripId, 'order-suggestion', dayId, planVersion, keepLast]`|E41|`Infinity`; `enabled` only while preview open
`['shared', shareToken, 'plan']`|E26|30 s
`['shared', shareToken, 'route', dayId, planVersion, mode]`|E27|as route
`['places','search', {q, locale, near, zoom, intent}]`|E42|5 min; `near` rounded 2 decimals; `signal` aborts; enabled iff q ≥ 3 after NFKC trim; 300 ms debounce
`['places','reverse', {lng, lat, locale}]`|E43|1 h; coords rounded 4 decimals; only on explicit tap/long-press/Add-here (⊥ on map move except Add-here mode `moveend` debounced 400 ms)
`['places', placeId]`|E44|5 min
`['places', placeId, 'reviews', sort]`|E45|60 s; infinite
`['explore', {q}]`|E48|60 s; infinite
`['users', userId]`, `['users', userId, 'trips']`, `['users', userId, 'reviews']`|E15–E17|60 s; lists infinite
`['me','blocks']`|E12|60 s; infinite
`['moderation','reports', status]`|E50|0
Invalidation: plan mutations → `['trips', tripId, 'plan']` on settle (routes follow new `planVersion`, ⊥ invalidated) + `['trips','mine']` when counts change; E21/E23 → `['trips', tripId]` prefix; E19/E22/E25/E28 → `['trips','mine']`; E46/E47 → `['places', placeId]` prefix; E49 none; E51 → `['moderation']`; E13/E14 → `['me','blocks']` + `['places']` + `['explore']`; E9 → `['viewer']`.

### I.web.mutations — plan mutation contract (every plan mutation)
- `mutationKey: ['trips', tripId]`, `scope: { id: 'plan:' + tripId }` (serial, in order), ⊥ retry. `onMutate`: cancel + snapshot `['trips', tripId, 'plan']`, apply pure op; `onError`: restore snapshot + toast (problem `detail`) w/ Retry (same payload); `onSettled`: invalidate plan. Verify exact v5.108 callback signatures against installed types before coding.
- Global "Saving…" in app bar after 400 ms via `useIsMutating({ mutationKey: ['trips', tripId] })`. Offline (`onlineManager`) → persistent banner "Você está offline. As alterações estão pausadas." + edit controls disabled.

action|endpoint|optimistic|failure / special
---|---|---|---
Add from search/what's-here|E29 (osm key or custom; `schedule` = selected day unless Ideas/All)|row + pin (opacity 0.6, `aria-busy`)|rollback, toast "Não foi possível adicionar <name>. Tentar de novo", place stays selected. 409 `place_already_in_trip` w/ schedule → call E35 w/ returned `tripPlaceId`; w/o schedule → select existing. Success toast "Adicionado ao Dia 2 · Alterar · Desfazer"
Edit note|E30 `{note}`|text stays; status line|autosave 800 ms after last key + on blur; failure "Não salvo. Tentar de novo", text kept + mirrored in `sessionStorage` `hm-draft:note:<tripPlaceId>` (`shared/storage/session-drafts.ts`; ⊥ on logout/401) until saved; draft found on reload → saved
Move up/down/first/last, Move to day, drag drop|E37|yes|rollback + Retry; 409 `day_full` → toast; live region "Castelo, agora 3 de 4 no Dia 2"
Apply optimisation|E36|yes|409 `plan_changed` → refetch + toast "A viagem mudou em outro lugar; mostrando a versão atual"; Undo = E36 w/ old order
Remove from day|E39|row collapses|rollback; Undo (10 s, toast w/ button) = E35 w/ tripPlaceId at old index
Delete from trip|E31|row + pin removed|rollback; Undo (10 s) = E29 re-add from snapshot (osm key + note; custom name/category/location/note → new id) + E35 per old stop
Leg mode|E38|yes|rollback + toast
Day mode|E33 + URL `mode` replace|URL at once on apply (click/tap, Enter, Space; arrows only move choice, ⊥ save, WCAG 3.2.2)|failure → toast "Modo não salvo"; URL stays
Create day|E32|yes|rollback
Delete day|E34|empty: yes; w/ stops: `<dialog>` confirm first (CD8)|rollback
Custom pin rename/move|E30|yes|rollback

### I.web.screens — screen behaviour
Grid: phone 360–767 single column, 16 px gutters; tablet 768–1023 side panel 360 px; desktop ≥ 1024 side panel 400 px (440 ≥ 1280). App bar 56 px + `env(safe-area-inset-top)`. Phone primary actions in bottom third / mid-height. Forms left-aligned in grid (⊥ dead-centred card), max 420 px (review 560 px). Every data screen: loading (skeleton after 250 ms), empty, error (region-scoped, Retry + code + request id), success.

- Landing: eyebrow chip + h1 (`<em>` highlight in accent via `t.rich`) + lead + CTA (+ "See public trips" link) + 3 numbered steps (Marque / Organize / Siga; cards, number + icon tile in `--day-1..3`) + static SVG illustration (⊥ live map; LCP = text) + community strip (6 PublicTripCards w/ real maps, h-scroll on phone) + sticky bottom CTA on phone (glass bg).
- Sign up: fields Nome, E-mail (`type=email autocomplete=email`), Senha (`autocomplete=new-password`, show/hide, hint "mínimo 12 caracteres" linked by `aria-describedby`); sends route `locale`; errors on blur then change; 422 pointers → `setError`; 409 `email_taken` → e-mail field error + "Entrar" link; 429 → form alert w/ `Retry-After` seconds; button 48 px full width, "Criando…" while submitting. Success → `router.replace(next ?? '/<locale>/trips/new')`. Login same pattern (`autocomplete=current-password`); copy says password reset is by contacting the operator (no e-mail).
- My trips: cards (`TripThumbnail` real map of `previewPoints` on top w/ visibility badge (Lock/Link/Globe icon) over it, title in Fraunces, destination (MapPin), dates or "N dias" + places (CalendarDays), whole card one link), order last updated, "Carregar mais" (⊥ infinite scroll). Empty: "Você ainda não tem viagens" + "Nova viagem" + "Ou copie uma em Explorar". FAB "Nova viagem" 56 px bottom-right above safe area (phone); header button desktop. Idle-time `import('@/shared/map/map-view')` warms map chunk.
- Create trip: Título (1–120), Destino (combobox E42 `intent=submit`; free text allowed → `center:null`), Datas optional (start + end → `dayCount = end − start + 1`) or "Número de dias" 1–60 (default 1); primary "Criar e abrir" → planner `?day=ideas`.
- Trip settings: Título, Descrição, Destino, start date (day count changes only in planner), default mode; Visibilidade radio Privada / Por link (never listed) / Pública (listed in Explore, dates hidden); share link `/<locale>/s/<shareToken>` w/ Copiar + `navigator.share` when present + "Gerar novo link" (E23, old link dies); "Duplicar" (E25); danger zone "Excluir viagem" far from primary, `<dialog>` confirm. Visibility = local choice + "Salvar visibilidade" button → single PATCH w/ inline status (⊥ arrow-key publish); failure keeps choice + form alert.
- Planner (phone < 768): map full height behind non-modal bottom sheet; app bar `[<] title [⋯]`; search pill under app bar (48 px); floating right-edge mid-height "Adicionar aqui" (56 px) + "Minha localização" (44 px); attribution compact top-left. Sheet header (drag area) = handle button + day chips row `(Ideias)(Todos)(Dia 1)…(+)` + day summary "Dia 2 · 4 lugares · 3,2 km · 48 min". ≥ 768: side panel = same `BottomSheet` markup switched by CSS `@media (min-width: 768px)` (`PANEL_QUERY`; ⊥ `variant` prop, ⊥ JS width switch → server HTML right at every width), gestures no-op; place card replaces panel content w/ Back (one panel, ⊥ stacking); map width stable. DOM order: app bar → search → sheet/panel (skip-to-map link first) → map region → floating buttons.
- Sheet snaps: peek 136 px + `env(safe-area-inset-bottom)` (handle, chips, summary); half 50 dvh (+ list or place card); full 100 dvh − 56 − 8 px. Drag from header only (Pointer Events), list scrolls itself w/ `overscroll-behavior: contain`; release → nearest snap, or next in fling direction when |v| > 0.5 px/ms. Handle = `<button>` cycling peek → half → full → half on tap/Enter, `aria-label` states current snap ("Painel: meia altura. Expandir"). Open default: half if selected day has stops else peek. Selecting a place → half; panning map at full → half. Snap settle → `map.easeTo({padding:{bottom: heightPx}})` (⊥ per drag frame, ⊥ map resize); `useMapPadding`: first padding (map had none) `jumpTo` at once ∧ `MapPadding` mounted before `mapLayers` ∴ the day fit sees it; phone planner also pads `top: 64` (8 + 48 search pill + 8) so a fit never hides a stop under the pill; a later change w/ a camera move running (`map.isMoving()`) waits for `moveend` (every camera call `stop()`s the running one; B18). Non-modal `<section aria-labelledby>`, ⊥ focus trap, ⊥ `inert` on map. `scroll-padding-bottom` = sheet/CTA height.
- Planner tasks (phone taps): search+add = tap pill → type ≥ 3 chars (300 ms debounce) → results (6, biased to map centre) → tap result (map eases, draft pin, place card at half) → "Adicionar ao Dia 2" → toast (3 taps). Long-press map 500 ms (maplibre `contextmenu`; suppress lift-click) → draft pin + "O que tem aqui?" card (E43 ≤ 5 + "Usar este ponto exato") → pick → Adicionar. Button twin "Adicionar aqui" → crosshair at visible map centre (`map.getCenter()` honours padding), card refreshes on `moveend` debounced 400 ms while mode open. Custom pin: "Usar este ponto exato" → Nome (required) → Adicionar; keyboard: draft DOM marker focused, arrows move it (maplibre step; Shift larger — test real step), Enter opens card; "Coordenadas" disclosure accepts typed `lat, lng`. Select = tap pin or row name button → `?place=` push, pin grows (radius 18, stroke 4, accent halo), row `aria-current="true"` + `scrollIntoView({block:'nearest'})` only when selection came from map; focus moves to card heading only when from keyboard. Day assign = card "Dia: Ideias ▾" popover. Reorder: row ⋮ → Mover para cima / para baixo / para o início / para o fim / Mover para o dia… (+ "Novo dia"); drag by ≡ handle (TouchSensor delay 200 tolerance 6, PointerSensor distance 4, KeyboardSensor) within a day; cross-day drag only desktop (drop on chip). Remove menu has two actions: "Remover do dia" (E39) and "Excluir da viagem" (E31). Note = card textarea autosave. Switch day = chip (map `fitBounds` padding 24, maxZoom 16, duration 0 under reduced motion).
- Routes UI: one RouteLineLayer for selected day; `Todos` = every day at 60 % opacity + pins in day colours (clusters only in Todos at zoom < 12; ⊥ cluster numbered day stops). Leg row between stops "12 min · 900 m"; estimated leg dashed + "≈ 15 min (estimativa)"; summary appends "inclui estimativas"; 1 stop → "Adicione outro lugar para ver a rota"; `partial` → banner "1 lugar não pôde ser alcançado a pé; tempos são estimativas" naming stop. Mode segmented control Walk/Bike/Drive in summary; leg tap → popover Walk/Bike/Drive + "Google Maps" / "Apple Maps" hand-off (one leg, origin → destination, matching mode; `nav-links.ts`). Route fetch slow → previous route dimmed + thin progress bar; error → "Rota indisponível. Tentar de novo" + client straight-line dashed legs labelled estimates. "Otimizar ordem" under list (owner, ≥ 3 stops) → preview (before/after time, numbered diff, toggle "Manter último lugar" default on; first always fixed) → Aplicar → toast w/ Undo.
- Read-only trip (`/t`, `/s`): same layout, ⊥ edit affordances, ⊥ notes, ⊥ dates ("4 dias"); author + demo badge; sticky "Copiar para minhas viagens" (signed out → login `?next=<this>&copy=1`, resumes copy; signed in → E25/E28 → toast "Abrir cópia"); report link (E49 trip) in footer; mode switch works (URL only).
- Place page: name, category · label, small map 180 px (`cooperativeGestures: true`), RatingSummary ("4,4 ★ 12 avaliações" + distribution bars only when count ≥ 6; else "3 avaliações", no average; 0 → "Ainda sem avaliações. Esteve lá? Escreva a primeira."), sort recent|lowest, ReviewItem (author + demo badge, "visitou em out. 2026", stars, body, ⋯ → Denunciar / Bloquear usuário), "Carregar mais", sticky "Escrever avaliação" (→ review page; my review → "Editar minha avaliação"). Desktop 2 columns (summary + map 40 % left, reviews right).
- Review form: Nota (radio group 5 × 44 px, arrows), "Quando você foi?" (`type=month`, required, ≤ current month), Sua opinião (10–2000, counter `aria-live=polite` throttled), note "Sem e-mail, sem fotos: só texto público."; prefilled when `myReview` → "Atualizar" + "Excluir minha avaliação". Success → place page, toast "Avaliação publicada", own review first.
- Explore: h1 w/ Compass tile, search field (`?q=`, links work w/o JS), PublicTripCard (`TripThumbnail` real map on top w/ mode chip (ModeIcon + "A pé") over it, title, "Lisboa · 4 dias · 18 lugares" (MapPin), "por Ana" + demo badge, "Copiada 12 vezes" (Copy icon); hover lift `--shadow-lift`), "Carregar mais". Empty search: "Ainda não há viagens públicas para 'Fiji'" + "Planeje você mesmo".
- Profile `/u/[userId]`: display name + demo badge, "membro desde <mês ano>", public trips + reviews lists.
- Settings: one scrolling page, anchored sections: Perfil (display name), Preferências (Idioma stacked radios English/Español/Português (Brasil) — 3 names ⊥ fit a segmented control at 360 px; Tema Sistema/Claro/Escuro — choice local, "Salvar preferências" button saves both (E9), theme applied on save; ⊥ save on arrow key), Segurança (change password form), Privacidade (blocked users + Desbloquear), Conta (Sair, Sair de todos os dispositivos, Excluir conta → `<dialog>` asking password; warns public trips + reviews disappear).
- Moderation: list of ReportItems (target excerpt + link, reason, details, reporter, date, content status) + 3 buttons (Ocultar conteúdo / Restaurar / Dispensar).
- About: what Heremita is, attribution (OSM ODbL, OpenFreeMap, OSRM/FOSSGIS, Photon/komoot, Nominatim/OSMF if enabled), operator contact `CONTACT_EMAIL`. Privacy: names komoot (Photon), OSMF (Nominatim), FOSSGIS (routing), OpenFreeMap (tiles: IP) as recipients of queries/coordinates; what we store (account, trips, notes private, reviews public); deletion; no e-mail, no tracking.
- Theme: signed in → `<html data-theme>` from `Me.theme` server-side; anonymous → nonce'd inline script reads `localStorage['hm-theme']` before paint; `system` → `prefers-color-scheme`. Signed-in change → E9 + immediate attribute swap. `applyTheme` also rewrites every `<meta name="theme-color">` (override → that theme's `--color-bg`; system → each meta its own media colour); `generateViewport` renders one colour for a signed-in override, the media pair otherwise.
- Site chrome: app bar = brand (`BrandMark` tile + name, name hidden < 400 px) + nav w/ icons (Explore = Compass, hidden on phone; My trips = Map, icon-only < 480 px w/ visually hidden text; `AccountMenu` = avatar initial + name + ChevronDown → popover Settings / Moderation / Log out w/ icons) + `PreferencesMenu` (Languages icon button → popover: 3 language links to same page under other prefix, current `aria-current` + Check; theme `SegmentedControl` System/Light/Dark w/ Monitor/Sun/Moon, applies at once via `applyTheme`, signed in → PATCH E9 `theme`, failure → revert + toast). ⊥ `display` on a `[popover]` rule (overrides UA `display:none` of a closed popover: V-note B16); only `:popover-open`. Footer = brand + tagline (`meta.description`), Explore/About/Privacy w/ icons, language switcher (`useLanguageSwitch` hook shared w/ the menu). App icons: `app/icon.svg` (mark), `app/apple-icon.tsx` (`next/og`, proxy matcher excludes `apple-icon`), `app/manifest.ts` (`/manifest.webmanifest`).
- Trip card maps (`shared/components/trip-thumbnail/`): `TripThumbnail` = `RouteSketch` SVG placeholder (projected `previewPoints`, `thumbnail-geometry.ts`) + `<img alt="">` of the real map once drawn + "Mapa © colaboradores do OpenStreetMap" credit; draws only once near the viewport (IntersectionObserver, 240 px margin) and again on theme/label-language change; `import('@/shared/map/static-map')` on demand (map chunk ⊥ critical path). `shared/map/static-map.ts` `renderStaticMap({points, theme, language})` → object URL (JPEG 0.86): ONE hidden `inert aria-hidden` MapLibre map (400×240 CSS px, `interactive:false`, `attributionControl:false`, `fadeDuration:0`, `preserveDrawingBuffer`), jobs serial on one WebGL context (browsers cap ≈ 16), `cameraForBounds` padding 28 maxZoom 15 (1 point → zoom 14), own source `h-thumb` (dashed line in visit order + dots, first = accent, rest `--color-primary`, white stroke; `keepOurLayers` carries them over theme swaps via `attachBasemap`), snapshot = 2D canvas filled `--color-surface` + GL frame (blank style stays opaque), `idle` awaited, 15 s job timeout → dispose, session cache ≤ 80 (LRU, revoke), renderer disposed 30 s after last job, `GPUInitializationError` → `unavailable` (⊥ retry) → sketch stays. ⊥ `data-map-state` on it (e2e `visit` waits for that attribute).

### I.tokens — design tokens (`apps/web/src/shared/styles/tokens.css`; components ⊥ hard-code colour/spacing/size)
Brand: "Tide pool" (hermit crab carries its shell): warm sand ground, deep teal action, crab coral accent for the one thing that matters (selected pin, marketing primary). ⊥ purple/violet anywhere.
Colour, light (`:root`, `[data-theme="light"]`) | dark (`[data-theme="dark"]`, and `@media (prefers-color-scheme: dark)` on `:root:not([data-theme])` / `[data-theme="system"]`):

token|light|dark
---|---|---
`--color-bg`|`#F5EFE3`|`#0F1619`
`--color-surface`|`#FFFCF6`|`#162024`
`--color-surface-raised`|`#FFFFFF`|`#1D2A2F`
`--color-text`|`#1C2629`|`#EBE5D9`
`--color-text-muted`|`#535E62`|`#A6AFB0`
`--color-primary`|`#0E5A60`|`#6CC7C2`
`--color-on-primary`|`#FFFFFF`|`#0B2224`
`--color-primary-soft`|`#DCEBEA`|`#173A3C`
`--color-accent`|`#B8432A`|`#F0896B`
`--color-on-accent`|`#FFFFFF`|`#2A0E06`
`--color-accent-soft`|`#F7E1DA`|`#3A211B`
`--color-danger`|`#A8261C`|`#FF8A80`
`--color-success`|`#2C6637`|`#7BCB8A`
`--color-warning`|`#8A5A00`|`#E9B65C`
`--color-border` (decorative only)|`#D8CDB8`|`#2C3A40`
`--color-border-control` (inputs, chips, toggles ≥ 3:1)|`#8C8273`|`#6E7C80`
`--color-focus`|`#0E5A60`|`#6CC7C2`
Measured ratios (light): text/surface 15.09, muted/surface 6.52, primary/surface 7.74, accent/surface 5.29, on-primary/primary 7.92, border-control/surface 3.69; (dark): text/surface 13.22, muted/surface 7.41, on-primary/primary 8.35, border-control/surface 3.84. Re-check any change.
Day colours (pins + routes, same both themes, white 2 px stroke, white number ≥ 4.5:1): `--day-1 #0E5A60` tide · `--day-2 #B8432A` crab · `--day-3 #3D5A99` harbour · `--day-4 #9A5B00` amber · `--day-5 #2C6637` kelp · `--day-6 #8E3B6A` urchin · `--day-7 #4F5B12` olive · `--day-8 #41535E` slate; day 9+ cycles (number carries identity). Map paint values read via `getComputedStyle` at layer creation + on theme change.
Focus ring: `outline: 3px solid var(--color-focus); outline-offset: 2px`; over map + 2 px `--color-surface` inner box-shadow.
Type: headings **Fraunces** variable (OFL; weight 600, `SOFT 50`; h1–h3 + trip titles only); text/UI **Atkinson Hyperlegible Next** variable (OFL; 400/600/700); `next/font/google` self-hosted, `display:'swap'`, subsets `latin` (preload body latin only; latin-ext/vietnamese faces still load on demand via `unicode-range`); body fallback `'Atkinson Fallback'` = local Arial w/ metric overrides (`base.css`; next/font has none); Fraunces keeps `opsz` (auto optical sizing uses it); distances/times `font-variant-numeric: tabular-nums` (accept proportional if font lacks `tnum`).

token|size|line-height|use
---|---|---|---
`--text-xs`|12px|1.4|attribution, badges
`--text-sm`|14px|1.45|meta, leg lines
`--text-md`|16px|1.5|body, inputs (≥ 16 px: no iOS zoom)
`--text-lg`|`clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` 16→20|1.3|card titles, sheet summary
`--text-xl`|`clamp(1.25rem, 1.05rem + 0.8vw, 1.5rem)` 20→24|1.25|h2
`--text-2xl`|`clamp(1.5rem, 1.1rem + 1.6vw, 2rem)` 24→32|1.15|h1 app pages
`--text-3xl`|`clamp(2rem, 1.2rem + 3.2vw, 3rem)` 32→48|1.1|landing h1 only
Spacing `--space-1 4px` `--space-2 8px` `--space-3 12px` `--space-4 16px` `--space-6 24px` `--space-8 32px` `--space-12 48px` `--space-16 64px` (16 in cards, 24 between cards, 32 between sections; padding ≤ surrounding margin).
Radii `--radius-sm 4px` `--radius-md 8px` (buttons, inputs, rows) `--radius-lg 16px` (cards, sheet top, dialogs) `--radius-full 9999px` (chips, FABs).
Elevation light `--shadow-1: 0 1px 2px rgb(28 38 41 / 0.12)` (cards) `--shadow-2: 0 4px 12px rgb(28 38 41 / 0.14)` (FAB, popovers) `--shadow-3: 0 -6px 24px rgb(28 38 41 / 0.16)` (sheet) `--shadow-lift: 0 12px 28px rgb(28 38 41 / 0.16)` (hovered card, hero frame); dark same offsets w/ `rgb(0 0 0 / 0.5)` + surfaces lighten w/ height.
Translucent: `--color-surface-glass` (`rgb(255 252 246 / 0.86)` / `rgb(22 32 36 / 0.86)`; chips over maps, sticky CTA; contrast checked as `--color-surface`), `--color-primary-glow` / `--color-accent-glow` (hero radial glows only; ⊥ under text). `--radius-xl 24px` (hero frame).
Motion `--duration-fast 120ms` (pressed) `--duration-base 200ms` (popovers, chips) `--duration-slow 320ms` (sheet) `--ease-out cubic-bezier(0.2, 0, 0, 1)` `--ease-in cubic-bezier(0.3, 0, 1, 1)`; `prefers-reduced-motion: reduce` → all 0ms except opacity fades 120ms; map camera `duration: 0`. Pressed state everywhere: `transform: scale(0.97)` + `--color-primary-soft` bg.
Sizes `--target-min 44px` · `--app-bar-height 56px` · `--fab-size 56px` · `--chip-height 44px` · `--row-height-leg 48px` · `--sheet-peek 136px`.
Map markers (GL layers, ⊥ DOM except draft pin): stop circle r14 day colour + white stroke 2 + white number `Noto Sans Bold` 13 (OFM glyphs; VersaTiles `noto_sans_bold`); hit circle r22 opacity 0 (44 px); selected r18 stroke 4 + halo r24 `--color-accent` 0.35; idea r9 ring fill surface stroke 3 text; saving opacity 0.6; draft pin 40 px teardrop `--color-accent` + crosshair glyph; cluster circle `--color-primary` w/ count; route line day colour width 3→7 over white (light) / `#0F1619` (dark) casing; estimated legs `line-dasharray [1, 1.5]`.

### I.web.map — MapLibre usage (`shared/map/`)
- Load via `next/dynamic({ssr:false})` from a client component; `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())` once at module level; Turbopack rule (`next.config.ts`) runs `scripts/maplibre-url-loader.mjs` on `maplibre-gl/dist/maplibre-gl.mjs` (`new URL(` → `new globalThis.URL(`) ∴ its fallback-worker `new URL("./" + name, import.meta.url)` ⊥ read as asset glob ∴ dist dev builds (`maplibre-gl-dev.mjs` 2.5 MB, `maplibre-gl-worker-dev.mjs` 1.3 MB) + duplicate lib ⊥ in output; import `maplibre-gl/dist/maplibre-gl.css` (keeps canvas `touch-action`).
- One map per screen; create in effect, `remove()` in cleanup; child layers guard cleanup w/ `isMapAlive(map)` (parent cleanup runs first); container div empty in JSX; camera props initial-only.
- Options: `pixelRatio: Math.min(devicePixelRatio, 2)`, `dragRotate:false`, `pitchWithRotate:false`, `touchPitch:false`, `touchZoomRotate.disableRotation()`, `attributionControl:false` + `AttributionControl({compact:true})` top-left, `locale` w/ translated strings (`Map.Title` "Mapa da viagem", controls, cooperative-gesture help), `GeolocateControl({positionOptions:{enableHighAccuracy:true}, trackUserLocation:false, fitBoundsOptions:{maxZoom:15}})` (error → toast). Planner: default gestures; embedded small maps: `cooperativeGestures: true`.
- Sources/layers ids prefixed `h-`; pins source `promoteId: 'id'` (UUID ids otherwise coerced), selection via feature-state; empty-map tap deselects only if `queryRenderedFeatures(point, {layers:['h-places-hit']})` empty; routes inserted below `h-places-hit`.
- Theme/lang switch: `setStyle(url, {transformStyle: (p,n) => keepOurLayers(p, localizeLabels(lang)(p,n))})` (diff on; ⊥ `diff:false`); labels `['coalesce', ['get','name:pt'|'name:en'], ['get','name']]`; theme paint values reapplied after `style.load`. Style fetch `AJAXError` on `/styles/` → once `setStyle(fallback, {transformStyle: keepOurLayers})`. ⊥ `tile.openstreetmap.org`; ⊥ OFM `/dark-matter`, `/light`, `/osm-bright`, `/3d` (404).
- `fitBounds(b, {padding: 24, maxZoom: 16})` over persistent padding; ⊥ `absolutePadding`.
- WebGL2 missing → `GPUInitializationError` caught → `data-map-state="failed"` + `role="alert"` message; list keeps working. Root has `data-map-state="loading|ready|failed"`. ⊥ container `id="map"`.
- Test hook `window.__heremitaMap` only when `NEXT_PUBLIC_E2E=1`.
- `apps/web/tsconfig.json` `types: ["node", "geojson"]` + `@types/geojson`.

### I.web.csp — headers (`apps/web/src/proxy.ts`, per request, matcher excludes `api`, `_next/static`, `_next/image`, prefetches)
```
default-src 'self';
script-src 'self' 'nonce-{N}' 'strict-dynamic' {dev: 'unsafe-eval'};
worker-src 'self';
style-src 'self' 'nonce-{N}' {dev: 'unsafe-inline'};
style-src-attr 'unsafe-inline';
img-src 'self' data: blob: https://tiles.openfreemap.org https://tiles.versatiles.org;
connect-src 'self' https://tiles.openfreemap.org https://tiles.versatiles.org {dev: ws:};
font-src 'self';
object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
manifest-src 'self';
{prod: upgrade-insecure-requests}
```
Nonce `Buffer.from(crypto.randomUUID()).toString('base64')`. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, prod `Strict-Transport-Security: max-age=31536000; includeSubDomains`. `<link rel="preconnect" href="https://tiles.openfreemap.org">` in planner + read-only trip layouts. `worker-src 'self'` is reasoned (strict-dynamic ignores `'self'` in script-src) — verify w/ first map e2e (V54).

### I.web.i18n
- `next-intl` 4.15.1, prefixed locales `['en','es','pt-BR']` (`LOCALES`, zod-free `@heremita/shared/plain`; `localeSchema = z.enum(LOCALES)`), default `en` (`DEFAULT_LOCALE`). Keys by screen + role (`itinerary.stop.moveUp`). ICU. Portuguese plural: `Intl.PluralRules('pt-BR').select(0) === 'one'` ∴ every count message has explicit `=0` branch: `{count, plural, =0 {Nenhum lugar} one {# lugar} other {# lugares}}`; es also needs `many` (`select(1000000) === 'many'`). es = neutral Spanish (tú, agregar, auto, presiona).
- Dates `timeZone:'UTC'`; review month "out. 2026"; relative times w/ server `now`. Distances `Intl.NumberFormat` unit (`3,3 km`). `<html lang>` from locale; `hreflang` alternates on public pages.
- Place names shown as API returns (Photon local/English names); basemap labels localized.

### I.web.budget — performance (warning, ⊥ gate)
Public pages LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.05, first-load JS ≤ 180 KB gzip; planner list visible ≤ 2.5 s, tiles ≤ 4 s, JS ≤ 240 KB gzip before map chunk (map chunk ≈ 288 KB gzip + 551 KB worker, never on critical path). dnd-kit only on the planner (`EditableStopList` imports it statically: owner rows render sortable from first paint, never swapped; read-only routes never load it); downshift only in `PlaceSearchCombobox` (imported on first focus); zod only on RHF form routes (login, signup, settings, trips/new, trip settings, review); nuqs adapter only on planner, `/t`, `/s`, place page; client messages per route (`ClientMessages`, root = `common` + `auth`); trip cards: `TripThumbnail` static graph ⊥ `maplibre-gl` (`static-imports.test.ts`), map code via `import()` when a card nears the viewport. Measure w/ React Profiler before any memoisation.

### I.test — harness
- Shared: Vitest unit in `packages/shared/src/**/*.test.ts`.
- API unit: `apps/api/src/**/*.test.ts` (pure: optimiser, polyline cut, mappers on fixtures, categories, bucket/breaker w/ injected clock, access decisions, cursor codec, problem mapping).
- API integration: `apps/api/test/**/*.test.ts`, real PG per-file DB clone of `heremita_test` (skeleton `createTestDatabase()`), `apps/api/test/support/app.ts` `buildTestApp({clock?, geocoding?, routing?}) → {http, prisma, close}` booting `AppModule` + `configureApp`, overriding tokens `CLOCK`, `GEOCODING_PROVIDER`, `ROUTING_PROVIDER`; `apps/api/test/support/factories.ts` `createUser(app, overrides?) → {user, cookie, agent}` (supertest agent w/ cookie + `Origin: WEB_ORIGIN`), `createTrip(agent, {days, stopsPerDay})`, `addPlace(agent, tripId, gazetteerKey, dayId?)`, `publishTrip(agent, tripId)`; unique e-mails per file counter; ⊥ truncate, ⊥ cross-test rows. Network lockdown in setup (undici `MockAgent` `disableNetConnect()` + allow localhost; verify Node 24 global fetch honours it, else wrap `fetch` in outbound client w/ test guard).
- Clock: `Clock {now(): Date}` token; `SystemClock` (`apps/api/src/core/clock/system-clock.ts`) prod, `FixedClock` w/ `advance(ms)` tests; lint `no-restricted-syntax` bans `new Date()` w/o args under `apps/api/src/**` except `system-clock.ts`.
- Web: RTL + `@testing-library/user-event` + jest-dom + MSW 3.0.6 (`onUnhandledRequest: 'error'`; `setupApiServer` afterEach waits until every request of the test answered or aborted; vitest `sequence.hooks: 'list'` ∴ teardown = unmount → answers → file resets; order-independent under `--sequence.shuffle`); `apps/web/test/msw/handlers.ts` typed builders from shared types; `apps/web/test/render.tsx` `renderWithProviders(ui, {route?, locale?, viewer?})` w/ fresh QueryClient `retry:false`, NextIntl provider, nuqs test adapter.
- E2E (`apps/web/e2e/`, `apps/web/playwright.config.ts`): projects `mobile-chromium` (Pixel 7, touch), `desktop-chromium` (1280×800), `mobile-webkit` (iPhone 15; non-blocking until headless WebKit WebGL2 confirmed). `globalSetup`: drop + create `heremita_e2e` via `pg` (⊥ `prisma migrate reset`), `prisma migrate deploy`, seed. `webServer` api 3111 + web 3110, `reuseExistingServer: false`, production builds, env per §I.env e2e. Fixtures: worker-scoped user signed up via API + `storageState`; `context.route` aborts any non-localhost request; listener fails test on `securitypolicyviolation`; axe helper `@axe-core/playwright` 4.14.0. Long press via CDP `Input.dispatchTouchEvent` (touchStart → `page.clock.runFor(700)` after `page.clock.install()` → touchEnd; verify maplibre's long-press timer follows the page clock, else record a `SHORTCUT` for the one real hold) — ⊥ `waitForTimeout`; ≥ 500 ms between taps. Map readiness: `[data-map-state="ready"]` then hook `idle` (call `triggerRepaint()` first, race timeout).

## §V invariants
Each ! have a test (level in brackets) or a review check (`[review]`).

### Authorisation, visibility, privacy
V1: ∀ endpoint taking trip/day/stop/tripPlace id → access via `TripAccessService` or owner-scoped SQL (`WHERE … AND owner_id = $user`); miss → 404 (⊥ 403); B's tripId + A's child id (and reverse) → 404 ∧ A's rows unchanged [integration: authz matrix].
V2: ∀ Nest route ∈ `endpoints` table ∧ ∈ authz matrix; handler w/o `@Endpoint` or endpoint w/o matrix row → test fails; `PENDING_ENDPOINTS` = [] at release [integration].
V3: Viewer payloads (E20, E24, E26, E16, E48 cards) contain ⊥ keys `note`, `startDate`, `date`, `shareToken`, `email`, `createdAt`/`updatedAt` of trip, `ownerId`; enforced by output schemas; test walks JSON for those keys anonymous, non-owner, token holder [integration contract].
V4: Trip readable by non-owner iff (`visibility='public'` ∧ ¬hidden, via id routes) ∨ (`visibility∈{link,public}` ∧ token match ∧ ¬hidden, via `/shared/{token}` routes); private trip → 404 everywhere incl. old token; link trip via id route → 404 [integration].
V5: Leaving `private` sets `share_token` in same statement (CHECK `trips_share_token_chk`); E23 rotation → old token 404 at once; `public` ⇔ `published_at` non-null (CHECK) [integration].
V6: Copy → new trip private, `start_date` NULL, notes NULL, `share_token` NULL, custom places cloned w/ copy's `trip_id` (rename in copy ⊥ affects source), modes + order kept, `copied_from_trip_id` = source; copier `TRIPS_PER_USER` enforced [integration].
V7: Notes ⊥ leave owner: never in viewer schemas, never copied, never logged [integration + review].
V8: Hidden review invisible to all but author in E45, E17, ratings, counts; author sees `status:'hidden'`; hidden trip (`moderation_hidden_at`) → 404 for non-owners + absent from E48/E16 [integration].
V9: Viewer-blocked authors excluded from E16, E17, E45, E48, rating summaries, PlaceResult rating [integration].
V10: E50/E51: anonymous 401, non-moderator 403 `forbidden`; role ⊥ settable via API [integration].
V11: Custom places → 404 on E44–E47; reviews only on `source=osm` [integration].
V12: `places` rows ⊥ written from client-supplied name/coords for osm; only `key` accepted; E29 w/ forged key + no cache + Nominatim off → 503 `geocoding_unavailable`, nothing written [integration].
V13: Account deletion → zero rows referencing user id in any table (sweep `information_schema.columns` for `user_id`, `owner_id`, `author_id`, `blocker_id`, `blocked_id`), public trips gone from E48, reviews gone from ratings in same request; reports filed keep `reporter_id NULL` [integration].
V14: Inputs strict: unknown body/query key → 422 `validation_failed` pointer `/body/<key>`; ⊥ input schema contains `id`, `ownerId`, `authorId`, `role`, `isDemo`, `planVersion`, `shareToken`, `publishedAt` [shared unit + integration].
V15: Output allowlist: handler result parsed by `def.response` (strip unknown); parse failure → 500 + `error` log [integration].
V16: User free text (title, description, destination name, note, place name, display name, review body, report details) passes `cleanText` server-side; rendered only as React text nodes (`react/no-danger` = lint error; MapLibre popups ⊥ `setHTML`); e2e note `<img src=x onerror=alert(1)>` + review `</script><script>alert(1)</script>` render literally, no `dialog` event [shared unit + e2e].

### Ordering, concurrency, limits
V17: `days.position`, `stops.position` dense `0..n−1` after any sequence of plan ops (random op sequence property test, + every rotation/reverse of 5-stop day, insert at 0/middle/end, cross-day move) [integration].
V18: ∀ structural write → first statement = plan lock (§I.api.mechanics); `planVersion` strictly increases for each op in bump list and stays equal for note/name/category/title/description/visibility/startDate edits [integration per mutation].
V19: E36 list ≠ permutation of day's current stops → 409 `plan_changed` + `currentPlanVersion`, nothing written; duplicate ids → 422 [integration].
V20: E37/E35 index clamped to `[0, n]`; never 409 except `day_full`; 50× concurrent E35 + E36 (pre-add list): every stop present, positions dense, E36 409 whenever add committed first [integration].
V21: Limits: 26th stop in day → 409 `day_full`; 61st day, 301st trip place, 101st trip → 409 `limit_reached` (incl. copy); boundaries 25/26, 60/61, 300/301, 100/101 tested [integration].
V22: DB rejects stop mixing trips (composite FK), osm place w/ trip_id, public w/o published_at, rating ∉ 1..5, body length ∉ 10..2000, self-block; named CHECKs + `unaccent` exist after `migrate deploy` (each violating insert → SQLSTATE 23514) [integration migration test].
V23: Two concurrent E37 moves in opposite directions (A→B, B→A) × 20 finish < 5 s, no deadlock (single trip lock) [integration].

### HTTP contract
V24: Creates → 201 + `Location`; no-body success → 204; ⊥ 200 w/ error body; every error body parses w/ `problemDetailsSchema` ∧ `code ∈ def.errors ∪ implicit set` [integration: one failure per declared code].
V25: Malformed JSON → 400; body > 64 kB → 413; unsafe method w/ non-JSON body → 415; malformed path UUID → 404 [integration].
V26: Lists keyset: empty, one, exactly `limit`, `limit+1` → `nextCursor` non-null then null; tampered cursor → 422 `invalid_cursor`; `limit` > max → 422 [integration per list].
V27: DELETE idempotent where specified (E13, E14, E47 → 204 on repeat) [integration].
V28: `packages/shared/openapi.json` == freshly generated document (drift test); E3 serves it [shared unit].
V29: API changes additive-only within `/v1` [review].

### Auth, sessions, CSRF
V30: Unsafe method w/ `Sec-Fetch-Site` ≠ `same-origin` → 403 `csrf_rejected`; absent `Sec-Fetch-Site` ∧ `Origin` ≠ `WEB_ORIGIN` (or missing) → 403; applies to E4/E5; real browser POST through Next rewrite on web origin succeeds (proves headers forwarded) [integration + e2e].
V31: Session token 32 random bytes; DB holds only sha256; cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` iff `COOKIE_SECURE`, `Max-Age` = seconds to absolute expiry; FixedClock: +30 min no DB write, +2 h touch writes `last_used_at`, idle > 30 d → 401, > 90 d → 401 even if active [API unit + integration].
V32: Argon2id hash PHC starts `$argon2id$v=19$m=19456,t=2,p=1$`; password 12–128, ⊥ ∈ blocklist, ≠ e-mail ∧ ≠ local part [unit + integration].
V33: Login unknown e-mail ∧ wrong password → identical 401 body (`invalid_credentials`); 6th failure for (e-mail, IP /24 ∨ /64) in 15 min → 429 `too_many_attempts` + `Retry-After`; same e-mail from other block w/ correct password → 201; 51st failure for e-mail from any blocks → 429 (backstop); success clears own block, −1 on backstop; ⊥ lockout of correct password after window [unit + integration w/ FixedClock].
V34: Logout → cookie dead (401); logout everywhere → all sessions dead; password change → other sessions dead, current rotated (old cookie 401, new works) [integration].
V35: ⊥ Server Actions: `'use server'` ⊥ in `apps/web/src` (lint); RSC → API calls GET only, forward only session cookie + `X-Request-Id` + signed client IP (iff `SERVER_FETCH_SECRET`) [lint + unit].

### Rate limits
V36: Over limit per §I.throttle → 429 `rate_limited` + `Retry-After` seconds; key = user id when signed in else signed client IP (valid, fresh) else `req.ip`; `X-Forwarded-For` from client ⊥ trusted beyond `TRUST_PROXY` topology; client-IP header w/o valid signature ⊥ trusted [unit + integration].

### Providers (policy + resilience)
V37: E42/E43 anonymous → 401; anonymous E40/E27 → zero upstream calls (cache hits + estimates) [integration w/ counting fake].
V38: Every upstream request carries `User-Agent: Heremita/<version> (+<PUBLIC_SITE_URL>/about)` + `Referer`; ⊥ personal data / user ids; explicit timeout; per-host bucket respected (Photon ≤ 1/s burst 3, Nominatim ≤ 1 per 1.1 s, OSRM ≤ 1/s, one connection) [API unit w/ stub server].
V39: Nominatim ⊥ called when `NOMINATIM_ENABLED=false`; ⊥ for autocomplete ever [API unit].
V40: Retries only GET on network/timeout/5xx/429, ≤ 2, jitter 250 ms → 2 s cap, honour `Retry-After`, never past 8 s deadline, ⊥ autocomplete, ⊥ 4xx; breaker opens after 5 retryable failures, probes after 30 s (FixedClock) [API unit].
V41: Only parsed successes cached; estimates + errors ⊥ cached; provider id ∈ every key ∴ fake ∧ real ⊥ share entries [API unit].
V42: Upstream bodies zod-validated (Photon per feature, OSRM Ok|Error any status); invalid feature dropped + counted, ⊥ crash [API unit on fixtures].
V43: Fake providers refused at boot when `NODE_ENV=production` ∧ `ALLOW_FAKE_PROVIDERS≠true`; tests + e2e make zero non-localhost requests (lockdown) [unit + e2e fixture].
V44: Snap > 1000 m walk/bike, > 3000 m drive → leg `estimated`, `unroutable`, quality `partial`; estimate = haversine × 1.4 at 4.6/15/30 km/h (65 > 10 km drive); fake router ×1.3, `estimated:false`; provider down → `quality:'estimated'`, nothing cached [API unit + integration].
V45: E24/E26 plan route summaries never call a provider [integration counting fake].
V46: Health: E1 checks nothing external; E2 only DB pool; ⊥ provider ping; SIGTERM → E2 503 then exit 0 within 10 s [integration].
V47: Logs JSON one line, never `cookie`, `set-cookie`, `authorization`, `*.password`, `*.currentPassword`, `*.newPassword`, `*.token`, `*.shareToken`, search text, coordinates; route template logged, ⊥ raw URL w/ query or share token [unit on logger config + review].

### Reviews, ratings, moderation
V48: Average + distribution non-null iff published, non-blocked count ≥ 6 (test counts 0, 5, 6 w/ one hidden + one blocked-author review); count always shown [API unit + RTL].
V49: One review per (user, place); E46 first → 201, again → 200 replace; `visitedMonth` > current month (injected clock) → 422; body 10–2000 after `cleanText` [integration].
V50: Reports: one per (reporter, target) → 409 `already_reported`; own content → 422; ⊥ auto-hide (≥ any number of reports leaves content visible until moderator decides) [integration].

### Frontend behaviour, a11y, mobile
V51: URL params per §I.web.params: `place` push (Back deselects, ⊥ collapses sheet), `day`/`mode` replace; ⊥ copied into `useState` [RTL + e2e].
V52: Every plan mutation follows §I.web.mutations (key, scope, optimistic, rollback, invalidate, ⊥ retry); rollback restores exact prior order + shows toast w/ Retry (MSW 300 ms delay then 409/500) [RTL].
V53: Web retries: mutations never; queries ≤ 1 and only on network `TypeError` (exists: `query-client.test.ts`) [unit].
V54: Zero `securitypolicyviolation` on every e2e page incl. map pages (worker, tiles, fonts) [e2e].
V55: Every drag has single-pointer + keyboard twin (row menu move up/down/first/last/to day); pin placement has button twin + keyboard draft marker + coordinates input; long-press ⊥ only path [RTL + e2e].
V56: Touch targets ≥ 44×44 CSS px (padded hit area), ≥ 8 px apart; inputs font ≥ 16 px; viewport ⊥ disables zoom; safe-area insets on bars/FAB/sheet; ⊥ hover-only or right-click-only affordance; every control has pressed state [review + e2e spot checks].
V57: Form errors: `aria-invalid="true"` + `aria-describedby` → hint + error element `role="alert"`; server 422 pointers mapped to fields; submit disabled while submitting; paste + password managers ⊥ blocked [RTL].
V58: Every data screen renders loading (skeleton after 250 ms, reserved space, CLS ≤ 0.05), empty (why + next action; "no data yet" ≠ "no results"), error (Retry + code + request id, region-scoped), success via shared state components [RTL].
V59: Contrast ≥ 4.5:1 text, ≥ 3:1 controls/focus/meaningful icons, both themes; colour never sole carrier (day number, size+stroke for selection, "estimativa" text); `prefers-reduced-motion` → 0 durations + map `duration: 0` [unit on token pairs + review].
V60: axe: zero serious|critical violations on every page, both themes, phone + desktop [e2e].
V61: One `<h1>` per page, no skipped heading levels; icon-only buttons named; dialogs native `<dialog>` + focus return; popovers `popover="auto"`; one polite live region announces toasts, reorder results, search result counts [RTL + axe].
V62: Map: one instance per screen, `remove()` on unmount, guarded child cleanup (Strict Mode double mount → 1 canvas), `promoteId:'id'`, attribution ⊥ under sheet, WebGL2 missing → `role="alert"` + list usable; list = primary keyboard/SR path [RTL w/ fake map + jsdom real maplibre + e2e].
V63: 401 on client query/mutation → redirect `/<locale>/login?next=<current>` except `['viewer']` + public pages; `next` accepted iff starts `/<locale>/` ∧ ⊥ `//` [unit].
V64: Body never scrolls horizontally at 360, 768, 1024, 1280 px widths; layout mobile-first (`min-width` queries only) [e2e + review].
V65: Offline → banner + edit controls disabled; online → re-enabled; ⊥ silent mutation queue [RTL + e2e].
V66: i18n: `es` and `pt-BR` key sets identical to `en`; every ICU message parses; counts have `=0` branch; dates formatted `timeZone:'UTC'` (no day shift at UTC boundaries) [unit].
V67: Theme: signed-in `data-theme` from `Me.theme` in server HTML; anonymous override from `localStorage` applied before paint (no flash); `system` follows `prefers-color-scheme` [e2e].
V68: Route query key includes `planVersion` + `mode`; any route-affecting edit changes `planVersion` ∴ new fetch; unchanged legs served from cache [RTL + integration].
V69: Delete-type actions (remove from day, delete from trip, review delete) offer Undo or confirm; delete trip + delete account + delete day w/ stops use `<dialog>` confirm [RTL].

### AI suggestions (E52)
V76: AI ideas ⊥ persisted ∧ ⊥ applied by the server: E52 writes ⊥ trip/day/stop/place row (only the `place:v1:` provider cache of geocoder hits, as E42); a pick reaches the plan only through the owner's own E29 [integration: row counts unchanged after E52].
V77: ∀ E52 item → a geocoder hit for the idea's name, biased to the trip centre, ≤ `SUGGEST_RADIUS_KM` away, `kind` ≠ `area`, hit name holds > ½ of the idea's words (≥ 3 letters, folded; a 1-word idea = the whole hit name), key ∉ trip ∧ unique in the answer; idea w/o such hit → dropped + counted in `dropped` (model text never becomes a place) [unit `grounding.test.ts` + integration].
V78: Prompt text, model output and `ANTHROPIC_API_KEY` ⊥ logged; log line = trip id, provider, model, ideas, grounded, tokens, ms [review + `suggestions.service.test.ts` spy].
V79: Model call: structured output (zod → JSON schema, `parsed_output` null → 503), `stop_reason: refusal` → 503, timeout 30 s, 1 SDK retry, any failure → 503, server-side refusal fallback (`fallbacks: 'default'`); user prompt sent as data inside the user turn, ⊥ system prompt [unit w/ stub client].
V80: Daily budget counted before the model call, per UTC day (injected clock); over → 429 `ai_quota_exhausted` w/ `Retry-After` = s until next UTC midnight [unit `daily-budget.test.ts`].

### Data, seed, tooling
V70: Seed idempotent (run twice → identical row set), deterministic, ⊥ network, refuses `NODE_ENV=production`; demo users `is_demo` → "Exemplo"/"Example" badge wherever author shown [integration + e2e].
V71: `new Date()` w/o args ⊥ in `apps/api/src/**` except `system-clock.ts`; ⊥ `console.log` anywhere (lint) [lint].
V72: E2E hermetic: ports 3110/3111, DB `heremita_e2e`, fake providers, blank style, non-localhost aborted, `reuseExistingServer:false`, `retries:0`, ⊥ `waitForTimeout`, role-first locators [config review + e2e].
V73: ⊥ network call inside a DB transaction (provider resolution before tx; cache upserts after response) [review + integration w/ counting fake].
V74: Every `SHORTCUT` marker has owner + ceiling + upgrade trigger and is a `//` or `#` line comment [`pnpm shortcuts` review].
V75: `idSchema` lower-cases every UUID (path, query, body, cursor) ∴ JS string compare of ids == PG uuid compare; upper-case id → same answer as lower-case (E37 same-day move dense, E13 self → 422, E36 dup in other case → 422) [shared unit + integration].

## §T tasks
Order: Foundation (`[core]`, sequential, one engineer at a time; T7 urgent) → Workstreams (parallel; each `[ws:*]` owns ONLY the dirs named in its first row; tests live in its own dirs) → Integration. Each row = one engineer session. "after Tn" = hard dependency. Definition of done ∀ task: shared schema used by API + form; OpenAPI regenerated if contract touched; tests per V cited (API: happy, 422 pointer, 401, 404 other user, 409 where exists, pagination edges); web: 4 states, tap twins, 44 px, L11 errors, keyboard path, both locales, both themes; `pnpm typecheck lint test build` green; literal results reported, unverified items named; `SHORTCUT` markers per V74; nobody edits outside ownership (amend §I + ask `[core]`).

id|status|task|cites
---|---|---|---
T1|x|[core] pnpm monorepo skeleton: workspaces, catalog, `allowBuilds`, strict `tsconfig.base.json`, one ESLint + Prettier config, root scripts, README|I.cmd
T2|x|[core] `docker-compose.yml` postgres:18 on 127.0.0.1:5434 + `heremita_test` init SQL; `scripts/init-env.mjs`; `.env.example` files|I.env,I.cmd
T3|x|[core] API skeleton: Nest 12 `/api/v1`, zod env fail-fast, E1 liveness, E2 readiness (`SELECT 1`), `ProblemDetailsFilter`, Prisma 7 + adapter-pg, placeholder migration + idempotent seed, SIGTERM 10 s shutdown, dev watch restarting on shared JS change|E1,E2,V46
T4|x|[core] API test infra: Vitest projects unit/integration, global setup recreating `heremita_test`, per-file `createTestDatabase()` clones (parallel-safe)|I.test
T5|x|[core] web skeleton: Next 16.4.6 on 3100, `/api/:path*` rewrite, QueryClient (retry policy, mutations ⊥ retry) + tests, MapView wrapper (setWorkerUrl, WebGL2 check, cleanup), Playwright `mobile-chromium` smoke|V53,I.web.map
T6|x|[core] `@heremita/shared` compiled ESM pkg; `problemDetailsSchema`, health schemas, `API_PREFIX`, `APP_NAME`|I.shared
T7|x|[core] saved upstream bodies (headers stripped to status, content-type, retry-after) in `apps/api/test/fixtures/upstream/responses/`; research reference code ported in T17/T40/T42 to `apps/api/src/providers/**` (reference copy + unread `responses-r2/` deleted in T78)|I.providers
T8|x|[core] deps + config, one serialised install, each checked for React 19 / Nest 12 peers and 24 h release age: api `nestjs-pino@5.3.2` `pino@10.4.0` `pino-http@11.0.0` `pino-pretty`(dev) `@nestjs/throttler@6.8.0` `helmet@8.3.0` `@node-rs/argon2@2.2.2` `undici`(dev); shared `zod-openapi@6.0.2`; web `next-intl@4.15.1` `nuqs@2.10.3` `react-hook-form` `@hookform/resolvers` `@dnd-kit/core@6.3.1` `@dnd-kit/sortable@10.0.0` `downshift@9.5.0`, dev `msw@3.0.6` (confirm `graphql` peer optional) `@testing-library/user-event` `@types/geojson` `@axe-core/playwright@4.14.0`. Config: `cacheComponents:false`, `partialPrefetching:false`; web tsconfig `types:["node","geojson"]`; ESLint: ban `'use server'` in web, `react/no-danger` error, `no-console` (allow `console.error` only in `instrumentation.ts`), `no-restricted-syntax` `new Date()` w/o args in `apps/api/src/**` except `system-clock.ts`; `pnpm build` still green|V35,V71,I.web.csp
T9|x|[core] spikes after T8, record outcome by amending §C: (a) `zod-openapi` emits valid 3.1 for TripPlan union (else fallback `z.toJSONSchema`); (b) `@dnd-kit/core`+`sortable` sortable list under React 19.3.1 Strict Mode incl. touch + keyboard (else `@dnd-kit/react@0.5.3` exact pin); (c) `downshift` `useCombobox` under Strict Mode; (d) next-intl + nuqs + `[locale]` root + `next/root-params` with `cacheComponents:false` build+dev; (e) route groups `(public)/places/[placeId]` + `(app)/places/[placeId]/review` coexist|I.web.routes,I.web.params
T10|x|[core] contract after T8: every file of §I.shared + `LIMITS` + `errorCodeSchema`/`ERROR_TITLES` + `cleanText`/`textSchema` + `endpoints` table E1–E51; extend `problemDetailsSchema` (CD3); unit tests: limits, cleanText (control chars, bidi, blank lines), emailSchema trim-before-validate, password ≠ e-mail refine, strict objects reject unknown keys, TripPlan viewer parse strips `note`/`startDate`/`shareToken`|I.shared,I.limits,I.errors,I.api,V14,V16
T11|x|[core] OpenAPI after T10,T9a: `packages/shared/src/openapi/document.ts` (subpath export `./openapi`), `openapi:generate` script writing `packages/shared/openapi.json`, drift test|V28,I.shared
T12|x|[core] Prisma after T8: schema §I.data replacing `Placeholder`, migration `*_v1_model` via `--create-only` + §I.data.sql, read generated SQL; update seed test; migration test (named CHECKs + `unaccent` + violating inserts 23514, cross-trip stop FK, cascade delete, RESTRICT)|I.data,V22
T13|x|[core] seed after T12,T7: `apps/api/src/providers/fake/gazetteer.ts` ≈ 60 real OSM objects (Lisboa, São Paulo, Rio, Paris) built from saved Photon bodies via the mapper; `apps/api/prisma/seed/*.ts` per §I.seed; idempotency test (run twice)|I.seed,V70
T14|x|[core] API core plumbing after T10: env additions (§I.env), `@Endpoint` + `ContractInterceptor` + `@Input` + `@CurrentUser`, problem filter mapping (§I.api.mechanics), body parser 64 kB, 415, `CsrfGuard`, `helmet` + `no-store` default, `nestjs-pino` (redaction, request id, route template), trust proxy, `AppThrottlerGuard` + throttle names, E3 controller, route-table test w/ `PENDING_ENDPOINTS`, every feature module (`me`, `users`, `trips`, `discovery`, `plan`, `places`, `routing`, `reviews`, `reports`, `moderation`) created empty + registered in `app.module.ts`|I.api.mechanics,I.throttle,E3,V2,V15,V24,V25,V30,V36,V47
T15|x|[core] API core services after T12,T14 in `apps/api/src/core/**`: `Clock` token + `SystemClock`/`FixedClock`, `TripAccessService`, cursor codec, `RatingSummaryReader`, block filter, password module (argon2 hash/verify, dummy hash, blocklist file), unit tests|I.api.mechanics,V4,V9,V26,V32,V48,V71
T16|x|[core] auth after T15 in `apps/api/src/auth/**`: E4–E8, `SessionGuard` (touch ≤ hourly), login attempts, cookie per `COOKIE_SECURE`, hourly purge job (sessions + provider_cache) in `apps/api/src/core/jobs/`; integration tests|E4,E5,E6,E7,E8,V30,V31,V32,V33,V34
T17|x|[core] providers foundation after T13,T14 in `apps/api/src/providers/{core,fake}/**`: contract types, outbound client (timeouts, retries, buckets, breaker, single-flight, UA/Referer, 429/403 pauses), `ProviderCacheService`, `PlaceResolver`, categories, geo (polyline5, haversine), estimates, fake geocoder + router (constructor `failWith`), provider selection by env + production refusal, network lockdown setup; unit tests w/ FixedClock + stub server|I.providers,V38,V39,V40,V41,V43,V44
T18|x|[core] API test harness after T16,T17: `apps/api/test/support/{app,factories}.ts`, `apps/api/test/authz-matrix.test.ts` listing every endpoint (unimplemented rows `todo` → excluded via `PENDING_ENDPOINTS`)|I.test,I.authz,V1,V2
T19|x|[core] web shell after T8,T9d: `env.ts`, `i18n/*`, `[locale]/layout.tsx`, `proxy.ts` (locale + CSP nonce + headers), fonts, `tokens.css`/`reset.css`/`base.css` (§I.tokens), theme script + `data-theme` from viewer, providers (Query, NextIntl, nuqs adapter, Toaster), `error.tsx`/`not-found.tsx`/`global-error.tsx`, app bar + nav + language switcher, `lib/routes.ts`, all message namespace files (keys for common), parity + ICU unit test, move `components/map` → `shared/map`, delete health component/home/globals.css|I.web.routes,I.web.dirs,I.web.csp,I.tokens,I.web.i18n,V54,V59,V66,V67
T20|x|[core] web data layer after T10,T19: `lib/api/{client,server,query-keys}.ts` (all keys of §I.web.keys), `getViewer` (React `cache`, 401 → null), 401 redirect handler, `ApiProblemError` w/ extensions, `use-online` + offline banner, `lib/format/*` + unit tests (0, 9 m, 999 m, 1 km, 1 h 05, UTC dates)|I.web.keys,V53,V63,V65,V66
T21|x|[core] web base components after T19: §I.web.dirs base list + `shared/icons/` (MapPin, MapPinPlus, Route, Footprints, Bike, Car, GripVertical, Crosshair, LocateFixed, Search, Star, Share2, Copy, Ellipsis, Undo2, Navigation, Flag, Moon, Sun, Languages, ListOrdered, Shell, ChevronLeft, X, Plus, Trash) + RTL tests (field error wiring, dialog focus, toast live region, states timing)|V57,V58,V59,V61
T22|x|[core] web auth after T20,T21 in `apps/web/src/features/auth/**` + `app/[locale]/(auth)/**` + `(app)/layout.tsx`: SignupForm/LoginForm (RHF + zod shared schemas, server 422/409/429 mapping), `ViewerGate`, LogoutButton in app bar, `next` validation; messages `auth`; RTL tests|E4,E5,E6,V57,V63
T23|x|[core] web test harness after T22: MSW handlers + `renderWithProviders`; Playwright config per §I.test (3 projects, 3110/3111, `heremita_e2e` global setup, prod builds, `reuseExistingServer:false`, blank style, network abort, CSP + axe fixtures, storageState worker fixture); walking-skeleton e2e: sign up (pt-BR, phone) → app bar shows display name → reload keeps session → log out|I.test,V54,V60,V72,V30
T30|x|[ws:api-account] owns `apps/api/src/me/**`, `apps/api/src/users/**`, `apps/api/test/me/**`, `apps/api/test/users/**`. E9 PATCH me, E10 password change (rotate current, kill others), E11 delete account (cascade + sweep test)|E9,E10,E11,V13,V32,V34
T31|x|[ws:api-account] E12–E14 blocks (idempotent PUT/DELETE, self-block 422), E15–E17 profile + public trips + reviews (block filter, hidden rules)|E12,E13,E14,E15,E16,E17,V8,V9,V26,V27
T32|x|[ws:api-account] owner CLI `reset-password <email>` in `apps/api/src/me/cli/` (random temp password printed once, sessions deleted); `[core]` adds the `cli` script to `apps/api/package.json`|I.cmd,V34
T33|x|[ws:api-trips] owns `apps/api/src/trips/**`, `apps/api/src/discovery/**`, `apps/api/test/trips/**`, `apps/api/test/discovery/**`. E18–E23: list mine (updated_at keyset), create (+days), get (owner/viewer shapes), patch (visibility → token/published_at atomically; defaultMode bump), delete, rotate token|E18,E19,E20,E21,E22,E23,V3,V4,V5,V18,V21,V26
T34|x|[ws:api-trips] E25 + E28 copy (one tx `INSERT … SELECT`, custom place clone, notes NULL, locale title, limits, `copiedFrom` exposure rule)|E25,E28,V6,V7,V21
T35|x|[ws:api-trips] E48 public trips (partial index, `unaccent` ILIKE `q`, `countryCode`, block filter, `copyCount`, `previewPoints` ≤ 20 in fixed queries, ⊥ N+1)|E48,V8,V9,V26
T36|x|[ws:api-plan] owns `apps/api/src/plan/**`, `apps/api/test/plan/**`. Plan reader E24 + E26 (6 fixed queries, owner vs viewer schemas, route summaries from cache only); plan lock + `writeDayOrder` module + property test|E24,E26,V3,V17,V18,V45
T37|x|[ws:api-plan] days E32–E34 (append/insert index, renumber, delete → stops removed, places become ideas) + E33 modeOverride|E32,E33,E34,V17,V18,V21
T38|x|[ws:api-plan] trip places E29–E31 (PlaceResolver before tx, upsert canonical, 409 w/ tripPlaceId, custom places, schedule, limits; PATCH note/custom fields; delete cascade of stops + custom place)|E29,E30,E31,V11,V12,V18,V21,V73
T39|x|[ws:api-plan] stops E35–E39 (clamped index, placement same/other day, stop-order permutation 409, modeToNext); concurrency tests (V20, V23)|E35,E36,E37,E38,E39,V17,V19,V20,V23
T40|x|[ws:api-geo] owns `apps/api/src/places/**`, `apps/api/src/providers/{photon,nominatim}/**`, `apps/api/test/places/**`. Photon + Nominatim adapters (URL builders, upstream zod schemas, `placeFromPhoton`, dedupe, lang mapping) ported from T7 reference; tests on saved fixtures; `test:live` script request to `[core]`|I.providers,V38,V39,V42
T41|x|[ws:api-geo] E42 search (submit fallback rule, `place:v1` cache writes, `placeId`+`rating` enrichment in one grouped query), E43 reverse, E44 place detail (`inMyTrips`, `myReview`); anonymous 401; 503 busy/unavailable mapping|E42,E43,E44,V11,V37,V41
T42|x|[ws:api-routing] owns `apps/api/src/routing/**`, `apps/api/src/providers/osrm/**`, `apps/api/test/routing/**`. OSRM adapter (`osrmRouteUrl`, `routeFromOsrm` leg split, snap rule, error mapping) on fixtures|I.providers,V42,V44
T43|x|[ws:api-routing] E40 + E27 day route (cache read, same-mode runs, upsert after response, estimates, quality, `mode` override, anonymous cache-only, `Cache-Control`)|E40,E27,V37,V41,V44,V45,V68,V73
T44|x|[ws:api-routing] E41 order suggestion: `optimise.ts` (Held-Karp ≤ 12 free, heuristics above; deterministic; unit tests vs known orders) + routed before/after|E41,I.providers
T45|x|[ws:api-community] owns `apps/api/src/{reviews,reports,moderation}/**`, `apps/api/test/{reviews,reports,moderation}/**`. E45–E47 reviews (sorts + cursors, hidden/self rules, block filter, PUT mine 201/200, month ≤ now, delete idempotent)|E45,E46,E47,V8,V9,V27,V48,V49
T46|x|[ws:api-community] E49 reports (visibility check, own → 422, duplicate → 409, ugc throttle) + E50/E51 moderation (decisions resolve all open reports on target)|E49,E50,E51,V10,V50
T50|x|[ws:web-ui] owns `apps/web/src/shared/components/{sortable-list,combobox,popover-menu,segmented-control,chip-row,rating-input,rating-stars,demo-badge}/**`, `apps/web/src/shared/hooks/**` (except `use-online` from T20). SortableList (dnd-kit sensors §I.web.screens, live announcements) + Combobox (downshift, `aria-activedescendant`) per T9 outcome; RTL tests|V55,V61
T51|x|[ws:web-ui] `apps/web/src/shared/components/bottom-sheet/**`: snaps, pointer drag on header, fling, handle button cycle + label, `onSnapSettled(heightPx)`, same markup → side panel ≥ 768 via CSS (`variant="panel"` dropped in audit, T80), gestures no-op there; pure snap math unit tests; RTL (Enter cycles, no focus trap)|I.web.screens,V56,V61
T52|x|[ws:web-ui] PopoverMenu, SegmentedControl, ChipRow, RatingInput (radio, arrows), RatingStars, DemoBadge; RTL|V56,V59,V61
T53|x|[ws:web-map] owns `apps/web/src/shared/map/**`. Basemap (env URLs, positron/dark, VersaTiles fallback on `AJAXError`), `localizeLabels`, `keepOurLayers`, theme/lang switch keeping layers + feature-state, attribution top-left, controls locale strings, GeolocateControl; unit tests of pure fns + jsdom no-WebGL test|I.web.map,V62
T54|x|[ws:web-map] PinsLayer (hit circle, feature-state selection, idea/saving variants, clusters for "all"), RouteLineLayer (casing, dashed estimates), DraftPin (keyboard, `aria-label`), long-press handler w/ lift-click suppression, `use-map-padding`, fitBounds helper, e2e test hook; RTL w/ fake map under Strict Mode|I.web.map,I.tokens,V55,V62
T55|x|[ws:web-trips] owns `apps/web/src/features/{trips,explore}/**`, `apps/web/src/app/[locale]/(public)/{page.tsx,explore,u}/**`, `apps/web/src/app/[locale]/(app)/trips/{page.tsx,loading.tsx,new}/**`, `apps/web/src/app/[locale]/(app)/trips/[tripId]/settings/**`, `apps/web/src/messages/*/{trips,explore}.json`. My trips (RSC first page, Load more, empty, FAB) + create trip (destination combobox via composition, dates vs day count)|E18,E19,E42,V57,V58
T56|x|[ws:web-trips] trip settings: fields, visibility radio + share link copy/share/rotate, duplicate, delete `<dialog>`|E20,E21,E22,E23,E25,V5,V69
T57|x|[ws:web-trips] landing (strip, CTA, illustration), explore (q, cards, RouteThumbnail, empty copy), profile `/u/[userId]`; SEO `robots` rules|E48,E15,E16,E17,V58,V64
T58|x|[ws:web-planner] owns `apps/web/src/features/itinerary/**`, `apps/web/src/app/[locale]/(app)/trips/[tripId]/{page.tsx,loading.tsx,_components}/**`, `apps/web/src/app/[locale]/(public)/{t,s}/**`, `apps/web/src/messages/*/itinerary.json`. Planner shell after T51,T53: RSC E24 → `PlannerScreen` (initialData), `use-planner-params`, DayChips, StopList/StopRow read path, PlaceCard (note + day + communitySlot), sheet/panel layout, map composition (`trip-to-geojson`), map↔list↔URL sync|E24,I.web.params,I.web.screens,V51,V62
T59|x|[ws:web-planner] plan mutations per §I.web.mutations: add (search card / what's here / Add here / custom), note autosave, row menu moves + drag, remove from day vs delete from trip + Undo, days add/delete, saving indicator, offline disable; pure ops unit tests; RTL rollback tests|E29,E30,E31,E32,E34,E35,E37,E39,V52,V55,V65,V69
T60|x|[ws:web-planner] routes UI: route queries, DaySummary, LegRow, ModeSwitch (URL + E33), leg popover (E38 + `nav-links.ts` Google/Apple), estimates + partial banner, route error fallback|E33,E38,E40,V44,V68
T61|x|[ws:web-planner] optimise preview (E41, keepLast toggle, before/after, Apply E36, 409 handling, Undo)|E41,E36,V19
T62|x|[ws:web-planner] read-only `/t/[tripId]` + `/s/[shareToken]` (ReadOnlyItinerary, mode via URL, copy flow w/ `?copy=1` resume, report link, noindex for `/s`)|E24,E26,E27,E25,E28,E49,V3,V4
T63|x|[ws:web-places] owns `apps/web/src/features/{place-search,reviews}/**`, `apps/web/src/app/[locale]/(public)/places/**`, `apps/web/src/app/[locale]/(app)/{places,moderation}/**`, `apps/web/src/messages/*/{place-search,reviews}.json`. PlaceSearch (debounce 300 ms, abort, ≥ 3 chars, submit on Enter, busy/unavailable inline messages, empty copy) + WhatsHereCard (E43, "Usar este ponto exato", coordinates disclosure); exported for planner composition|E42,E43,V37,V55,V58
T64|x|[ws:web-places] place page: RatingSummary (≥ 6 rule), ReviewList (sort, Load more), ReviewItem menu (ReportDialog E49, BlockUserButton E13), small cooperative map, sticky write CTA|E44,E45,E49,E13,V48,V58
T65|x|[ws:web-places] review form page (prefill, month ≤ now, counter, delete w/ Undo or confirm)|E46,E47,V49,V57
T66|x|[ws:web-places] moderation page (mod only, list + decisions)|E50,E51,V10
T67|x|[ws:web-account] owns `apps/web/src/features/settings/**`, `apps/web/src/app/[locale]/(app)/settings/**`, `apps/web/src/messages/*/settings.json`. Settings page: profile, language (link + E9), theme (E9 + instant), password change (422 `wrong_password` → field), blocked users (E12/E14), sign out / everywhere, delete account dialog|E6,E7,E9,E10,E11,E12,E14,V34,V57,V67
T70|x|[integration] owns `apps/web/src/app/[locale]/(public)/{about,privacy}/**`, `apps/web/src/messages/*/legal.json`. About + privacy pages (attribution, recipients, `CONTACT_EMAIL`)|I.providers,I.web.screens
T71|x|[integration][core] authz matrix complete, `PENDING_ENDPOINTS` = [] in route-table + matrix tests|V1,V2
T72|x|[integration] owns `apps/web/e2e/**`. Journeys on mobile-chromium (+ desktop where noted): (1) sign up → new trip → planner Ideas; (2) search "museu" (fake) → Adicionar ao Dia 1 → Undo → add again; (3) long-press (CDP) + "Adicionar aqui" path; (4) reorder by menu (phone) + drag (desktop) → reload keeps order; (5) move to Dia 2, chips, Back deselects; (6) mode bike → legs change; provider down (stub route 503) → estimates banner; (7) optimise → apply → Undo; (8) note → reload; (9) publish → anonymous `/t` (no notes, no dates) → copy → login → copy in My trips; link share `/s` + rotate kills old; (10) review on seeded place (≤ 5 → no average) + report; (11) language en + theme dark persist reload; (12) offline banner; (13) XSS literals; (14) delete account → login fails. axe + CSP fixtures on all|V16,V30,V51,V52,V54,V55,V60,V65,V67,V69,V72
T73|x|[integration] a11y + mobile pass: widths 360/768/1024/1280 no h-scroll, targets, focus order, reduced motion, contrast check of token pairs (unit), screen-reader walk of planner list; owner: manual pass on one real iPhone + one Android; findings → §B via backprop|V56,V59,V60,V61,V64
T74|x|[integration] docs: README (setup, env, scripts, ports, e2e, provider policies + Nominatim opt-in, owner-only `db:reset`, password reset CLI), `pnpm shortcuts` ledger script (`[core]` adds script), SHORTCUT ledger review, additive-only check of `openapi.json` diff vs first release|I.cmd,V29,V74
T75|x|[integration] CP reality check in dev w/ real providers (owner present): one search per locale, one route per mode, Nominatim off path, CSP sweep incl. VersaTiles fallback, bundle sizes vs §I.web.budget (warning script)|V38,V39,V54,I.web.budget
T76|x|[core] bump vitest to 5.1.1 (allowed from 2026-11-19) and re-run full suite|I.test
T77|x|[core] FIRST, before any `pnpm format:check`: add `SPEC.md` to `.prettierignore` (Prettier would rewrite the caveman pipe tables the spec/build/check tools parse; today `prettier --check SPEC.md` fails)|I.cmd
T78|x|[integration] LAST, after T70–T77 all x: delete temporary planning material so repo stays clean: `docs/NEXT-STEPS.md`, `docs/progress/**`, `docs/design/**`, `spikes/**`, `apps/api/test/fixtures/upstream/reference/**` (once ported); drop their `.prettierignore`/`.gitignore`/ESLint/tsconfig entries; keep durable knowledge only in `SPEC.md`, README, code + tests; `pnpm typecheck lint format:check test build` green|V74
T79|x|[core] CI/CD: `.github/workflows/ci.yml` (`checks` + `e2e`), `.github/dependabot.yml`, `render.yaml` `autoDeployTrigger: checksPass`, Vercel Deployment Checks documented; README "CI/CD" + badge|§C CI/CD,I.cmd
T81|x|[ws:web] UI refresh 2026-11-24: real map thumbnails on trip cards (`TripThumbnail` + `static-map.ts`, sketch fallback), header brand mark + nav icons + `PreferencesMenu` (language + theme), account menu icons, footer brand/tagline, landing (eyebrow, highlighted h1, numbered step cards, glows), Explore/My trips icon tiles, app icons + manifest, 20 Lucide icons added, `--color-surface-glass`/glows/`--shadow-lift`/`--radius-xl`; tests `static-map.test.ts`, `trip-thumbnail.test.tsx`, `static-imports.test.ts` (card's static import graph ⊥ `maplibre-gl`; `labelLanguage` moved to `shared/map/label-language.ts`), `preferences-menu.test.tsx`; `bundle-budget.ts` skips `/route` entries (icons, manifest); budget 2026-11-24 in README (+2–6 KB/page: header menu + icons + card); B15, B16, B17, B18|I.web.screens,I.tokens,I.web.dirs,I.web.budget,V59,V64
T80|x|[integration] audit 2026-11-19 (correctness, architecture, perf, a11y/security) fixes: batches A + B, then perf (zod/schemas off non-form routes via `/plain` + `/api-routes` + lazy problem schema; trip list skeleton server-safe; nuqs adapter per page; lazy place-search combobox + report dialog; per-route client messages; latin font preload + Atkinson metric fallback; Intl formatter cache), ErrorState `error` only, `hasCode`, fab hover, ModeSwitch apply on Enter/Space/click, planner flaky test (lazy sortable swap); skipped: next-intl precompile, CSS chunk split, Fraunces `opsz` drop, RHF on auth forms, layout viewer fetch|I.web.budget,I.web.mutations,I.web.screens,V52
T82|x|[ws:api+web] AI place suggestions: E52 (`apps/api/src/suggestions/**`: Claude + fake idea generators, grounding via geocoder, daily budget), planner Ideas panel `AiSuggestions` (prompt → grounded picks → add via E29 / preview card), evals `apps/api/evals/` (golden set, deterministic scorers + LLM judge, `eval:suggestions`, manual CI workflow)|I.api E52,V76–V80

## §B bugs
id|date|cause|fix
B1|2026-11-19|`idSchema` = bare `z.uuid()` accepted upper case; services compare ids as JS strings ∴ E37 w/ upper-case own `dayId` took cross-day path → duplicate id in `writeDayOrder` → positions ⊥ dense; E13 self by upper-case id → DB CHECK → 500|`idSchema` `.overwrite(toLowerCase)` (OpenAPI unchanged); `test/core/upper-case-ids.test.ts`, `common.test.ts`; V75
B2|2026-11-19|E5 read per-email failure count before `await` Argon2 verify, recorded failure after ∴ N parallel wrong guesses all checked (12 → 12× 401), V33 limit bypassed|`LoginAttempts.begin` counts attempt as failure before verify, success clears; `auth.test.ts` `checks_at_most_five_passwords_when_guesses_arrive_at_once`; V33
B3|2026-11-19|`usePlanMutation` onMutate runs at once for scoped queued edits ∴ edit B snapshot holds A's optimistic change; A fails → restore drops pending B; B fails → restore brings back refused A (stays if refetch also fails, e.g. offline)|`rollBack`: failed snapshot + redo of still-queued edits in order, their snapshots rewritten; `features/itinerary/use-plan-mutation.test.tsx`; V52
B4|2026-11-19|settings `.main` grid implicit `auto` column grew to section nav's unscrolled width (nav = grid item, min-width auto) ∴ page 497 px wide at 360|`grid-template-columns: minmax(0, 1fr)`; `e2e/a11y-mobile.spec.ts` `no_page_scrolls_sideways_at_any_width`; V64
B5|2026-11-19|phone planner search pill (fixed, full width, z 4) over map top edge hid zoom-in + compact attribution|pill stops before control column, attribution below pill, `.floating` clamped below controls; `phone_targets_are_44_px_uncovered_and_headings_nest` (centre hit test); V56, V62
B6|2026-11-19|SegmentedControl segments `flex: 1 1 0` in inline-flex ∴ longest label ("Bicicleta") squeezed its 20 px icon to 4 px|inline-grid `grid-auto-columns: 1fr`; icon-size check in `phone_targets_…`; V59
B7|2026-11-19|`--sheet-peek` 136 < header content 148 ∴ peek clipped day summary + day ⋯ button|`--sheet-peek: 148px` (ID-T73); `the_collapsed_sheet_shows_its_handle_chips_and_day_summary`; V56
B8|2026-11-19|stop row `:active` `scale(0.97)` literal ⊥ `--pressed-scale` (1 under reduced motion)|`scale(var(--pressed-scale))`; `shared/styles/motion-rules.test.ts` bans literal scale + literal transition times, endless animations need own reduced-motion rule; V59
B9|2026-11-19|`serverFetch` forwarded only cookie + request id; anon tracker = `req.ip` ∴ every signed-out RSC render shared Vercel egress IP bucket (120/60 s) → crawler/script made public pages 429 for all|signed client IP headers (HMAC-SHA256, 60 s window, constant-time) w/ `SERVER_FETCH_SECRET` both apps (! prod); `ClientAddress` → `AppThrottlerGuard`; `app-throttler.guard.test.ts`, `http-pipeline.test.ts` `gives_each_signed_client_address_its_own_bucket_behind_one_server_address`, web `server.test.ts`; V35, V36
B10|2026-11-19|`LoginAttempts` keyed on e-mail only ∧ counted before verify ∴ anyone w/ 5 wrong guesses / 15 min kept any user (demo e-mails public) locked out|key (e-mail, IP /24 ∨ /64 via throttler `normalizeIp`) limit 5 + per-e-mail backstop 50; success clears own block; IP = signed client IP ?? `req.ip`; `login-attempts.test.ts`, `auth.test.ts` `lets_the_owner_in_from_another_address_while_a_guesser_is_locked_out`, `locks_the_email_everywhere_once_guesses_from_many_addresses_reach_the_backstop`; V33
B11|2026-11-19|owner `StopList` lazy-loaded dnd-kit (`React.lazy`) w/ read-only rows as Suspense fallback; chunk arrival replaced `<ol>` rows by sortable `<ul>` rows (new DOM) ∴ tap whose press landed before swap released on detached row → place ⊥ opened|`EditableStopList` (planner only) imports `SortableList` statically, read-only `StopList` never loads dnd-kit; rows ⊥ swap; `editable-stop-list.test.tsx` `opens_a_place_whose_tap_began_on_the_first_render`; I.web.budget
B12|2026-11-19|planner tests failed under `vitest --sequence.shuffle` (seeds 3, 8, 9, 27): (a) `stays_on_the_opening_day…` + `delete_from_trip_undo…` fakes answered the write ok but `GET /plan` still served the old plan ∴ settle refetch put the row back; assertion passed only while refetch slower than it (timing set by earlier tests); (b) tests ended w/ requests in flight (`a_failed_move…` retry, 300 ms) ∴ failure toast landed in module toast store during a later test (2 × Try again)|fakes apply the accepted write to `serverPlan`; MSW harness waits for every request of the test (answered ∨ aborted) before reset; `sequence.hooks: 'list'` (unmount → answers → file resets); 30 seeds planner dir + 16 seeds full web suite green; I.test
B13|2026-11-19|`SiteHeader`/`SiteFooter` rendered by 13 layouts/pages + `not-found` ∴ Turbopack copied their client parts (NavLink, AccountMenu, LanguageSwitcher, ~7 KB gzip) into not-found chunk + each page/layout chunk; planner paid twice (not-found + `trips/loading`) w/o showing them|`SiteChrome` in `[locale]/layout.tsx` renders both once, hides on trip screens; per-route layouts keep only `ClientMessages`; about/privacy layouts deleted; `site-chrome.test.tsx`; I.web.budget
B14|2026-11-19|production `.next/static/media` held every file of `maplibre-gl/dist` (dev lib 2.5 MB, dev worker 1.3 MB, a 2nd copy of the lib 1.1 MB, css): MapLibre's fallback worker URL `new URL("./" + name, import.meta.url)` = Turbopack asset pattern over the dir|loader `scripts/maplibre-url-loader.mjs` (`new globalThis.URL(`) via `turbopack.rules`; app keeps `setWorkerUrl`; static 8.5 MB → 3.6 MB, media 5.8 MB → 0.9 MB (only `maplibre-gl-worker.mjs`); `maplibre-url-loader.test.ts`; I.web.map
B15|2026-11-24|`formatTripDates` `formatRange` → Node ICU pads the dash w/ U+2009/U+202F, Chromium w/ U+0020 ∴ `TripCard` text differed server/client → React hydration error on /trips (tree re-rendered client-side)|`trip-dates.ts` replaces `[\u00a0\u2009\u202f]` w/ plain space; `trip-dates.test.ts` asserts exact `Mar 14 – 17, 2027`
B16|2026-11-24|`.popover { display: grid }` (new `PreferencesMenu`) overrode the UA `[popover]:not(:popover-open) { display: none }` ∴ menu rendered open on every page load|`display` only under `.popover:popover-open`; rule recorded in I.web.screens (site chrome)
B17|2026-11-24|`viewport.themeColor` fixed to the `prefers-color-scheme` pair ∴ browser chrome kept the OS colour while a viewer's override (`data-theme`) painted the page the other way|`generateViewport` reads the signed-in viewer's theme (one colour); `applyTheme` rewrites the metas on a switch (`THEME_COLORS`); `theme.test.ts`
B18|2026-11-24|planner opened w/ the camera on the trip's construction view (all places ∨ destination), ⊥ the selected day: `PlannerCamera` fit (600 ms) mounted first, then `useMapPadding` `easeTo({padding})` → MapLibre `stop()` cut the fit at frame 0; phones: stops under the sheet; desktop: zoomed-out all-days view|`MapPadding` before `mapLayers`; `useMapPadding` jumps for the first padding, defers a change until `moveend` while `isMoving()`; `use-map-padding.test.tsx`; I.web.screens
B19|2026-11-24|V56 grew `.maplibregl-ctrl-attrib-button` to 44 px but MapLibre paints its "i" as a 24 px `background-image` w/o `no-repeat` ∴ icon tiled into a ring of broken glyphs; compact control kept MapLibre's 28 px padding ∴ credits ran under the 44 px button (every map, prod)|`map-view.module.css`: `background-repeat: no-repeat`, compact control `min-height`/padding from `--target-min`; checked by screenshot (desktop + iPhone 15) [review]
