# Heremita design proposal: quality, security, risk and delivery

Status: COMPLETE (2026-11-18). Lens: the engineer who gets blamed when it fails.

Inputs read in full: `standards.md`, `ux-research.md`, `providers-brief.md`, `maplibre-guide.md` (marked COMPLETE), `scaffold-report.md` (marked IN PROGRESS; the skeleton was read as it stood at about 16:00). All four research inputs exist. Tags used below: **[V]** = I checked it myself today (command or file named in section 8); **[R]** = taken from a research file; **[D]** = my decision.

## 0. Decisions in this proposal that the lead must merge or reject

1. **Nonce-based CSP, and `cacheComponents: false`.** The Next 16.4.6 CSP guide bundled in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` says nonces need dynamic rendering and "Partial Prerendering (PPR) is incompatible with nonce-based CSP" [V]. The skeleton has `cacheComponents: true`. Almost every Heremita page depends on the session or on visibility anyway, so PPR earns little. I choose strict CSP over PPR.
2. **Stop ordering:** an integer `position`, `UNIQUE (day_id, position) DEFERRABLE INITIALLY DEFERRED`, a `version` column on each day, and whole-list reorder writes that return 409 on a stale version. The "Ideas" bucket is a day row with `kind = 'ideas'`, so every stop always has a `day_id`.
3. **No guest planning in v1.** Guests can browse Explore, public trips and reviews. Creating anything needs an account, but sign-up is one screen with three fields and no e-mail check. This also closes the anonymous search proxy (section 2.6). It goes against UX principle 8 ("no wall before value"). I explain why in section 7.
4. **One authorisation path.** All trip-scoped routes go through `TripAccess.require(userId, tripId, 'read' | 'write')` and one scoped query per child. An **authz matrix test** lists every registered Nest route and fails when a route is not covered.
5. **Full v1 data model and contract in phase 0**, written by one engineer before parallel work. Afterwards only one person creates migrations and only one person installs dependencies.
6. **E2E gets its own ports (3110 web, 3111 api) and its own database (`heremita_e2e`)**, with fake providers and a local map style. It never reuses the dev servers, because those run real providers on the dev database.
7. **Logger: `nestjs-pino` 5.3.2**, whose peers include `@nestjs/common ^12.0.2` [V]. **Validation pipe: our own `ZodPipe` (about 40 lines).** `nestjs-zod` 5.6.0 declares `@nestjs/common ^10 || ^11` only [V].
8. **Password hashing: `@node-rs/argon2` 2.2.2.** It ships prebuilt optional binaries and has no install script. `argon2` 0.45.2 runs `node-gyp-build` at install [V], which pnpm 11 `allowBuilds` would have to approve.

## 1. Pre-mortem: it is 2026-12-18 and Heremita disappointed

Ranked by likelihood × damage. Each cause comes with the measure to build in from day one.

| # | Why it failed | Preventive measure (day one) |
|---|---|---|
| 1 | **Itinerary editing on a phone felt broken.** Drag fought the scroll and the sheet. Reorders reverted, and two tabs overwrote each other. This is the core promise and nobody else does it well on mobile web [R ux 1.1, 1.3]. | Build the tap twins first: each stop's menu has Move up, Move down, Move to day…, Remove. Drag-by-handle comes later, inside a reorder mode only. The server uses versioned whole-list writes (section 2.3), and the client uses optimistic updates with rollback and Undo. The e2e suite reorders with taps on a Pixel 7 profile and checks the order after a reload. |
| 2 | **The app looked broken whenever a free provider sneezed.** Photon took 3 s, FOSSGIS returned 429, OpenFreeMap went down, or our generic User-Agent got us blocked. | Section 3: per-host deadlines, breakers and token buckets, a Postgres cache, labelled straight-line estimates, a basemap fallback and a list view that works without the map. Fake providers are on by default in tests and e2e. Real providers run in dev, with an identifying UA and a contact page. |
| 3 | **Integration hell in one shared tree.** Contract drift between web and api, two people running `prisma migrate dev` at once, lockfile clobbering, `messages/pt-BR.json` merge fights, and `app.module.ts` edited by five people. | Section 6: phase 0 freezes the contract and data model. It pre-registers every module, namespace and route constant, and installs every dependency. After that, each directory has exactly one owner, and the hot files have one owner each. |
| 4 | **Private data leaked.** A public trip exposed the owner's notes or exact dates, or `/trips/{id}/days/{dayId}` accepted a `dayId` from someone else's trip. | Public responses use separate output schemas (`PublicTrip` has no `note` field, so it cannot be serialised). Child-in-parent scoping lives in the same SQL `WHERE`. The authz matrix test (4.4) covers it, and visibility defaults to `private`. |
| 5 | **Mobile web specifics hurt.** `100vh` jumps, pull-to-refresh fires inside the sheet, the attribution sits under the sheet, inputs below 16 px zoom on iOS, and iOS Safari was never tested. | Use `dvh` and `overscroll-behavior: contain` on the sheet. Inputs are at least 16 px. The attribution control sits top-left [R maplibre 3]. A Playwright WebKit (iPhone) project runs the non-map journeys. Checkpoint CP4 includes a manual pass on one real iPhone and one real Android phone. |
| 6 | **Community looked empty, or fake.** Seed reviews that pose as real users destroy trust [R ux 1.5]. | Seed demo content from a fixed gazetteer, flagged `is_demo` and shown with an "Exemplo" / "Example" badge. Show an average only above 5 ratings. Show counts everywhere. |
| 7 | **Route numbers were wrong and users stopped trusting them.** | Every estimated leg says so (`estimated: true`, dashed, "estimativa"). An OSRM stop snapped more than 1 km (walk/bike) or 3 km (drive) away becomes unroutable [R providers 4.3]. Day totals carry an "includes estimates" flag. |
| 8 | **Data loss.** An optimistic update showed success that never persisted, or a delete without Undo removed a day of work. | Rollback in `onError` plus a toast. Every destructive action has Undo (an inverse mutation). Mutations are never retried. A test for each case (4.5). |
| 9 | **Scope ran out before the core was solid.** The UX inventory lists 17 screens. | Use the cut list (section 7). Freeze scope at CP2: anything not on the walking skeleton by then must justify itself. |
| 10 | **It cannot be deployed or restored.** Migrations ran on boot, there was no backup, and the secrets lived in the image. | Section 5.6: a `migrate` one-off container, a nightly `pg_dump`, an env-only configuration validated by zod, and a rehearsed restore. |
| 11 | **Slow on a mid-range Android.** | Load the map with `next/dynamic({ssr:false})`, cap `pixelRatio` at 2 [R maplibre 7], and use GL layers instead of DOM markers. A bundle analyser runs at CP3. Keep the planner route's client JavaScript under a budget (I propose 250 kB gzip excluding maplibre, as a warning, not a gate). |
| 12 | **The pt-BR UI showed English strings or raw keys.** | Message files are typed: the `en` files are the source type, and `pt-BR` must satisfy it (`satisfies Messages`). A parity unit test fails on missing keys. |

## 2. Threat model and controls

**Assets:** accounts and sessions, private notes and trip plans (where a solo traveller will be and when, which is a safety concern [R ux 1.7]), review integrity, and our standing with free providers (a ban takes search and routing down for everyone).
**Actors:** an anonymous visitor, a curious signed-in user (IDOR), a spammer or scraper, an attacker with stored-XSS payloads, and a cross-site page attempting CSRF.
**Trust boundaries:** browser → Next (web origin) → API (private) → Postgres; API → Photon / Nominatim / FOSSGIS; browser → OpenFreeMap tiles.

### 2.1 Sessions (within lead decision 5)

- **Token:** 32 random bytes (`crypto.randomBytes`), base64url. Store `token_hash = sha256(token)` as `bytea UNIQUE`. A fast hash is right for 256-bit random tokens; Argon2 there would only burn CPU.
- **`sessions` columns:** `id uuid`, `user_id` (FK, `ON DELETE CASCADE`, indexed), `token_hash`, `created_at`, `last_seen_at`, `expires_at`. No IP and no full user agent stored (data minimisation).
- **Cookie:** `__Host-hm_session` in production (requires `Secure`, `Path=/` and no `Domain`; this works because the browser only sees the web origin) and `hm_session` in development over http. The name comes from the env. Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age` equal to the absolute lifetime.
- **Lifetime:** 30 days idle (sliding) and 90 days absolute. `last_seen_at` and the slide are written at most once per hour per session, so a busy user does not cause a write per request.
- **Rotation:** login and sign-up always create a new session. Logout deletes the row and clears the cookie. A password change deletes all other sessions. `DELETE /api/v1/me/sessions` signs out everywhere.
- **Lookup:** one query per request (`sessions JOIN users` on `token_hash`, checking `expires_at > now`) in a global `SessionMiddleware`. It sets `req.user` or leaves it empty. `@Public()` routes skip the `AuthGuard`, and everything else is deny-by-default.
- **Server Components:** `apiServer()` reads `cookies().get(SESSION_COOKIE)` and sends exactly `Cookie: <name>=<value>` plus `X-Request-Id` to `API_URL`. It never forwards other incoming headers. Server Components only make GET requests.
- **No Server Actions in v1.** All mutations go browser → `/api/*` rewrite → Nest, so there is one CSRF model. An ESLint `no-restricted-syntax` rule bans the `'use server'` directive in `apps/web/src`.

### 2.2 CSRF

A global Nest guard, `CsrfGuard`, runs on `POST`, `PUT`, `PATCH` and `DELETE`, including login and sign-up (login CSRF):

1. If `Sec-Fetch-Site` is present, it must be `same-origin`. Otherwise → 403 `csrf_rejected`.
2. Otherwise `Origin` must equal `WEB_ORIGIN` exactly (env, validated as a URL at boot). A missing Origin → 403. Test clients set Origin explicitly.
3. A request with a body must be `Content-Type: application/json`. Otherwise → 415. This blocks form-encoded "simple requests" even if checks 1 and 2 were ever bypassed.

GET handlers never mutate (code review rule). The Next rewrite proxy keeps `Origin` and `Sec-Fetch-Site`. I read `next/dist/server/lib/router-utils/proxy-request.js`: it sets `changeOrigin: true`, which changes `Host` only [V]. An e2e test proves it: a cross-origin form POST from a page on another port gets 403.

### 2.3 Authorisation and IDOR

- **Policy:** `apps/api/src/trips/trip-access.ts` holds the only code that decides trip access:
  - `read`: owner, or `visibility = 'public'`, or a valid `shareToken` presented on the shared route;
  - `write`: owner only (v1 has no collaborators).
  - A miss is always **404 `not_found`**, never 403 (standards 3.1).
- **Nested scoping in one statement.** `PATCH /trips/{tripId}/days/{dayId}/stops/{stopId}` runs `UPDATE stops s SET … FROM days d JOIN trips t ON t.id = d.trip_id WHERE s.id = $stopId AND s.day_id = d.id AND d.id = $dayId AND t.id = $tripId AND t.owner_id = $userId RETURNING …`. Zero rows → 404. The pattern to avoid is "load the trip, check the owner, then update the stop by id".
- **Reviews:** `UPDATE/DELETE … WHERE id = $id AND author_id = $userId`. A user can hold one review per place: `UNIQUE (place_id, author_id)`, and a duplicate → 409 `review_exists`.
- **Mass assignment:** request bodies are `z.strictObject` in `packages/shared`, so an unknown key → 422 with a pointer. No input schema contains `id`, `ownerId`, `authorId`, `visibility` (that one has its own endpoint), `version` (only where concurrency needs it), `isDemo` or `role`. Handlers map input to Prisma explicitly, never with a spread.
- **Reorder (read-modify-write, standards 3.2):**
  - `PUT /api/v1/trips/{tripId}/days/{dayId}/stop-order` with body `{ stopIds: string[], version: number }`. In one transaction:
    1. `SELECT … FROM days … FOR UPDATE` (scoped as above);
    2. if `version` is stale → 409 `stale_version`;
    3. if `stopIds` is not exactly a permutation of the current stops → 409 `stale_order`;
    4. one `UPDATE stops SET position = u.pos FROM unnest($ids, $positions) …`;
    5. `version = version + 1`.
  - The unique constraint on `(day_id, position)` is `DEFERRABLE INITIALLY DEFERRED` (hand-written SQL in the migration; Prisma cannot express it), so swaps do not collide mid-statement.
  - Cross-day move: `POST /api/v1/trips/{tripId}/stops/{stopId}/move` with body `{ toDayId, toIndex, fromVersion, toVersion }`. It locks both days `FOR UPDATE` in ascending `id` order (consistent lock order) and bumps both versions.
  - Why a sub-resource and not `:move`: Express 5's `path-to-regexp` treats `:` as a parameter marker. The custom-method style would need escaping, which nobody will remember. This deviates from standards 3.1's `POST /orders/{id}:cancel`. I accept that deviation.
- **Limits (bounded work, and they keep route calls under the 25-stop cap):** 100 trips per user, 60 days per trip, 40 stops per day, 400 stops per trip, 120 characters per title, 4,000 characters per note, 10 to 2,000 characters per review text, rating an integer from 1 to 5. Each limit is a constant in `packages/shared/src/limits.ts`, used by both the zod schemas and the service checks. Exceeding one → 409 `limit_reached`.

### 2.4 Input validation

- One `ZodPipe` applies `schema.safeParse` on body, params and query. Each issue maps to `errors[{ pointer: '/' + path.join('/'), detail }]` and the response is a **422**. Malformed JSON → **400**. The body limit is `express.json({ limit: '64kb' })`, and a larger body → **413**.
- IDs are validated as UUIDs in params. A bad one → 404, not 422: a garbage id is just "not found", which reveals nothing and spares the client a branch.
- **Text normalisation,** in one shared `cleanText()` zod transform:
  - NFC, then trim;
  - strip C0/C1 control characters except `\n`;
  - strip bidi overrides U+202A–U+202E and U+2066–U+2069 (display-name spoofing);
  - collapse runs of more than 2 blank lines.
  - It runs server-side through the same schema the form uses.
- **Cursor:** base64url of `{"t":"<iso>","id":"<uuid>"}`. It is decoded and validated with zod, and garbage → 422 `invalid_cursor`. Tampering is harmless because the query stays scoped. `limit` defaults to 20, maximum 50.

### 2.5 Stored XSS (notes, reviews, names, trip titles)

- User text is rendered **only as React text nodes**. No Markdown in v1. `react/no-danger` is an ESLint error.
- MapLibre: our labels are canvas symbols (inert). Popups, if any, use `setDOMContent`, never `setHTML`. `customAttribution` is our own constant string.
- The only URLs rendered come from OSM `website` tags. They are kept only if `new URL(v)` has protocol `http:` or `https:`, and rendered with `rel="noopener noreferrer nofollow ugc"` and `target="_blank"`. No user-entered URLs in v1.
- The page `<title>` and OG tags of a public trip use the trip title through Next's `metadata`, which escapes it.
- The CSP (2.10) is defence in depth, not the control.
- The test seeds a note `"<img src=x onerror=alert(1)>"` and a review `"</script><script>alert(1)</script>"`. An e2e test asserts the literal text is visible and that no `dialog` event fired.

### 2.6 Rate limiting and abuse of the geocoding and routing proxy

Use `@nestjs/throttler` 6.8.0 (peer `@nestjs/core ^12.0.0` [V]) with in-memory storage and named throttlers per route. The key is the session id when signed in, otherwise the client IP. Express `trust proxy` is set to the exact topology: `loopback, uniquelocal` in production behind Caddy → Next. Caveat [V, by reading Next's source]: Next's base server sets `x-forwarded-for ??=`, so it **keeps** a client-sent value in dev. Production must sit behind a proxy that overwrites the header (Caddy does).

| Route group | Limit | Over limit |
|---|---|---|
| `POST /auth/login` | 5/min per IP+email, 20/h per email, 30/min per IP | 429 + `Retry-After` |
| `POST /auth/signup` | 5/h per IP | 429 |
| `GET /places/search` (signed-in only) | 5/s, burst 10 per session; 2,000/day per user | 429 |
| `GET /places/reverse` | 1/s, burst 3 | 429 |
| `GET …/route`, `…/order-suggestion` | 2/s, burst 5 | 429 |
| `POST /reviews`, `POST /reports` | 10/h per user | 429 |
| Everything else | 20/s per key | 429 |

- **No anonymous search.** Search, reverse and routing of private trips require a session. Public trips' routes are served from the leg cache, and on a miss they fall back to estimates for anonymous viewers. Strangers therefore cannot burn our upstream budget.
- **Cache poisoning:**
  - Cache keys are built from validated, canonicalised parameters (enumerated locale, coordinates rounded to 4 or 5 decimals, `intent`, provider id), never from the raw query string.
  - Only parsed, mapped, successful results are cached. Estimates and errors never are [R providers 7.4].
  - The provider id is part of the key, so fake results cannot leak into real ones.
  - The client never sends names or coordinates for a saved place, only the `key`. The server resolves it [R providers 2].
- **Quota burn:**
  - Upstream token buckets per host [R providers 7.5].
  - A daily budget per provider, in process (`PHOTON_DAILY_BUDGET=20000`, `OSRM_DAILY_BUDGET=10000`, `NOMINATIM_DAILY_BUDGET=2000`). Past the budget the proxy serves cache only, plus estimates or a 503 `geocoding_busy`, and logs `warn` once per hour.
  - `// SHORTCUT(owner): rate-limit and budget state in process memory — ceiling: one API instance, counters reset on restart; upgrade: before a second API instance, move to a Postgres-backed bucket table`
- **SSRF:** provider base URLs come from env only. No endpoint fetches a user-supplied URL.
- **Argon2 CPU and memory DoS:** a semaphore allows 4 concurrent hashes (19 MiB each). The next request waits at most 2 s, then gets a 503.

### 2.7 Account enumeration and passwords

- **Login:**
  - one generic 401 `invalid_credentials`;
  - for an unknown e-mail, verify against a fixed dummy Argon2id hash so the timing matches;
  - no account lockout (that would let anyone DoS a victim), only the throttles above.
- **Sign-up enumeration is accepted.** Without e-mail delivery, a non-enumerating sign-up ("check your inbox") is impossible. Sign-up therefore answers 409 `email_taken`. Mitigation: 5 sign-ups per hour per IP. Recorded as an accepted risk (owner: project owner; revisit when e-mail delivery arrives).
- **Passwords (NIST SP 800-63B style):**
  - 12 to 128 characters;
  - no composition rules;
  - rejected if equal to the e-mail or its local part, or if listed in a bundled 10,000-entry common-password list (SecLists `10k-most-common.txt`, MIT; check the licence when vendoring);
  - paste allowed, `autocomplete="new-password"` / `current-password` (standards 2.7).
  - Argon2id with m=19456 KiB, t=2, p=1 via `@node-rs/argon2`. Store the PHC string, and rehash on login if the parameters ever change.
- **No password reset in v1** (no e-mail). An owner-only CLI, `pnpm --filter @heremita/api cli reset-password <email>`, prints a one-time 30-minute token that the user redeems at `/reset/{token}`. The sign-in page says so plainly.

### 2.8 Secrets

The app has almost none: no JWT keys and no API keys. The only secrets are `DATABASE_URL` (with its password) and optionally `SEED_DEMO_PASSWORD`.

- All configuration comes from env and is validated with zod at boot (the skeleton already does this, and fails fast).
- The `.env` files are gitignored (check) and hold development-only values.
- In production: compose `env_file` with mode 600 on the host, or Docker secrets later.
- The logger redacts `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]` and `*.password`, `*.newPassword`, `*.token`, `*.shareToken`.
- The fake providers are refused when `NODE_ENV=production` (an env schema refine).

### 2.9 Security headers

- **Web (set in `apps/web/src/proxy.ts` together with the CSP):**
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production only)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`
  - `Cross-Origin-Opener-Policy: same-origin`
- **API:** `helmet` 8.3.0 with defaults, `x-powered-by` disabled, and `Cache-Control: no-store` on every response that read a session. Public, cacheable reads (public trip, reviews) send `Cache-Control: private, max-age=0, must-revalidate`, because v1 has no CDN.

### 2.10 CSP compatible with MapLibre and Next 16

Generated per request in `proxy.ts`, following the Next 16 guide [V]. The nonce is `Buffer.from(crypto.randomUUID()).toString('base64')`, and the matcher excludes `api`, `_next/static`, `_next/image` and prefetches.

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

Why each MapLibre-related entry:

- **Hosts:** the positron and dark styles pull sprite, glyphs and tiles only from `tiles.openfreemap.org`, and the VersaTiles fallback only from `tiles.versatiles.org`. I fetched all three styles and the TileJSON to confirm [V]. MapLibre loads style, tiles, glyphs and sprites with `fetch`, so they belong in `connect-src`. `img-src blob: data:` covers image decoding paths.
- **Worker:** maplibre 6 ships its worker as a separate `.mjs` loaded with `setWorkerUrl`, so `blob:` is no longer needed [R maplibre 11]. The bundled file is served from `/_next/static`. I set **`worker-src 'self'` explicitly**: with `'strict-dynamic'`, browsers ignore `'self'` in `script-src`, and `worker-src` falls back to `script-src`. Without it the worker would be blocked. Reasoned from the CSP spec, not run.
- **`style-src-attr 'unsafe-inline'`:** React `style={{'--sheet-height': …}}` props render as attributes, and nonces never apply to attributes. Style-attribute injection is low risk.
- **Dev only:** `'unsafe-inline'` on `style-src` because the Turbopack dev CSS may inject un-nonced `<style>` (unverified, so allow it in dev only), and `ws:` for HMR.
- **Enforced everywhere, not report-only.** The e2e suite listens for `securitypolicyviolation` on every page and fails on any violation, so a broken CSP shows up on the first map test.
- **Consequence:** `next.config.ts` gets `cacheComponents: false`, and pages read `await connection()` where needed. If the lead keeps PPR instead, the fallback is the guide's static CSP with `script-src 'self' 'unsafe-inline'`. That fallback leaves React escaping as the only real XSS control, and I would record it as an accepted risk.

### 2.11 Privacy

- **Visibility:** `private` (default) | `link` (anyone holding the 128-bit `share_token`, at `/s/{token}`, not listed, `noindex`) | `public` (listed in Explore, indexable). Moving to `private` keeps the token. "Reset link" issues a new one and revokes the old.
- **What a `link` or `public` trip exposes** (output schema `PublicTripSchema`): title, description, day count, for each day the label "Day n" (dates are never exposed, only the month and year of the trip if the owner sets them), stops with place name, category, coordinates and order, the author's display name and handle, and copy and review counts.
- **What it never exposes:** e-mail, notes (notes are always private, the Polarsteps pattern [R ux 1.5]), exact dates, `owner_id`, `share_token` (except to the owner), or the trip's update times (they reveal activity).
- **Copy a trip:** the copy takes places and order, never notes. It records `copied_from_trip_id` (`ON DELETE SET NULL`) and is private.
- **Account deletion:** `DELETE /api/v1/me` with `{ password }`. One transaction deletes the user, which cascades to sessions, trips, days, stops and their notes, reviews and reports filed. Copies made by others stay, because they belong to those users. Cached places stay (OSM data, not personal). A test asserts that no row with that `user_id` remains in any table: it iterates `information_schema.columns` for `*_user_id`, `author_id` and `owner_id`.
- **Logs:** never the search text or coordinates. Log `q.length`, `locale` and `intent`. The pino-http serializer logs the route template, not the URL with its query.
- **Privacy page** (`/privacy`): names komoot (Photon), OSMF (Nominatim), FOSSGIS (routing) and OpenFreeMap as recipients of queries, coordinates and IPs (tiles) [R providers 5], and gives a contact address, which FOSSGIS requires. The page is static.
- **Moderation minimum:**
  - `POST /api/v1/reports` (target type review or trip, reason enum, optional text up to 500 characters);
  - users have a role enum `user | admin`, set only by the CLI `make-admin`;
  - an admin-only `/admin/reports` list and `POST /api/v1/admin/reviews/{id}/hide`;
  - hidden content returns 404 to everyone but its author.

## 3. External-provider resilience

I adopt the providers brief wholesale. The decisions it already made are in brackets: Photon for search and reverse, a Nominatim submit-only fallback, FOSSGIS OSRM for routes, our own optimiser on straight-line distances, polyline5 per leg, a Postgres `provider_cache`, the timeout, retry and breaker numbers of 7.6, and the user-visible degradations of 7.7. What I add or pin down:

- **One outbound client, `apps/api/src/providers/http/outbound.ts`,** used by every adapter. It owns:
  - the deadline: `AbortSignal.any([caller, AbortSignal.timeout(perAttempt)])` inside an 8 s request budget;
  - retries on GET only (network error, timeout, 5xx, 429; at most 2; full jitter from 250 ms capped at 2 s; honours `Retry-After`; never past the deadline; logs `warn` per retry);
  - the per-host token bucket and the per-host breaker (5 consecutive retryable failures → open 30 s → one probe);
  - single-flight for identical keys;
  - the fixed headers `User-Agent: Heremita/<version> (+<PUBLIC_SITE_URL>/about)` and `Referer: <PUBLIC_SITE_URL>/` (the providers brief explains why a stock UA gets throttled together with strangers and blocked) [R providers 5].
  - Adapters only build URLs, parse with the upstream zod schemas and map. One layer retries; the web never retries a provider-backed query beyond its one network retry (lead 9). The two layers are acknowledged: tension 13 in the standards, resolved by lead decision 9.
- **Special statuses:** a FOSSGIS 429 pauses the host for 60 s. A 403 pauses it for 1 h and logs `error` (a human must fix the UA or Referer).
- **Configuration:** `GEOCODING_PROVIDER=photon|fake`, `ROUTING_PROVIDER=osrm|fake`, `NOMINATIM_ENABLED=false` by default (the owner decides deliberately, as the brief's quoted policy demands), base URLs in env (FOSSGIS asks for no hard-coded URLs), and `PUBLIC_SITE_URL`.
- **Fake providers, `apps/api/src/providers/fake/`:**
  - `gazetteer.ts`: about 60 fixed places in Lisboa, Rio de Janeiro, São Paulo and Paris with real OSM refs, names in pt-BR and en, and categories. The **seed uses the same file**, so seeded places are searchable in e2e.
  - Fake geocoding: case- and accent-insensitive substring match, ranked by distance to `bias`, deterministic.
  - Fake routing: haversine × 1.3 at 4.6, 15 and 30 km/h, with a 2-point polyline per leg, `provider: 'fake'`, `quality: 'routed'`.
  - Fault switches are **constructor options** (`{ failWith: 'timeout' | 'unavailable' | 'rate_limited', after: n }`), used by integration tests that build the app with a configured fake. They are never reachable from HTTP.
- **Contract tests offline:** copy the brief's saved upstream bodies (Photon features, OSRM `Ok` and 6 error codes, Nominatim) into `apps/api/test/fixtures/upstream/`. Mapper and schema tests run against them. A manual `pnpm --filter @heremita/api test:live` (not in CI) makes one call per provider with the real UA.
- **Network is forbidden in tests:**
  - API: a Vitest setup file installs an undici `MockAgent` as the global dispatcher with `disableNetConnect()`, then `enableNetConnect(/localhost|127\.0\.0\.1/)` for Postgres-adjacent HTTP. Needs the `undici` dev dependency; check that Node 24's built-in `fetch` honours `setGlobalDispatcher` from the installed undici major (unverified).
  - Web: MSW with `onUnhandledRequest: 'error'`.
  - E2E: `NEXT_PUBLIC_MAP_STYLE_LIGHT/DARK` point at `/dev/blank-style.json` (served from `apps/web/public/dev/`), and a Playwright `context.route` aborts any request to a host other than `localhost`.
- **Graceful UI degradation (web):**
  - Search: an inline "Busca indisponível · Tentar de novo" in the results region. Recents and "Adicionar um ponto aqui" keep working.
  - Route: dashed estimated legs, "estimativa" chips, and a banner "Rotas aproximadas: serviço de rotas indisponível".
  - Basemap: if both the OFM and VersaTiles styles fail, the map region shows `role="alert"` and the stop list remains fully usable.
  - Each state is a reusable component in `apps/web/src/shared/components/states/` (standards 2.11).
- **Attribution:** "© OpenStreetMap contributors (ODbL) · OpenFreeMap · Rotas: OSRM/FOSSGIS · Corrigir o mapa" is visible above the sheet [R providers 5, maplibre 3].

## 4. Test strategy

### 4.1 Pyramid and tooling

| Layer | Tool | Where | Runs on |
|---|---|---|---|
| Shared unit | Vitest 5.1.0 | `packages/shared/src/**/*.test.ts` | schemas: limits, `cleanText`, cursor codec, locale parsing |
| API unit | Vitest | `apps/api/src/**/*.test.ts` | pure logic: optimiser, polyline cut, upstream mappers (on fixtures), category mapping, breaker and bucket with an injected clock, trip-access decisions, problem mapping |
| API integration | Vitest + supertest + real Postgres (per-file DB) | `apps/api/test/**/*.test.ts` | each endpoint through the real Nest pipeline (`configureApp`), fake providers, `FixedClock` |
| Web unit and component | Vitest + RTL + user-event + jest-dom + MSW | `apps/web/src/**/*.test.tsx` | forms, optimistic reorder, state components, query-key factories, message parity |
| E2E | Playwright 1.65 | `apps/web/e2e/` | 8 critical journeys on `mobile-chromium` (Pixel 7), plus `desktop-chromium`; `mobile-webkit` (iPhone 15) for non-map journeys |

Rough target counts: about 60% API unit and shared, 25% API integration, 10% web component, under 5% e2e (about 12 specs).

### 4.2 Harness pieces (phase 0)

- **`apps/api/test/support/app.ts`:** `buildTestApp({ clock?, geocoding?, routing? })` creates its own per-file database (the skeleton's `createTestDatabase`, already proven parallel [R scaffold]), boots `AppModule` with `configureApp`, overrides the `CLOCK`, `GEOCODING_PROVIDER` and `ROUTING_PROVIDER` tokens, and returns `{ http, prisma, close }`. `afterAll` closes the app and drops the database.
- **`apps/api/test/support/factories.ts`:** `createUser(app, overrides?)` signs up through the HTTP API and returns `{ user, cookie, agent }`. `agent` is a supertest agent with the cookie and `Origin: WEB_ORIGIN` preset. Helpers `createTrip(agent, { days: 2, stopsPerDay: 3 })`, `addStop(agent, dayRef, gazetteerKey)`, `publishTrip(agent, tripId)`. Unique e-mails come from a per-file counter plus a random suffix. Tests never truncate and never depend on another test's rows.
- **Clock:** a `Clock` interface (`now(): Date`) behind a Nest token. `SystemClock` in production, `FixedClock` with `advance(ms)` in tests. No `new Date()` in services (lint rule `no-restricted-syntax` on `NewExpression[callee.name=Date][arguments.length=0]` under `apps/api/src/**`, excluding `system-clock.ts`).
- **Web:** `apps/web/test/msw/handlers.ts` with typed builders that return shared-schema-typed bodies, and `renderWithProviders(ui, { route?, locale? })` with a fresh QueryClient that has `retry: false`.
- **E2E:**
  - `globalSetup` drops and creates `heremita_e2e` using `pg`. This is not `prisma migrate reset`; that command is blocked for agents by Prisma's consent guard [R scaffold], and we leave the guard alone.
  - It then runs `prisma migrate deploy` and the seed.
  - Servers start on ports 3110 and 3111 with `reuseExistingServer: false` and production builds in CI.
  - A worker-scoped fixture signs up one user per worker through the API and saves `storageState`.

### 4.3 What must be tested before a feature counts as done

For each endpoint (standards 3.1): happy path, 422 validation with the pointer checked, 401 anonymous, 404 for another user's object, 409 where a conflict exists, and the pagination edge cases (empty, one, exactly `limit`, `limit + 1` → `nextCursor` non-null then null). For each screen: loading, empty, error with Retry, and success (RTL). For each form: field error wired (`aria-invalid` and `aria-describedby` → `role="alert"`), submit disabled while submitting, and server 422 mapped onto the fields.

### 4.4 The authz matrix (the test that catches missing checks)

The file is `apps/api/test/authz-matrix.test.ts`.

- At boot it reads Nest's router: every route with its method and path, taken from the generated OpenAPI document (which is generated from the shared registry, lead 1).
- Each route must appear in a table `{ route, anonymous: 401 | 200, otherUser: 404 | 200, owner: 2xx }`. A route missing from the table **fails the test**, so new routes cannot skip authorisation.
- Fixtures: user A owns a private trip with 2 days and 3 stops plus a review; user B is a stranger.
- For each route, it fills the path params with A's ids, calls as anonymous and as B, and asserts the expected status. A mutation must also leave A's rows unchanged (re-read and compare).
- **Nested-IDOR rows:** B's `tripId` with A's `dayId`, and A's `tripId` with B's `stopId`. Both must return 404 even when B is signed in and owns one of the two ids.

### 4.5 Risky behaviours and their exact tests

| Risk | Test (name → assertion) | Level |
|---|---|---|
| Reorder stale write | `reorder_with_stale_version_returns_409`: two concurrent `PUT stop-order` with the same `version` via `Promise.all` on two agents → one 200 and one 409 `stale_version`; positions are still 0..n-1 with no gaps or duplicates | integration |
| Reorder with a non-permutation | `reorder_rejects_missing_or_foreign_stop_ids` → 409 `stale_order`; `…_duplicate_ids` → 422 | integration |
| Cross-day move | `move_between_days_bumps_both_versions_and_keeps_positions_dense`; `concurrent_moves_in_opposite_directions_do_not_deadlock` (A→B and B→A in parallel, 20 iterations, all finish within 5 s) | integration |
| Optimistic reorder rollback | `shows_new_order_immediately_and_restores_it_when_server_returns_409`: MSW delays 300 ms and then 409; assert the new order immediately, the old order plus an alert toast afterwards, and a refetch issued | web component |
| Undo | `undo_after_remove_restores_the_stop_at_its_position` | web component + e2e |
| Visibility | `private_trip_is_404_for_anonymous_and_other_users`; `link_trip_needs_the_token`; `reset_link_revokes_the_old_token`; `public_trip_payload_has_no_notes_or_dates` (assert the JSON keys are exactly the `PublicTripSchema` keys; walk the object for any key named `note`, `startDate`, `email`) | integration |
| Copy | `copy_of_public_trip_is_private_and_has_no_notes` | integration |
| Account deletion | `deleting_account_leaves_no_rows_owned_by_user` (`information_schema` sweep) | integration |
| Sessions | `logout_invalidates_cookie`; `password_change_kills_other_sessions`; `expired_session_is_401` (FixedClock advanced 31 days idle) | integration |
| CSRF | `post_without_origin_is_403`; `post_with_foreign_origin_is_403`; `sec_fetch_site_cross_site_is_403`; `form_encoded_body_is_415` | integration |
| Enumeration and timing | `login_unknown_email_and_wrong_password_return_identical_body` | integration |
| Rate limit | `sixth_login_in_a_minute_is_429_with_retry_after` (FixedClock) | integration |
| Provider timeout | `search_returns_503_geocoding_unavailable_when_provider_times_out` (fake `failWith: 'timeout'`) | integration |
| Route degradation | `route_falls_back_to_estimated_legs_when_routing_unavailable` (`quality: 'estimated'`, legs `estimated: true`, nothing cached) | integration |
| Breaker | `breaker_opens_after_5_failures_and_probes_after_30s` (injected clock) | API unit |
| Cache isolation | `fake_and_real_route_legs_never_share_cache_keys` | API unit |
| Unroutable snap | `stop_snapped_beyond_1km_on_foot_makes_leg_estimated` (saved OSRM Atlantic fixture) | API unit |
| Stored XSS | e2e `note_and_review_with_html_render_as_text` (no `dialog` event, text visible) | e2e |
| CSP | every e2e page: zero `securitypolicyviolation` events (fixture-level listener) | e2e |
| Problem parsing | `api_client_throws_typed_problem_on_422_and_maps_field_errors` | web unit |
| No retry of mutations | `mutation_is_not_retried_on_network_error` (the skeleton's `query-client.test.ts` covers queries) | web unit |

### 4.6 E2E journeys (critical only)

1. Sign up → empty state → create trip.
2. Search (fake) → "Add to Day 1" → toast with Undo → stop appears in the list and the URL `place` param is set.
3. Reorder by **tap** (Move down) → reload → order persisted.
4. Move a stop to Day 2 via the menu.
5. Day route: leg chips and totals visible. Then the provider-down variant: `page.route('**/api/v1/**/route', 503)` → estimates banner.
6. Write a note and reload.
7. Publish the trip → open its link in a fresh context (anonymous) → notes absent → "Copy to my trips" asks to sign in.
8. Review a place → appears in the community list with a count.
9. Theme override and language switch persist across a reload.
10. Delete the account → sign-in fails.

Locators by role and name (standards 1.3). No `waitForTimeout`. Map readiness through `data-map-state="ready"` and the idle hook [R maplibre 9].

### 4.7 CI (proposed, nothing pushed)

The owner adopts it later. A GitHub Actions workflow on Node 24.15.0 and pnpm 11.1.1 with these jobs:

1. `install` (`pnpm install --frozen-lockfile`).
2. `static`: `format:check`, `lint`, `typecheck`, the `openapi:check` drift check (regenerate the document and diff it against the committed `packages/shared/openapi.json`), the i18n parity check, and the printed SHORTCUT ledger (standards 1.2).
3. `test` with a `postgres:18` service on 5432 inside CI.
4. `build`.
5. `e2e` (fake providers, blank style, network lockdown, `retries: 0`; a flaky test gets quarantined with an owner, standards 1.3).
6. `pnpm audit --prod` (non-blocking).

Typical wall time: about 6 minutes.

## 5. Observability and operations

### 5.1 Logs

- **Stack:** `nestjs-pino` 5.3.2 + `pino` 10.4.0 + `pino-http` 11.0.0 (peers checked with `npm view` [V]; not installed or run yet). Use `pino-pretty` in development only, through the `transport` option when `NODE_ENV=development`.
- **Setup:** `LoggerModule.forRootAsync` in `apps/api/src/observability/`, and `app.useLogger(app.get(Logger))` in `main.ts` with `bufferLogs: true` so bootstrap logs are JSON too.
- **Request id:**
  - Accept an incoming `x-request-id` only if it matches `^[A-Za-z0-9-]{8,64}$` (Next forwards one from `apiServer()` and from the `proxy.ts` header); otherwise generate a UUIDv7.
  - Echo it as an `X-Request-Id` response header.
  - The web error state shows it as "Código: abc123…" (standards 2.11 "+ error code").
  - I do not add it to problem bodies: the lead allowed `code` as an extension, and I would not add more without asking.
- **Fields:** `reqId`, `route` (the template, e.g. `/api/v1/trips/:tripId`), `method`, `status`, `responseTime`, `userId` (opaque, fine), `provider`/`cacheHit`/`retry` on outbound events.
- **Levels:** `error` needs a human (unhandled exception, provider 403, failed migration); `warn` is handled (retry, breaker open, budget exhausted, 429 issued); `info` covers lifecycle and business events (sign-up, trip published, review created, account deleted).
- **Hygiene:** log once where the error is handled (the problem filter). Redaction as in 2.8.
- **Web server:** Next 16 `instrumentation.ts` with `onRequestError` (check the bundled docs before relying on it) writes one JSON line per server render error through a tiny `console.error(JSON.stringify(…))` adapter. The no-`console.log` rule allows `console.error` there only.

### 5.2 Error reporting

An `ErrorReporter` interface (`report(error, context)`) with a log-only default, called from the problem filter for 5xx and from the web `error.tsx` boundaries through a `POST /api/v1/client-errors` endpoint (rate-limited to 10/min per key, 4 kB body, logged at `warn`). Hook for later: `@sentry/nestjs` 11.14.0 accepts Nest 12 [V], and GlitchTip speaks the same protocol.

### 5.3 Metrics and traces

- **Now:** `responseTime` in the access log is enough to compute p95 per route from logs.
- **Later:** OpenTelemetry (standards 3.6).
- `// SHORTCUT(owner): no OpenTelemetry, latency only in access logs — ceiling: no traces across web→api→provider, no dashboards; upgrade: first production incident that logs cannot explain, or a second API instance`

### 5.4 Health, readiness and shutdown

The skeleton already has liveness, readiness and a 10 s shutdown deadline [R scaffold]. Add a `shuttingDown` flag set on SIGTERM: readiness then returns 503 at once, so a proxy stops routing before the drain. Providers are never pinged (lead 8). Next runs in standalone mode under `node server.js`, which handles SIGTERM itself (check at CP4).

### 5.5 Migrations, seed and reset

- **Ownership and naming:** one migration owner (section 6). Names follow `YYYYMMDDHHMMSS_<area>_<change>`. Generate with `prisma migrate dev --create-only`, read the SQL, hand-add what Prisma cannot express (the `DEFERRABLE` unique, `CHECK` constraints such as `rating BETWEEN 1 AND 5` and `position >= 0`, partial unique `one ideas day per trip`), then apply. Never edit a shipped migration. `SET lock_timeout = '5s'` at the top of DDL migrations once production exists.
- **Production:** `prisma migrate deploy` in a one-off `migrate` container before the app containers roll (standards 3.3), never on boot.
- **Seed** (`prisma/seed.ts`, idempotent upserts on fixed UUIDs): 4 demo users (`*.demo@heremita.invalid`, password from `SEED_DEMO_PASSWORD` or random and printed), 6 public trips across Lisboa, Rio and São Paulo with 5 to 9 stops each, and about 40 reviews. Everything is flagged `is_demo` and comes from the fake gazetteer (no network). The seed refuses to run when `NODE_ENV=production` unless `SEED_DEMO=1`.
- **Reset:** `pnpm db:reset` belongs to the owner. Prisma's AI-agent guard blocks it for agents [R scaffold], and agents must not bypass that guard. Agents never need it: tests use their own databases.

### 5.6 Deployment shape

**Now (one small VPS, Docker Compose):**

- `caddy:2`: TLS, HSTS, overwrites `X-Forwarded-For`; serves only the web.
- `web`: a Next standalone image (`output: 'standalone'`, `node:24-slim`, non-root, port 3100, internal).
- `api`: `node dist/main.js`, non-root, port 3101, not published to the host.
- `postgres:18` on a volume, not published.
- `migrate`: a one-off container (`prisma migrate deploy`).
- `backup`: a nightly `pg_dump -Fc`, 14-day retention, copied off-host. The restore is rehearsed once before launch.

**Environment variables:**

- **api:** `NODE_ENV`, `PORT`, `DATABASE_URL`, `WEB_ORIGIN`, `PUBLIC_SITE_URL`, `SESSION_COOKIE_NAME`, `GEOCODING_PROVIDER`, `ROUTING_PROVIDER`, `NOMINATIM_ENABLED`, `PHOTON_BASE_URL`, `NOMINATIM_BASE_URL`, `OSRM_BASE_URL`, `*_DAILY_BUDGET`, `LOG_LEVEL`, `TRUST_PROXY`.
- **web:** `API_URL`, `SESSION_COOKIE_NAME`, `NEXT_PUBLIC_MAP_STYLE_LIGHT`, `NEXT_PUBLIC_MAP_STYLE_DARK`, `NEXT_PUBLIC_MAP_STYLE_FALLBACK_*`.

All of them are validated at boot. A web env module is new and must fail the build on a missing value. Note the skeleton's own warning: `API_URL` is read at build time for rewrites.

**Later:** managed Postgres with PITR, OTel plus a collector, Sentry or GlitchTip, a shared rate-limit store before a second API instance, and a CDN for the static assets.

## 6. Delivery plan: one working tree, no branches

### 6.1 Phase 0: the foundation, by one engineer, before anyone else starts (about 1.5 days)

Exit criterion: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green, plus a walking-skeleton e2e that signs up and sees an empty "My trips".

1. **Contract:** every v1 request and response schema in `packages/shared/src/<area>.ts` (auth, me, trips, days, stops, places, routes, reviews, public-trips, reports, pagination, limits, problem codes enum). Implementations may be stubs, but the shapes are final. Also `packages/shared/src/openapi/registry.ts`, with the generator script `pnpm openapi:generate` writing `packages/shared/openapi.json` (zod 4.6.7 core supports `toJSONSchema` with target `draft-2020-12`, the dialect OpenAPI 3.1 uses [V]; wrap it in `zod-openapi` 6.0.2, peer `zod ^4` [V], or hand-assemble the paths object around `z.toJSONSchema`: the contract owner picks and records the choice).
2. **Data model:** the whole v1 Prisma schema as a **folder** `apps/api/prisma/schema/` with one file per area (Prisma 7 config `schema` accepts "a folder that shall be recursively searched for *.prisma files" [V]). Then a single migration `…_v1_model` with the hand-written constraints. Tables: `users`, `sessions`, `trips`, `days`, `stops`, `places`, `reviews`, `reports`, `provider_cache`.
3. **API primitives:** `ZodPipe`, a problem mapping with codes, `SessionMiddleware`, `AuthGuard` + `@Public()`, `CsrfGuard`, `TripAccess`, throttler config, the cursor codec, `Clock`, the outbound client skeleton, logger and request id, helmet. **Every Nest module registered in `app.module.ts`** with empty controllers.
4. **Web primitives:**
   - `apiClient` (browser) and `apiServer` (RSC), which parse problems with the shared schema;
   - a `queryKeys` factory;
   - `src/lib/routes.ts` with **all v1 routes** as typed builders;
   - the app shell and navigation with all entries;
   - `tokens.css` (light, dark, `[data-theme]` override);
   - `shared/components/` (Button, FieldError, TextField, States, Toast region, Dialog on native `<dialog>`);
   - i18n loader, with message namespaces pre-created per feature (`messages/{en,pt-BR}/{common,auth,trips,itinerary,map,search,routes,community,account}.json`);
   - `proxy.ts` with the CSP.
5. **Test harness:** section 4.2, plus the authz matrix file listing every route as `todo`. A missing row fails, so stub routes must be listed from the start.
6. **All v1 dependencies installed at once**, each checked for React 19 and Nest 12 peers and for pnpm's 24 h `minimumReleaseAge`. msw 3.0.7 was published today, so pnpm would refuse it; pin 3.0.6 or accept whatever pnpm resolves.
   - api: `nestjs-pino`, `pino`, `pino-http`, `pino-pretty` (dev), `@nestjs/throttler`, `helmet`, `@node-rs/argon2`, `undici` (dev).
   - web: `react-hook-form`, `@hookform/resolvers`, `nuqs` 2.10.3 (peer next ≥ 14.2 [V]), `@dnd-kit/react` 0.5.3 (peer react ^19 [V], still 0.x, so pin it exactly), the bottom-sheet package the UX lead picks, `msw`, `@testing-library/user-event`, `@types/geojson`.

### 6.2 Workstreams and exclusive ownership

| WS | Owns exclusively (write access) |
|---|---|
| **F, foundation and integrator** (after phase 0: hot-spot owner) | `packages/shared/src/{index,problem,pagination,limits}.ts`, `packages/shared/src/openapi/`, `apps/api/src/{app.module,app.setup,main}.ts`, `apps/api/src/{http,observability,config,common}/`, `apps/api/prisma/` (schema folder, **all migrations**, seed), root configs, `pnpm-lock.yaml` and every `package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/proxy.ts`, `apps/web/src/lib/{routes,api}/`, `apps/web/src/styles/tokens.css`, `apps/web/src/shared/`, `apps/web/messages/*/common.json`, `apps/web/src/i18n/` |
| **A, auth and account** | `packages/shared/src/{auth,me}.ts`, `apps/api/src/{auth,users,sessions}/`, `apps/web/src/features/auth/`, `apps/web/src/app/(auth)/`, `apps/web/src/app/account/`, `messages/*/{auth,account}.json` |
| **T, trips and itinerary** | `packages/shared/src/{trips,days,stops}.ts`, `apps/api/src/{trips,itinerary}/`, `apps/web/src/features/{trips,itinerary}/`, `apps/web/src/app/trips/` (except the map leaf), `messages/*/{trips,itinerary}.json` |
| **M, map, places, search** | `packages/shared/src/places.ts`, `apps/api/src/{places,providers/geocoding,providers/fake/gazetteer.ts}`, `apps/web/src/features/{map,search}/`, `messages/*/{map,search}.json` |
| **R, routes** | `packages/shared/src/routes.ts`, `apps/api/src/{routing,providers/routing,providers/http}/`, `apps/web/src/features/routes/`, `messages/*/routes.json` |
| **C, community** | `packages/shared/src/{reviews,public-trips,reports}.ts`, `apps/api/src/{reviews,public-trips,reports,admin}/`, `apps/web/src/features/community/`, `apps/web/src/app/{explore,s,p,admin}/`, `messages/*/community.json` |
| **Q, quality** | `apps/web/e2e/`, `apps/web/playwright.config.ts`, `apps/api/test/support/`, `apps/api/test/authz-matrix.test.ts`, `.github/`, `docs/` |

- Each workstream owns its tests next to its code (`apps/api/test/<area>/`).
- Features never import each other (standards 2.1). The planner page composes `features/itinerary`, `features/map` and `features/routes` in `apps/web/src/app/trips/[tripId]/page.tsx`, which T owns. The leaves come from the other features.
- Cross-feature data flows through URL params (`day`, `place`, `mode`, lead 6) and through query keys from `lib/api/query-keys.ts` (F), never through imports between features.

### 6.3 Hot spots and the rule for each

- **Dependencies and the lockfile:** only F runs `pnpm add`, `pnpm install` or `pnpm update`, serialised. A request comes in as "package, version, why, peers checked". Two concurrent installs in one tree corrupt `node_modules` and the lockfile. New build scripts need an `allowBuilds` entry.
- **Prisma schema and migrations:** the schema folder lets each area **propose** edits in its own `.prisma` file, but only F runs `migrate dev --create-only` and applies the result, one at a time, announcing it. Everyone else's DB comes from tests (per-file clones), so their work is not blocked. Nobody runs `prisma migrate dev` against the shared dev DB except F.
- **i18n messages:** one file per namespace per locale, owned as in the table. `common.json` belongs to F. The loader imports a fixed list created in phase 0, so adding a namespace is an F change. Key parity is enforced by the type and by the test.
- **Route constants and navigation:** complete in phase 0. A new route is an F change (rare).
- **Design tokens and global CSS:** `tokens.css` and `globals.css` belong to F. Features consume tokens only (standards 2.10). A new token is a one-line request to F.
- **`app.module.ts`, shared `index.ts` and OpenAPI registry index:** pre-populated in phase 0 with every module and `export *`, so feature work never touches them.
- **Running servers:** one shared `pnpm dev` on 3100 and 3101, started by F. Nobody kills a process they did not start. E2E runs on 3110 and 3111 (Q only). Other engineers verify through tests, or ask F before restarting anything.

### 6.4 Integration checkpoints

- **CP1 (end of phase 0):** contract and model frozen; all green.
- **CP2 (walking skeleton):** journeys 1 and 2 e2e green with fakes. Scope freeze.
- **CP3 (feature complete with fakes):** all 10 journeys plus the authz matrix with no `todo` rows; bundle check.
- **CP4 (reality check):** real providers in dev (one search, one route per mode by hand), manual iPhone and Android pass, CSP violation sweep, security checklist (section 2 as a checklist with a test name per control).
- **CP5:** release candidate. Fresh clone: `env:init → db:up → db:migrate → db:seed → dev` works, and the restore rehearsal is done.

At each checkpoint, F runs the full suite from a clean install and records the literal outputs.

### 6.5 Definition of done for a feature

1. The shared schema exists and is used by the API (`ZodPipe`) and by the form (RHF resolver).
2. The OpenAPI document is regenerated.
3. API tests cover 4.3, the authz matrix row is filled, and the risky-behaviour tests from 4.5 that apply are written.
4. Web: loading, empty, error and success states. Tap alternatives for every drag. 44 px targets. Labels and the error wiring of lead 11. Keyboard path. Both locales complete. Light and dark checked.
5. `pnpm typecheck lint test build` green. The e2e journey that touches it is green. No `console.log`. Any shortcut is marked with `SHORTCUT(owner)`.
6. The owner of each hot file touched has applied the change. Nobody edited a file outside their ownership.
7. The final report says what was run, with literal results, and what was not verified.

## 7. Cut list and worthwhile extras

### 7.1 Not in v1

- **Guest planning with a local draft.** The UX research asks for it, but it is a second persistence model, with its own merge-on-sign-up, that Safari may evict after 7 days [R ux 1.6]. It also opens the provider proxy to anonymous traffic. Sign-up without e-mail verification is already cheap. Revisit after launch with data.
- **Drag between days.** Reorder within a day by handle is in; moving between days uses the "Move to day" menu (NN/g: menus are less error-prone on mobile [R ux 1.3]).
- **Route optimisation as an automatic apply.** Keep it only as a suggestion with revert, with real before and after times [R providers 4.5]. It is cuttable to v1.1 if CP3 slips.
- **Offline mode, PWA install, export to GPX or KML.** These are out of scope (offline-first). Keep print CSS instead (cheap).
- **Blocking users, likes and follows, comments on reviews, profiles with bios and avatars.** Social surface means moderation load. v1 keeps reports plus admin hide.
- **Markdown or links in notes and reviews.** Rich text means XSS surface and a sanitiser dependency.
- **Collaborators and per-trip roles.** Real-time collaboration is out of scope, and roles multiply the authz matrix.
- **Nominatim on by default.** Policy-sensitive, so the owner opts in [R providers 1.4].
- **Trusted Types, CSP reporting endpoint, OTel, error tracker, multi-instance.** All "later", marked with `SHORTCUT`.
- **Opening-hours badges.** OSM coverage is thin [R ux 1.2].

### 7.2 Beyond the brief, worth the cost

1. **The authz matrix test** (4.4): about a day of work, and it closes the most likely security bug for good.
2. **Undo on every itinerary mutation:** the research's top complaint ("no undo") [R ux 1.3], cheap with inverse mutations.
3. **Per-leg "Directions" hand-off** to Google and Apple Maps URLs (no keys) [R ux 1.4]. It also covers transit, which we do not compute.
4. **A read-only `link` share** for a trusted contact: a safety feature for solo travellers [R ux 1.7], and it reuses the public projection.
5. **`GET /api/v1/me/export`** (JSON of all the user's data): about 50 lines, pays the GDPR access right and the "portable trip" principle.
6. **Print stylesheet** for the day view.

## 8. Facts verified for this proposal, and what is not

**Checked today:**

- `npm view` peers and publish dates:
  - `nestjs-pino@5.3.2` (Nest `^11.0.8 || ^12.0.2`, published 2026-11-17);
  - `@nestjs/throttler@6.8.0` (Nest ≤ 12);
  - `nestjs-zod@5.6.0` (Nest 10 and 11 only);
  - `@sentry/nestjs@11.14.0` (Nest 12);
  - `@nestjs/terminus@12.2.0`;
  - `zod-openapi@6.0.2` (zod ^4);
  - `@dnd-kit/react@0.5.3` (React ^19);
  - `nuqs@2.10.3`;
  - `msw@3.0.7` (published 2026-11-18 01:16 UTC, younger than the 24 h `minimumReleaseAge`);
  - `@node-rs/argon2@2.2.2` (optional prebuilt binaries, no install script) against `argon2@0.45.2` (`install: node-gyp-build`).
- Installed `zod@4.6.7` `toJSONSchema` targets (`draft-2020-12`, `openapi-3.0`).
- `@prisma/config@7.10.1` accepts a schema folder.
- The Next 16.4.6 bundled CSP guide: nonce, `proxy.ts`, PPR incompatibility.
- Next's rewrite proxy uses `changeOrigin: true`, and the base server sets `x-forwarded-for ??=`.
- OpenFreeMap positron and dark styles, the TileJSON and the VersaTiles style: all hosts listed in 2.10.

**Not verified (not run):**

- the CSP in a browser, in particular `worker-src 'self'` with `strict-dynamic` for the maplibre module worker, and whether Turbopack dev styles need `'unsafe-inline'`;
- that `cacheComponents: false` leaves the skeleton building;
- undici `MockAgent` intercepting Node 24's built-in `fetch`;
- Express 5 `path-to-regexp` and the `:action` suffix (reasoned from its syntax, not run);
- Next `instrumentation.ts` `onRequestError` and `output: 'standalone'` SIGTERM handling in 16.4;
- Playwright WebKit running MapLibre;
- Caddy overwriting `X-Forwarded-For` by default.

None of the libraries proposed above were installed or exercised.
