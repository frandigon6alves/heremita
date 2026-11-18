# Heremita design panel: reconciliation critique

Status: COMPLETE (2026-11-18). All inputs present: `design-domain-api.md` (API), `design-ux-frontend.md` (UX), `design-quality-risk.md` (QR), `ux-research.md` (RES), `maplibre-guide.md` (ML, COMPLETE), `providers-brief.md` (PB), `standards.md` (STD), `scaffold-report.md` (SCAF, DONE), skeleton at `/Users/frangoncalves/Desktop/DEV/heremita`.

Checked by me today [V]: skeleton `next.config.ts` (`cacheComponents: true`, `partialPrefetching: true`, map style `liberty`), `packages/shared/src/problem.ts` (plain `z.object`, no extension members), web layout `src/components/*` + `src/lib/api/*`, API `env.ts` (3 vars), no `minimumReleaseAge` override in `pnpm-workspace.yaml` (pnpm 11 default 24 h applies, per SCAF 7.5); Next 16.4.6 bundled docs: `partialPrefetching` "requires Cache Components" (`02-guides/prefetching.md`), nonce CSP "PPR is incompatible" (`content-security-policy.md:397`), `next/root-params` doc does not mention a `cacheComponents` requirement; `npm view` publish times/peers (section 4). Everything else is taken from the inputs and marked as theirs.

Convention: **R:** = recommended resolution.

---

## 1. Conflicts between proposals

| # | Topic | API | UX | QR | R: (reason) |
|---|---|---|---|---|---|
| C1 | Stop ordering and concurrency | dense `position`, trip-row lock `UPDATE trips SET plan_version+1 … RETURNING`, two-phase `+1000` rewrite, no client version, full-list writes 409 `plan_changed` on non-permutation (§2.2, RAN) | per-day `version` in reorder body, 409 `version_conflict` (§3.4) | per-day `version` column, `UNIQUE … DEFERRABLE INITIALLY DEFERRED` (hand SQL), client sends `version`/`fromVersion`/`toVersion`, 409 `stale_version`/`stale_order` (§2.3) | **API.** Only one RAN against PG 18.7; DEFERRABLE is invisible to Prisma (drift behaviour unverified); one lock per trip removes the two-day lock-ordering problem QR has to test for. One code: `plan_changed`. UX and QR drop `version` from bodies; QR test names become `stop_order_with_stale_list_returns_409_plan_changed`. Satisfies STD 3.2 "choose its strategy explicitly". |
| C2 | Where "Ideas" live | trip place with no stop (§1.3) | chip "Ideas" | `days.kind='ideas'` row (§0.2) | **API.** Same place on several days (hotel) needs the trip-place/stop split; no special day row, no partial unique. |
| C3 | Planner document | `GET /trips/{id}/plan` → `TripPlan {trip, planVersion, places[], days[].stops[{id,tripPlaceId,modeToNext}], routes[]}` | `GET /trips/{id}` → trip + days + stops with place, note, `legMode`; key `['trip', id]` | — | **API shape and path.** `GET /trips/{id}` stays the header (#16). Web key `['trips', tripId, 'plan']`. |
| C4 | Note ownership | `trip_places.note` | `PATCH stop {note}` | note "belongs to the trip stop" (PB §2 says the same) | **API (trip place).** A note per stop duplicates on multi-day places and is lost when a stop becomes an idea. NoteEditor PATCHes #24. PB §2 wording is superseded. |
| C5 | Adding a place | `POST /trips/{id}/places {place:{type,key}\|custom, note, schedule}` one request; 409 `place_already_in_trip` + `tripPlaceId` | `POST /trips/{id}/stops` + `Idempotency-Key` | `addStop(agent, dayRef, gazetteerKey)` | **API #23.** On 409 with `schedule` set, client calls #30 with the returned `tripPlaceId`. No `Idempotency-Key` in v1 (lead 9 forbids auto-retry; UNIQUE(trip, place) already dedups OSM adds; custom-pin duplicates on a manual Retry accepted, `SHORTCUT` marker). |
| C6 | Route mode naming and source | effective mode = `stop.modeToNext ?? day.modeOverride ?? trip.defaultMode`; route endpoint has no `mode` param | URL `mode` wins; `PATCH day {routeMode}`; stop `legMode`; route `?mode=`; key has `stopsSig` | — | **API names** (`modeToNext`, `modeOverride`). Add optional `mode` query to #35 (overrides every leg, read-only) so viewers of shared trips can switch mode without writing (lead 6 needs URL `mode` for everyone). Owner changing `mode` = URL replace + PATCH `modeOverride`. Query key `['trips', tripId, 'route', dayId, planVersion, mode]`; drop `stopsSig` (planVersion covers it, I5). |
| C7 | Reorder endpoints | `PUT …/days/{dayId}/stop-order` (full list) + `PUT …/stops/{stopId}/placement {dayId,index}` | `PUT …/days/{dayId}/order {stopIds, version}` | `PUT …/stop-order {stopIds,version}` + `POST …/stops/{stopId}/move` | **API paths.** Move up/down/first/last, Move to day and drag drop all use `placement` (single-item, never 409); `stop-order` only to apply an optimisation. QR's `/move` is a verb path (STD 3.1). |
| C8 | Share URL and lookup | `shareToken` in query on `/plan` and `/route`; `GET /shared/{token}` → `{tripId}` | `/t/[shareId]` for both link and public trips | `/s/{token}` | **Two web routes:** `/[locale]/s/[shareToken]` (link shares) and `/[locale]/t/[tripId]` (public trips, linked from Explore). API: `GET /shared/{token}/plan` and `GET /shared/{token}/days/{dayId}/route` (token in path, never in a query string that lands in logs); drop `?shareToken=`. Explore cards never carry the token, so turning a public trip back to `link` does not leave a working Explore URL. |
| C9 | Visibility write | `PATCH /trips/{id} {visibility}` | single PATCH | "its own endpoint", not in any input schema (§2.3) | **API (PATCH).** Visibility is owner-settable, not a mass-assignment field. Service generates `share_token` in the same statement when leaving `private` (CHECK `trips_share_token_chk`). |
| C10 | Notes on shared/public trips and copies | `shareNotes` toggle (default false); copy keeps notes if `shareNotes` | notes never shown | notes always private; copy never takes notes | **UX+QR: notes never leave the owner.** Cut `shareNotes` (RES §1.5 Polarsteps; principle 9). Viewer `tripPlace` schema has no `note` key at all. |
| C11 | Dates on shared trips | non-owners get no date, only `durationDays` | public page "4 days, March"; trip settings start/end or day count | "only the month and year of the trip if the owner sets them" | **API (no dates for non-owners).** Simpler and safer (RES §1.7 safety). UX removes "March". |
| C12 | Trip dates model | `startDate?` + `dayCount` on create; days are rows; update has no `dayCount` | start+end or "number of days"; changing dates that drop days blocked client-side | — | **API.** End date input → `dayCount = end − start + 1` on create only. Settings edit changes `startDate` only; day count changes through add/delete day. Removes UX's `superRefine` drop-days rule. |
| C13 | Auth paths | `POST /users`, `POST /sessions`, `DELETE /sessions/current`, `DELETE /sessions` | — | `/auth/login`, `/auth/signup`, `DELETE /me/sessions` | **API** (plural nouns, STD 3.1). |
| C14 | Moderation | role `moderator` (seed/SQL), `GET/PATCH /moderation/reports`, auto-hide at 3 reports | — (no screen) | role `admin` via CLI `make-admin`, `POST /admin/reviews/{id}/hide` | **API endpoints, no auto-hide** (see U-cut). Role name `moderator`. QR's `/hide` is a verb path. |
| C15 | Blocking users | `user_blocks` + endpoints #11 | blocked list, Block in review menu | cut (§7.1) | **Keep** (RES §1.5 minimum moderation; one table and one `NOT IN`). |
| C16 | Report targets, details | review/trip/user, details ≤ 1000 | Report / Block on reviews, report on trip | review/trip, ≤ 500 | **review/trip only, ≤ 1000.** User reports add a target nobody's UI reaches; Block covers abusive users. |
| C17 | Review rules | body 0–2000 default `''`, `visitedMonth` optional; `PUT /places/{id}/reviews/mine`; sort `recent\|lowest` | body 10–2000, visit month required, not future; sort `recent\|lowest\|highest`; handles `review_exists` | body 10–2000; `POST /reviews`, 409 `review_exists` | **API endpoint (PUT mine, no `review_exists`), UX/QR rules:** body 10–2000, `visitedMonth` required and not after the current month (server checks with the injected clock). Sort `recent\|lowest` (cut `highest`: RES §1.5 justifies negatives only). |
| C18 | Rating average threshold | `RATING_AVERAGE_MIN_COUNT = 5`, "null while count < 5" (shown at 5) | "distribution only when count > 5", "fewer than 6 → no average" | "only above 5" | **≥ 6** (RES §1.5: "not worth showing with 5 or fewer"). Fix API constant semantics and bug-8 test (counts 0, 5, 6). |
| C19 | Password policy | 10–128 | hint "min 10" | 12–128, not equal to e-mail/local part, 10k common list | **QR** (12, blocklist, not e-mail). UX hint text follows `LIMITS`. Licence of the list checked when vendoring. |
| C20 | Limits | 25 stops/day, 60 days, 300 trip places, 100 trips; `limit_reached`/`day_full` → 422 | title 1–80 | 40 stops/day (contradicts its own "under the 25-stop cap"), 400 stops/trip, title 120; `limit_reached` → 409 | **API numbers** (25 = PB §4.3 routing cap), title 1–120 everywhere from `LIMITS`. Status **409** for `limit_reached` and `day_full` (state-dependent, STD 3.1 "409 conflict"). |
| C21 | Input strictness | interceptor parses with default (strip unknown) | — | `z.strictObject` bodies (unknown key → 422) | **Strict inputs, stripping outputs.** Makes mass-assignment attempts visible; output strip stays the I7 allowlist. |
| C22 | Validation/contract plumbing | endpoint table in `packages/shared/src/api/endpoints.ts` + `@Endpoint` + global `ContractInterceptor`; `openapi.json` in `apps/api` | — | `ZodPipe`; `packages/shared/src/openapi/registry.ts`; `packages/shared/openapi.json` | **API's endpoint table** (one registry drives routing, validation, response allowlist, OpenAPI, client and QR's authz matrix). Committed file `packages/shared/openapi.json` (generated from shared; served by #2). |
| C23 | Sessions details | stores `userAgent`; cookie `Max-Age` = time to sliding `expiresAt` | — | no UA; `Max-Age` = absolute lifetime | **QR on both.** No UA (no session list in v1, data minimisation). Cookie `Max-Age` = absolute 90 d, idle 30 d enforced in DB: RSC renders cannot re-set the cookie (API §3.1), so a sliding cookie could expire in the browser while the DB session is alive. |
| C24 | Rate-limit key and proxy trust | key `req.user?.id ?? req.ip`; `TRUST_PROXY_HOPS=1` | — | key session id; `trust proxy: loopback, uniquelocal`; Next keeps client `X-Forwarded-For` (`??=`) | **Key user id; trust topology from QR.** Hop count 1 trusts a client-forged XFF in dev and on any host without an overwriting proxy. |
| C25 | Anonymous search/reverse/routing | `opt`, per-IP limits | search used only in the planner | signed-in only; anonymous route views from cache or estimates | **QR.** No guest planning means anonymous users never need search; closes the anonymous provider proxy. #35 for anonymous viewers: cache hits + estimates, no upstream call. |
| C26 | Next rendering mode and CSP | — | depends on `cacheComponents` (`'use cache'`, `cacheLife`, `'use cache: private'`, root `generateStaticParams`) | nonce CSP, `cacheComponents: false` | **QR: nonce CSP, `cacheComponents: false` and `partialPrefetching: false`** (the docs say partial prefetching requires Cache Components; QR missed it). Also removes UX's 5-minute stale-public-page privacy defect (a trip made private stays visible) and its revalidate-route question. `getViewer` uses React `cache()` instead of `'use cache: private'`. |
| C27 | Web folder layout | — | `shared/{components,map,hooks,styles}`, `features/{auth,trips,itinerary,place-search,reviews,explore,settings}`, `app/[locale]/…` | `features/{map,search,routes,community}`, `src/styles/tokens.css`, `app/{account,explore,s,p,admin}` without `[locale]` | **UX tree** (has the locale segment and keeps the map generic in `shared/map`). Re-map QR's ownership table onto it. Skeleton `src/components/{health,map}` moves to `shared/…`. |
| C28 | i18n namespaces | — | common, auth, trips, planner, places, explore, settings | common, auth, trips, itinerary, map, search, routes, community, account | **One per feature folder of C27**: common, auth, trips, itinerary, place-search, reviews, explore, settings (+ map for control strings). |
| C29 | Query keys location | — | per feature; cross-feature invalidation via `onChanged` callbacks | central `lib/api/query-keys.ts` | **Central factory** (features importing `lib` is allowed by STD 2.1; callbacks threaded through pages are more code). |
| C30 | Drag-and-drop lib | — | `@dnd-kit/core` 6.3.1 + sortable 10.0.0 (last release 2024-12) | `@dnd-kit/react` 0.5.3 (0.x) | **UX's pick, after a React 19.3.1 Strict Mode spike** (neither was run); fallback `@dnd-kit/react` pinned exactly. |
| C31 | Basemap | — | positron/dark (6.6) | positron/dark + VersaTiles fallback (CSP) | **positron/dark + VersaTiles fallback** (ML §3). Skeleton still uses `liberty`: change it. |
| C32 | Seed | 6 users at `example.com`, ~60 places from PB saved Photon bodies, 10 trips (7 public), ~90 reviews, no demo flag | "≥ 12 public trips across 6 cities", demo accounts visibly marked | 4 users at `*.demo@heremita.invalid`, 6 trips, ~40 reviews, `is_demo` + "Exemplo" badge, shared gazetteer | **API volumes + QR's `isDemo`** on users (exposed on author objects, badge) + **one committed `gazetteer.ts`** used by fake geocoder and seed (PB raw bodies live in the scratchpad, not the repo). UX drops "≥ 12 / 6 cities". |
| C33 | E2E environment | `ROUTING_PROVIDER=fake`, reuse `storageState` | — | ports 3110/3111, DB `heremita_e2e`, never reuse dev servers | **QR.** Requires changing SCAF's `reuseExistingServer` config and creating `heremita_e2e` without `prisma migrate reset`. |
| C34 | Search result → place card rating | ratings only for saved `places` | card shows rating summary for a search result | — | Add `placeId` + `rating` to `PlaceResult` when the canonical row exists (one grouped query), else none. |

## 2. Gaps

### 2.1 UX screens vs API (data and actions)

| Screen (UX §) | Mismatch | R: |
|---|---|---|
| Global (1.3) | 401 handler redirects on any query, but anonymous pages call `GET /me` and get 401 | exempt `['viewer']` and public routes; server `getViewer` maps 401 → null |
| Landing (2.1) | none beyond the above (#43 `limit=6`, `previewPoints`) | — |
| Sign up (2.2) | API `signUpBody` requires `locale`; form has no field | send the current route locale |
| Sign up (2.2) | `emailSchema = z.email().max(254).transform(trim/lower)` validates before trimming: `" a@b.com"` fails | trim and lower-case first, then validate |
| My trips (2.3) | card needs dates and "last updated" sort; `TripCard` has no `startDate`/`updatedAt`, sort is `created_at` | owner card adds `startDate`; sort `(updated_at DESC, id DESC)` + index |
| Create trip (2.4) | "destination hint geocoded on submit" vs API `destination {name, countryCode, center}` | destination picked with the search combobox (`intent=submit`); free text allowed with `center: null` |
| Trip settings (2.4) | "Reset link" exists (#19); change password and description editing absent from UX; `shareNotes` cut (C10) | add description field; password change goes in Settings |
| Planner (3.3) | `?place=<stopId>` cannot address ideas (no stop) | `place` = `tripPlaceId` |
| Planner (3.3) | one "Remove" vs API's two (#34 remove from day → idea; #25 delete from trip) | two menu actions: "Remove from day", "Delete from trip" |
| Planner (3.3) | no UI for #29 day-order or #27 day `title` | cut #29 and day `title` from v1 |
| Planner (3.3) | place card shows 2 recent reviews: #40 `limit=2` per selection; fine | — |
| Planner (3.3) | Undo of a deleted custom pin re-creates a new place id; Undo of delete-trip-place needs the note | client keeps the snapshot (API §2.3); accepted |
| Planner (3.4) | `Idempotency-Key`, `version_conflict`, `PATCH day {routeMode}`, `PATCH stop {note}` don't exist | per C1, C4, C5, C6 |
| Planner (3.3) | Today mode needs "now" vs owner dates only; fine for owner | cut to after CP3 (5.1) |
| Place page (2.6) | facts "opening hours, website" not stored or returned (`PlaceDetail` lacks them) | cut (QR §7.1; RES §1.2 thin OSM data) |
| Place page (2.6) | "Your note (?trip=)" needs a per-place note lookup; `inMyTrips` gives ids only | cut the section; the planner card shows the note |
| Place page (2.6) | sort `highest` absent | cut (C17) |
| Write review (2.7) | prefill needs my existing review; no `GET …/reviews/mine` | add `myReview: Review \| null` to `PlaceDetail` for signed-in viewers |
| Explore (2.8) | `?sort=copied`, "copiada 12x", "a pé" not in `TripCard` / #43 | add `copyCount` and `defaultMode` to the public card; cut `sort=copied` (keyset on a count is not cheap) |
| Public trip (2.9) | "Copy" of a `link` trip: #22 body `{ title? }` has no token | `POST /shared/{token}/copies` (or `shareToken` in body); public trips use #22 |
| Public trip (2.9) | route legs for viewers: #35 with token (C8) | `GET /shared/{token}/days/{dayId}/route` |
| Profile `/u/[handle]` (1.2) | no `handle` anywhere in API | `/u/[userId]`; cut handles |
| Settings (2.10) | units km/mi not in `Me`; handle; "typed confirmation" delete vs API `{password}` | cut units (metric for both); delete dialog asks the password; add password change (#9) |
| Settings (2.10) | theme for anonymous users only in `localStorage`; signed-in theme from `Me.theme` | server renders `data-theme` from `Me.theme` when signed in, else inline script + localStorage |
| (missing) Moderation queue | API #45–46 exist, RES screen 17; no UX screen | minimal server-rendered `/[locale]/moderation` (list + 3 buttons), moderators only |
| (missing) About / privacy / contact | PB §5 (FOSSGIS: operator e-mail; privacy naming komoot, OSMF, FOSSGIS); QR §2.11 | static `/about` and `/privacy`; contact address from env, not hard-coded |

### 2.2 Product scope not covered

All six must-haves are covered. Expected items: all covered after the fixes above, except:
- **Place search for pt-BR users**: Photon does not index Portuguese names (PB §1.2); QR sets `NOMINATIM_ENABLED=false` by default, so "Alemanha"/"Londres" style queries fail. Owner decision (D18).
- **Copy a link-shared trip**: blocked by the missing token (2.1).
- **Seed** must give Explore, place pages and profiles content: covered by C32 once one spec is chosen.

### 2.3 Security controls with no place in the API proposal

| Control (source) | Missing from API | R: |
|---|---|---|
| Structured logging, redaction of `cookie`, `set-cookie`, `password*`, tokens; request id (STD 3.6, QR §5.1) | no observability section | adopt QR §5.1 (`nestjs-pino`) |
| Security headers, `x-powered-by` off, `Cache-Control: no-store` on session reads (QR §2.9) | only route `Cache-Control` | `helmet` + global `no-store` default |
| Text normalisation (control chars, bidi overrides) (QR §2.4) | schemas trim only | shared `cleanText()` in every user-text schema |
| Rate limits on review writes and reports (QR §2.6) | `429` listed, no limit | `throttle: 'ugc'` 10/h per user |
| Share token in query strings (`?shareToken=`) → access logs, history | API #21, #35 | path-based `/shared/{token}/…` (C8); log route templates only |
| Report brigading: auto-hide at 3 reports from distinct reporters; sign-up allows 5 accounts/h/IP | API I6 | no auto-hide; moderator decides |
| XFF spoofing of per-IP limits | API §7.4 hop count | C24 |
| CSP (QR §2.10) | web-side; API unaffected | C26 |
| OSM `website` URLs | n/a once facts are cut | if ever shown: http(s) only, `rel="noopener noreferrer nofollow ugc"` |
| Argon2 CPU/memory DoS (QR §2.6 semaphore) | none | rely on auth throttles; measure, add the semaphore only if needed |
| Password reset without e-mail (QR §2.7) | none | owner CLI that sets a temporary password and deletes sessions (no web route) |

## 3. Rulebook violations (STD)

- **3.1 verbs in paths:** QR `POST /auth/login`, `/auth/signup`, `POST …/stops/{stopId}/move`, `POST /admin/reviews/{id}/hide`. API's nouns are compliant. The `:action` form is impossible on Express 5 (both agree); record that deviation once.
- **3.1 201 + `Location`:** API #4, #23, #26, #30, #44 return 201 without `Location`. Add it (for #4 `Location: /api/v1/sessions/current`).
- **3.1 status codes:** API `limit_reached`/`day_full` as 422 (C20); `wrong_password` as 403 → 422 with pointer `/body/currentPassword` so the form maps it (lead 11).
- **3.1 Idempotency-Key:** UX relies on it, API lacks it (C5: drop, mark `SHORTCUT`).
- **3.1 pagination naming** (`page_size`/`next_page_token`) is overridden by lead 4: not a violation.
- **3.2/3.3 schema invariants:** QR's DEFERRABLE unique is hand SQL Prisma cannot model; drift behaviour untested (C1 avoids it).
- **3.6 observability:** API proposal has none (2.3). OTel deferral in QR is a valid `SHORTCUT` with ceiling and trigger.
- **1.1 feature flags:** `SEED_MODERATOR=true` (API) and `SEED_DEMO=1` (QR) are flags; seed always creates the demo moderator in non-production. `NOMINATIM_ENABLED` is provider config required by policy: keep.
- **1.1 SHORTCUT quality:** UX "public pages cached up to 5 min" is a privacy defect dressed as a shortcut (C26 removes it).
- **1.3 no sleeps in e2e:** UX journey 3 "700 ms" long press must be a CDP touch sequence with an explicit gesture hold (ML §9), not `waitForTimeout`.
- **2.1 feature isolation:** QR's planner page in `app/trips/[tripId]` composing features is fine; QR `apps/web/src/app/account` / `admin` outside `[locale]` breaks the i18n route tree (C27).
- **2.3 / lead 3:** `problemDetailsSchema` is a plain `z.object`, so the web parse strips API extensions `currentPlanVersion`, `tripPlaceId`; add them as optional members (or `.loose()`).
- **Lead decisions:** no proposal changes one. Two edges: QR's "no anonymous search" and UX's "no guest mode" are inside lead 5/6; UX's `localStorage` theme is a per-viewer convenience (lead 7 override persists through `Me.theme`).

## 4. Reality check

| Assumption | Evidence | Status |
|---|---|---|
| `lucide-react` 1.75.0 installable (UX §6.5) | published 2026-11-18T06:17Z [V]; pnpm 11 default `minimumReleaseAge` 24 h (SCAF 7.5) | **blocked today**; pin the previous release or inline ~25 SVGs (lead 7 prefers no extra packages; R: inline icons) |
| `msw` 3.0.7 (UX §9) | published 2026-11-18T01:16Z [V]; peers `vite >=6`, `graphql >=16`, `typescript >=5.9` | **blocked today**; pin 3.0.6 (QR §6.1) and confirm `graphql` peer is optional |
| `nestjs-pino` 5.3.2 | published 2026-11-17T08:23Z, peers Nest `^12.0.2` [V] | OK after 2026-11-18T08:23Z |
| `downshift` 9.5.0 "published 2026-11-16" (UX) | npm says 2026-11-09 [V] | date wrong, harmless |
| `@dnd-kit/core` 6.3.1 / `@dnd-kit/react` 0.5.3 under React 19.3.1 | 2024-12-05 / 2026-10-31 [V]; neither run | unverified: spike first (C30) |
| `next-intl` 4.15.1, `nuqs` 2.10.3 with Next 16.4 | peers OK [V]; never run with this config | unverified; spike in phase 0 with `cacheComponents: false` |
| `next/root-params` without Cache Components | doc does not require it [V read]; not run | unverified |
| QR: turning `cacheComponents` off | `partialPrefetching` requires it (docs [V]); QR did not turn it off; build not run | must disable both, then rebuild |
| Nonce CSP with MapLibre worker (`worker-src 'self'` + `strict-dynamic`), Turbopack dev styles | reasoned only (QR §8) | unverified; first map e2e with violation listener |
| Next rewrite forwards `Origin`/`Sec-Fetch-Site`, passes `Set-Cookie` | QR read `proxy-request.js` (`changeOrigin` → Host only); API "not verified" | unverified at runtime; e2e bug 4 must run before auth ships |
| Next keeps client `X-Forwarded-For` | QR read source | believed; drives C24 |
| `zod-openapi` 6.0.2 with zod 4.6.7 `.meta({id})` | published 2026-08-31, peer zod ^4 [V]; output never generated | unverified; fallback `z.toJSONSchema` (QR) |
| `uuidv7()` defaults, partial indexes, CHECKs, two-phase reorder | API RAN on PG 18.7 / Prisma 7.10.1 | verified by API |
| `unaccent` in migration and test template copies | not run | unverified |
| Prisma leaves hand-written CHECKs on later `migrate dev` | API "per its docs, not run" | unverified; API bug-10 test covers it |
| `@nestjs/throttler` 6.8.0 on Nest 12 | peer `^12.0.0` [V] | OK; per-endpoint `Retry-After` behaviour from source only |
| Nominatim `/lookup` as fallback for #23 cache misses (API §6.1) | QR defaults `NOMINATIM_ENABLED=false` | conflict: with it off, a `place:v1` cache miss must answer 503 and ask the client to search again |
| Photon names in Portuguese (UX §7.3 "localized when the provider has the name") | PB §1.2: Photon does not index Portuguese | pt-BR names mostly local/English; basemap labels do localize (ML §3) |
| OSRM 429 `Retry-After` (lead 9 "honouring Retry-After") | PB §6: none seen; FOSSGIS 429 is HTML | fixed 60 s host pause (PB §7.6) is the real behaviour |
| Fake gazetteer size | PB §7.8 ~15, API seed ~60, QR ~60 | pick ~60 in one committed file |
| Draggable marker keyboard step (UX §7.1 "10 px, Shift 50 px") | ML §6: Shift = 10 px (RAN) | UX text wrong; test the real step |
| Skeleton map style `liberty` | `map-view.tsx:12` [V] | change to positron/dark (C31) |
| Headless WebKit / Linux CI WebGL2 | SCAF §9, ML §9: Chromium only | unverified; WebKit project non-blocking |
| `Intl.DurationFormat` in browsers; Atkinson `tnum` | UX: Node only | fallback planned; unverified |
| E2E needs `tiles.openfreemap.org` | SCAF §9 | QR's blank local style removes it |

## 5. Over- and under-engineering

### 5.1 Cut (v1)
- `shareNotes` and note-copying rules (C10).
- Report target `user`; report auto-hide threshold (2.3).
- `sessions.userAgent`; `/me/sessions` list.
- Handles, units preference, `sort=copied`, review sort `highest`, place-page "your note", opening hours/website facts.
- Day titles (#27 `title`) and day reorder (#29): no UX path.
- Today/Trip mode and whole-day multi-part Google hand-off (keep per-leg hand-off): after CP3 if time remains.
- Cross-day drag on desktop (menu covers it).
- QR daily provider budgets (token buckets already cap upstream at ~1 req/s), Argon2 semaphore (measure first), `POST /client-errors`, `GET /me/export`, `/reset/{token}` web flow (CLI instead).
- Route `ETag` (query keyed by `planVersion`, `staleTime: Infinity`).
- PWA manifest and Lighthouse CI: later; keep the bundle budget as a warning.
- `Idempotency-Key` (C5).
- `lucide-react` dependency (inline SVG icons).

### 5.2 Fix (under-engineered)
- API: logging, headers, `cleanText`, UGC throttles (2.3).
- Shared problem schema extensions (§3).
- `GET` my review via `PlaceDetail.myReview`; copy of link trips; path-based share endpoints; `place` = `tripPlaceId`; two remove actions.
- Explore card fields (`copyCount`, `defaultMode`); owner card `startDate`, `updated_at` sort.
- Rating threshold ≥ 6; e-mail trim-before-validate.
- Visibility change generates the share token atomically.
- Note autosave has no concurrency control (last write wins across tabs): mark `SHORTCUT`.
- `mutationKey: ['trips', tripId]` on every plan mutation, or UX's global "Saving…" (`useIsMutating`) sees nothing.
- Web env validation module (QR §5.6) does not exist in the skeleton.
- About/privacy/contact pages; attribution text from PB §5.
- Moderation page.

## 6. Final decision list

| # | Question (source) | Recommendation | Why |
|---|---|---|---|
| D1 | Guest drafts / guest accounts (API §10.1, UX §10.2, QR §0.3, RES principle 8) | No guests in v1; three-field sign-up; public browsing without account; `SHORTCUT` with UX's trigger | all three agree; a second persistence model + anonymous provider proxy |
| D2 | Account deletion: delete or anonymise reviews (API §10.2) | Delete | erasure expected; summaries computed on read |
| D3 | `email_taken` enumeration (API §10.3, QR §2.7) | Accept, owner recorded, 5 sign-ups/h/IP | no e-mail delivery to hide behind |
| D4 | Prisma `partialIndexes` preview (API §10.4) | Keep (RAN); fallback hand SQL if a Prisma upgrade drops it | verified render |
| D5 | Stop-ordering model (C1, QR §0.2) | API trip lock + `planVersion`, `plan_changed` | RAN, one lock, no DEFERRABLE |
| D6 | CSP vs PPR (QR §0.1) | Nonce CSP; `cacheComponents: false`, `partialPrefetching: false` | removes stale-private-page defect; pages are session/visibility-dependent |
| D7 | Public-page invalidation (UX §10.3) | Moot under D6 (dynamic rendering) | — |
| D8 | Calendar dates format (UX §10.4) | `YYYY-MM-DD` for `startDate`, `YYYY-MM` for `visitedMonth`, formatted with `timeZone: 'UTC'` | lead 2 covers timestamps only |
| D9 | Contract plumbing (C22, QR §0.7) | API endpoint table + `ContractInterceptor`; strict inputs | one registry also feeds authz matrix |
| D10 | OpenAPI generator | `zod-openapi` 6.0.2 if a phase-0 spike emits valid 3.1 for `TripPlan`; else `z.toJSONSchema` + hand paths | neither run |
| D11 | OpenAPI file location | `packages/shared/openapi.json`, drift test, served at `/api/v1/openapi.json` | generated from shared |
| D12 | Logger (QR §0.7) | `nestjs-pino` 5.3.2 | Nest 12 peer, redaction |
| D13 | Password hashing lib (API §3.3, QR §0.8) | `@node-rs/argon2` 2.2.2, default algorithm, PHC string asserted in a test | no install script |
| D14 | Password policy | 12–128, blocklist, ≠ e-mail | stronger at no UX cost |
| D15 | Share URLs | `/s/[shareToken]` (link), `/t/[tripId]` (public); API `/shared/{token}/plan`, `/route`, `/copies` | token never in query or Explore |
| D16 | Notes on shared trips | Never | RES §1.5, principle 9 |
| D17 | Blocking | Keep | RES §1.5 minimum moderation |
| D18 | Nominatim fallback | Off by default in dev and e2e; owner opts in for production after reading the policy; #23 cache miss → 503 when off | policy-sensitive (PB §5) |
| D19 | Anonymous search and routing | Signed-in only; anonymous route views from cache + estimates | closes anonymous proxy |
| D20 | Moderation | role `moderator` (seed/SQL), API #45–46, minimal page, no auto-hide | brigading risk |
| D21 | E2E isolation (QR §0.6) | ports 3110/3111, DB `heremita_e2e`, fake providers, blank style, no network | hermetic |
| D22 | Phase-0 foundation by one engineer, single owners of lockfile/migrations/hot files (QR §0.5, §6) | Accept | shared tree, no branches |
| D23 | DnD library | `@dnd-kit/core` + `sortable` after a React 19 spike; fallback `@dnd-kit/react` exact pin | neither run |
| D24 | Combobox | `downshift` 9.5.0 hook | peer OK, headless |
| D25 | Bottom sheet | Build in-house (UX §6.7) | vaul is a modal Dialog |
| D26 | Icons | Inline SVG set in `shared/icons` (ISC licence notice) | lucide 1.75.0 blocked today; fewer deps (lead 7) |
| D27 | i18n | `next-intl` 4.15.1, prefixed locales, namespaces per C28; spike with D6 config | peers OK, unrun |
| D28 | URL state | `nuqs` 2.10.3 (`day`, `place`=tripPlaceId, `mode`); fallback `useSearchParams` | STD 2.5 |
| D29 | Basemap | OFM positron/dark + VersaTiles fallback | ML §3 |
| D30 | Limits and codes | 25/60/300/100, title 120, note 4000, review 10–2000; 409 `limit_reached`/`day_full` | routing cap, STD 3.1 |
| D31 | Rating display | average and distribution at ≥ 6 ratings; count always | RES §1.5 |
| D32 | Seed | API volumes, `isDemo` badge, one committed gazetteer for fake + seed, `DEMO_PASSWORD` from env, refuses production | trust + determinism |
| D33 | Session cookie | `__Host-hm_session`/`hm_session`, `Max-Age` absolute 90 d, idle 30 d in DB, touch ≤ hourly | RSC cannot refresh cookie |
| D34 | Trust proxy | explicit topology (`loopback, uniquelocal`), prod proxy overwrites XFF | XFF spoofing |
| D35 | Idempotency-Key | Not in v1 (`SHORTCUT`) | lead 9 no auto-retry; UNIQUE dedups OSM adds |
| D36 | Password reset | Owner CLI sets a temporary password, kills sessions | no e-mail |
| D37 | Optimise order | Keep as suggestion with Undo; first to cut if CP3 slips | not a must-have |
| D38 | Today mode, PWA, export, client-errors | Defer | out of must-have scope |
| D39 | Fake providers in production | Refused unless `ALLOW_FAKE_PROVIDERS=true` (e2e prod build) | PB §7.8 |
| D40 | Product User-Agent | `Heremita/<version> (+<PUBLIC_SITE_URL>/about)` from env, never a person's name or e-mail | PB §5 requires an identifying UA; isolation rule forbids personal data |
| D41 | TypeScript 7 / vitest 5.1.1 | Stay on 6.0.3; move vitest to 5.1.1 from 2026-11-19 | SCAF 7.4, 7.5 |
| D42 | `pnpm db:reset` | Owner runs it once by hand; agents never bypass Prisma's guard | SCAF 7.1 |
| D43 | `apps/web/AGENTS.md` written by `next dev` | Keep | points at version-matched docs |
