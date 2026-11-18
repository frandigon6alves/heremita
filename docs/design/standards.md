# Heremita engineering rulebook

Source: the owner's skill pack, `/Users/frangoncalves/Desktop/DEV/skill-pack` (commit `9ec00b4`, 2026-10-23). `README.md`, `AGENTS.md` and all 50 files under `content/` were read in full.

- **Tags.** `x` means `/Users/frangoncalves/Desktop/DEV/skill-pack/content/skills/x/SKILL.md`; `x` *(rule)* means `/Users/frangoncalves/Desktop/DEV/skill-pack/content/rules/x.md`. A heading's tag is the source of every bullet under it unless a bullet names another.
- **Delivery.** The 32 skills are installed and load by name. The rule files are not installed for Claude Code on this machine (no `~/.claude/CLAUDE.md`), so sections 1.1, 1.2, 2.12, 3.0, 4.1 and 4.2 reach engineers only through this document.
- **`→ Heremita:`** applies a cited rule to this product; it is not playbook text.

## 1. Code quality

### 1.1 Clean code — `cq-clean-code` *(rule)*
- Before writing, stop at the first rung that holds: not needed (YAGNI) → standard library → native platform feature → installed dependency → one line → the minimum code that works.
- Never skimp on input validation at trust boundaries, error handling that prevents data loss, security, accessibility, or anything explicitly requested.
- Names explain intent; only `i`/`j`/`k`, `n`, `err`, `ctx` may be abbreviated. One function, one job. Three similar lines beat a premature helper.
- Handle errors only at system boundaries (user input, external APIs, file I/O).
- Fix the bug only: no refactor around it unless it blocks the fix, no unrelated clean-up in the same commit.
- Ban, comments: comments that say WHAT; references to the task, PR or caller; docstrings on obvious functions; commented-out code (`git-workflow` *(rule)*).
- Ban, code: defensive null checks for values that cannot be null; feature flags; backwards-compat shims; `_old`/`_v2` variants; abstractions for hypothetical needs; nested ternaries; optional chaining deeper than two levels; nested `if` where an early `return` flattens; `console.log`; a magic number used more than once.
- `TODO` only as `TODO(owner): description — YYYY-MM-DD`.

### 1.2 Deliberate shortcuts — `cq-clean-code` *(rule)*, `cq-simplify-debt`
- Mark each one: `SHORTCUT(owner): <what's simplified> — ceiling: <the limit>; upgrade: <the trigger to revisit>`. Ceiling and trigger are both mandatory; without a ceiling it is a bug.
- Ledger scan: `grep -rnE '(#|//) ?SHORTCUT' . --exclude-dir={node_modules,.git,dist,build}`. Measured: it matches only `//` and `#` line comments (not `/* */`, JSX `{/* */}` or SQL `--`) and does not skip `.next`. Write markers as `//` or `#` lines.

### 1.3 Testing — `cq-testing`
- Many unit tests, some integration tests (real modules, DB, HTTP layer), few e2e tests (critical journeys). A regression test goes at the lowest level that catches the bug.
- Test behaviour through the public interface; assert outcomes, never which internals were called.
- Arrange-Act-Assert separated by blank lines. One behaviour per test, named after it (`rejects_expired_token`).
- Unit tests use no real time, network, filesystem order or randomness: inject a clock (no `now()` inside logic), seed RNGs.
- Fakes (in-memory repository) over mocks. Mock only boundaries you do not own, never your own classes.
- Each test creates and cleans its own data.
- Cover empty/one/many, boundaries (0, -1, max), null, invalid input, and error paths (timeout, 4xx/5xx, partial failure).
- Bug fixes and features: red (fails for the right reason) → green → refactor.
- Playwright: locate by role and accessible name, then label, then text; `data-testid` only without a semantic hook; CSS/XPath last. Web-first assertions; never `waitForTimeout` or `expect(await el.isVisible())`. Seed data through API or fixtures; reuse auth with `storageState`.
- A flaky test is a bug: loop to reproduce, quarantine with ticket and owner, fix the cause. Never retry to green.
- Coverage is a signal, not a target.

### 1.4 Debugging — `cq-debug`
- Reproduce first; quote the error exactly; rank 2-4 hypotheses, cheapest check first; change one thing per experiment; bisect (`git bisect run`, halve the input).
- Fix where the bad state originates, add a regression test that fails before the fix, remove debug output. After 3 failed hypotheses, stop and re-verify assumptions.

### 1.5 Review findings — `git-pr-review`
- A finding needs a concrete "breaks when" scenario. Drop pre-existing issues, linter-catchable items, speculation and taste. At most 3 nits.

## 2. Frontend

### 2.1 Components and file layout — `fe-react-component`
- Search before creating. Reuse when data flow and props fit; if that means bending the API or threading flags, copy and let the two diverge.
- A one-off lives next to its only caller; promote to shared on the second or third real use.
- `shared/components` holds generic, presentational components with no domain types; `features/<x>/components` holds domain components. Features import shared, never the reverse, and never each other.
- Co-locate a component with its styles and its own hooks. One hook per file, `use` prefix. Extract a hook when the same stateful logic appears in two components.
- One component, one job. Composition (`children`, slots) over configuration props. Handlers and derived values are named consts above `return`.
- Props: one `variant` union instead of booleans; discriminated unions for states; no blind `{...props}` spread onto a DOM node.
- Function components only, pure, hooks at top level. `key` is a stable data id, never an index or random value.
- React 19: `ref` is a prop (no `forwardRef`); `<Context value>`; `use()`.
- Server Components by default. `'use client'` only on the leaf that needs interactivity, state, effects or browser APIs, as deep in the tree as possible.
- → Heremita: these folders sit inside `apps/web`; `packages/shared` is the API contract, not the component library.

### 2.2 Effects and derived state — `fe-react-effects`
- Derivable from props or state → compute in render; never mirror props into state. User action → event handler. Sync with an external system → `useEffect`.
- Reset with `key={id}`; store an id and derive the object; notify the parent in the same handler; no chained `setState` effects.
- Effects are for subscriptions, analytics on mount, non-React widgets and a bare fetch (with the `ignore` flag). Always return cleanup. External stores use `useSyncExternalStore`.
- React Compiler on: hand-write no `useMemo`/`useCallback`/`memo`. Off: only to fix a re-render the Profiler shows.
- → Heremita: MapLibre is a non-React widget; create it in an effect, destroy it in the cleanup.

### 2.3 Data fetching — `fe-react-data-fetching`
- TanStack Query for all API data. A raw `useEffect` fetch only for a one-off, uncached, unshared load.
- Query keys are stable, serialisable and contain every `queryFn` input; share key + fn through `queryOptions()`.
- `useQuery` reads, `useMutation` writes, then `invalidateQueries`. Never manual `setState`; never copy server data into state or a store.
- Render pending, error and success explicitly; no `data!` before the pending guard. With Suspense: `useSuspenseQuery` plus an error boundary.
- Set `staleTime`. v5: `gcTime`; no `onSuccess`/`onError` on `useQuery`.
- Server Components fetch directly; TanStack Query adds client cache and mutations.
- Optimistic UI: render `mutation.variables` while pending, or `onMutate` snapshot with rollback in `onError` and invalidation in `onSettled`.
- In the `queryFn`: check `res.ok` and throw; parse the error body with its own zod schema; validate the envelope, then the payload; derive types with `z.infer`. Parsing may be skipped for internal end-to-end-typed endpoints.

### 2.4 Forms — `fe-react-forms`
- React Hook Form + zod through `@hookform/resolvers` for anything beyond one trivial field. One schema yields validation and types (`z.infer`); the server re-validates with the same schema.
- Cross-field rules go in `refine`/`superRefine`, not effects.
- One error per field: `aria-invalid` + `role="alert"`. Disable submit while `isSubmitting`; surface submit failures.
- `Controller` only for inputs that cannot be uncontrolled.
- zod v4 syntax (`z.email()`, `error`). No `z.coerce.*` with RHF: use `valueAsNumber`, or type input and output separately.
- React 19 form Actions for server actions and simple forms; RHF + zod for rich client validation.
- → Heremita: input schemas in `packages/shared` validate both the form and the API request.

### 2.5 State — `fe-react-state-management`
- Classify: derived (not state), server (query cache), local UI (`useState`/`useReducer` close to its use), shared client.
- Shared client state takes the first rung that holds: lift to the common parent → URL (`useSearchParams` or `nuqs`) for filters, sort, pagination, selected id → Context for low-frequency values (theme, locale, auth user) → Zustand with slice selectors (`useShallow` in v5) → Jotai → Redux Toolkit.
- Ban: a store added "to be safe"; URL state mirrored into `useState`; high-frequency state in Context; legacy Redux.

### 2.6 Performance — `fe-react-performance`
- Measure with the React DevTools Profiler before optimising; confirm the bottleneck is render, not network.
- Fix in order: state closer to its use → no fresh objects or functions passed to memoised children → stable keys → memo only where the Profiler points.
- Bundle: route-based code splitting (`React.lazy` + `Suspense`), a bundle analyser, lazy-loaded heavy leaves (editors, charts, maps).

### 2.7 Accessibility — `fe-a11y`
- Real elements (`<button>`, `<a href>`, `<label>`, headings), never `<div onClick>`. One `<h1>`, no skipped levels. ARIA only when no native element fits.
- Every input has a programmatic label (a placeholder is not one); icon-only buttons have an accessible name; meaningful `alt`, decorative `alt=""`.
- Full keyboard operation with a visible focus ring; no `outline: none` without a replacement; no `tabIndex` above 0.
- Dialogs: native `<dialog>` + `showModal()`.
- Sticky bars never cover the focused element (`scroll-padding`, WCAG 2.4.11). Every drag has a single-pointer alternative (2.5.7).
- Announce toasts, async results and errors through `aria-live="polite"`; tie field errors with `aria-describedby` + `aria-invalid`.
- Never block paste or password managers (3.3.8); never re-ask for data already given (3.3.7).
- Contrast: text ≥ 4.5:1 (large ≥ 3:1); control boundaries, meaningful icons and focus indicators ≥ 3:1; never colour alone. Honour `prefers-reduced-motion`.
- → Heremita: reordering stops and placing or moving a pin each need a non-drag path.

### 2.8 Responsive layout — `fe-responsive`
- One adaptive layout, mobile-first: base styles for the smallest screen, enhanced with `min-width` media or container queries. Never desktop-first.
- Breakpoints where the content breaks (480/768/1024/1280/1536px are references). Test phone portrait, tablet, desktop and one width in between.
- Fluid: Grid `repeat(auto-fit, minmax(min, 1fr))`, flexbox, `gap`, `clamp()` type, lines ≤ 65ch; no fixed widths.
- `@container` for reusable components; viewport queries for page layout only.
- Images: `max-width: 100%`, `aspect-ratio`, `srcset`/`sizes`. Wide content scrolls in its own `overflow-x: auto` box; the body never scrolls horizontally.

### 2.9 Touch — `fe-touch`
- Targets 44×44 CSS px (floor 24×24); the hit area is padded even when the glyph is smaller; ≥ 8px between targets.
- Phones: primary actions in the bottom third, destructive ones away from it. Tablets: reachable in both orientations.
- Nothing depends on `:hover` or right-click; swipe and long-press are shortcuts only. Every control shows a pressed state.
- Viewport meta `width=device-width, initial-scale=1`; never disable zoom; `env(safe-area-inset-*)`; inputs ≥ 16px font.
- → Heremita: long-press-to-add on the map needs a visible button twin; marker details open on tap.

### 2.10 UI foundations — `fe-ui-foundations`
- Spacing only from 4, 8, 12, 16, 24, 32, 48, 64; internal padding ≤ surrounding margin.
- A fixed type scale (example 12/14/16/20/24/32/48), 16px body, line-height ~1.5 for body and ~1.1-1.25 for headings.
- Semantic tokens named by role (`--color-bg`, `--color-danger`, `--space-4`, `--radius-md`), one source of truth. Components never hard-code a colour, spacing or size (also `fe-react-component`).
- A small radius set (example 4/8/16/full) and a defined shadow scale.
- Dark mode from the start by swapping token values, never by forking components: near-black surfaces, dimmed text, contrast re-checked. Respect `prefers-color-scheme` and allow a user override.

### 2.11 UI states — `fe-ui-states`
- Every data screen ships loading, empty, error and success.
- Loading: a skeleton matching the content's shape for lists, cards and tables, shown after ~200-300ms. Spinner only for short in-place waits. Never skeletonise buttons, toasts, menus or modals.
- Empty: say why and offer the next action; "no data yet" and "no results" get different copy.
- Error: plain message + Retry (+ error code), scoped to the failed region; never stack traces.
- Reusable state components, not per-screen ternaries. Reserve space so states do not shift layout. Announce changes through a live region.

### 2.12 Visual identity — `fe-aesthetic` *(rule)*
- Ban: reflexive Inter, purple or violet gradient, dead-centred card, safe greys everywhere.
- Commit to an intentional typeface, palette and spacing rhythm. Process: brainstorm 2-3 token sets → critique against those tells → commit to one → build.
- Hierarchy, real states, responsiveness and touch targets are baseline, not polish.
- The rule also points to an `artifact-design` skill when the tool provides one.

### 2.13 Component tests — `fe-react-testing`
- React Testing Library on Vitest or Jest, `@testing-library/user-event` (`userEvent.setup()`, awaited calls), `@testing-library/jest-dom` matchers. Never `fireEvent`.
- Query through `screen`: `getByRole` → `getByLabelText` → `getByText` → `getByTestId` (last resort). `findBy*` for async; no sleeps.
- Assert what the user sees, never internal state; no whole-component snapshots.
- Mock the network at the boundary (for example MSW), not the component's own functions.
- Cover empty, loading, error and boundary inputs.

## 3. Backend

### 3.0 Baseline — `be-baseline` *(rule)*
Object-level authorisation on every request that takes an ID. Parameterised queries only. No secrets in code or logs. Explicit timeout on every outbound call. Config from env, validated at startup, fail fast. Structured logs to stdout. Paginate every list endpoint. API changes additive-only within a version. No network calls inside DB transactions; side effects after commit.

### 3.1 API design — `be-api-design`
- Contract first: the OpenAPI 3.1 operation before code, kept current.
- Plural-noun paths without verbs (`/orders/{id}/items`); PUT replaces, PATCH is partial, DELETE is idempotent; a non-CRUD action is `POST /orders/{id}:cancel`.
- Separate input and output schemas; allowlist fields so clients cannot set `id`, `role` or `owner_id`; never bind the body to the DB model. The handler parses and returns; logic lives in a service.
- Status: 201 + `Location` on create; 204 without body; 400 malformed; 422 well-formed but invalid; 401 unauthenticated; 403 forbidden; 404 also for other users' objects (never 403); 409 conflict; 429 + `Retry-After`. Never 200 with an error body.
- Errors: RFC 9457 `application/problem+json` (`type`, `title`, `status`, `detail`, `instance`, `errors[{ pointer, detail }]`); no stack traces or SQL.
- Lists: opaque cursor; request `page_size` (server-capped), response `next_page_token`; offset only for small admin lists.
- A non-idempotent POST that must be retry-safe takes `Idempotency-Key` (same key with another payload → 422; still in flight → 409; expire ~24h).
- A breaking change is a new major (`/v2`); never remove or rename a field within a version.
- ISO-8601 UTC timestamps; string IDs; one casing convention.
- Test happy path, validation, authz denial, not found, conflict.
- → Heremita: the problem shape is one zod schema in `packages/shared`, which the client parses (2.3).

### 3.2 Data access — `be-data-access`
- Load exactly what the request needs in a fixed number of queries: no query in a loop (N+1), no `SELECT *` on wide or hot tables.
- Invariants live in the schema (`UNIQUE`, `FOREIGN KEY`, `NOT NULL`, `CHECK`).
- Read-then-write needs a strategy: one atomic statement when it fits; `FOR UPDATE` for hot contention; a `version` column with retry for user-edit flows. Lock rows in a consistent order. Upsert with `ON CONFLICT`.
- Transactions open late and close early; side effects after commit or through an outbox.
- Verify indexes with `EXPLAIN (ANALYZE, BUFFERS)`; index foreign keys and every filter or sort column; composite order matches the query.
- Keyset pagination on `(created_at, id)`; no deep `OFFSET`. Bulk work in batches of 500-5000 rows.
- `EXISTS` instead of `count(*)`; `timestamptz`; no float money.
- Test with realistic row counts and two concurrent sessions.
- → Heremita: reordering a day's stops is read-modify-write; choose its strategy explicitly.

### 3.3 Migrations — `be-migrations`
- Generate with the project's tool and read the diff (a rename can appear as drop + add). One logical change per migration; never edit a shipped one.
- Every migration works with the previous app version: unsafe changes go expand → backfill → contract in separate deploys.
- Backfills are a separate batched job, idempotent and resumable. `SET lock_timeout = '5s'` on DDL.
- Run as a one-off release step, never on boot of every replica.
- The skill holds the Postgres recipes: safe NOT NULL, `CREATE INDEX CONCURRENTLY`, `UNIQUE` from an index, FK `NOT VALID` then `VALIDATE`.
- Test on production-like data; prefer roll-forward; back up before dropping. Deliver a numbered plan: migration, job, release, each with its deploy.

### 3.4 Security — `be-security`
- Walk the OWASP API Top 10 (2023) per endpoint; add a test proving each denial; record accepted risks with an owner.
- Scope queries by caller (`WHERE id=? AND owner_id=?`), 404 on a miss. Privileged routes deny by default and check the role in a central policy.
- Rate limit and max body size on every public endpoint; cap page and upload size; brute-force limits on login and reset; per-account and per-IP limits on signup.
- Passwords: Argon2id (m=19 MiB, t=2, p=1), or scrypt, or bcrypt cost ≥ 10 rejecting input over 72 bytes.
- Prefer opaque server-side sessions for a first-party web app. If JWT: pin the algorithm, reject `none`, verify `iss`/`aud`/`exp`, rotate refresh tokens.
- Secrets from env or a secret manager. CORS: explicit origin allowlist, never `*` with credentials. Debug and verbose errors off, security headers set, TLS only.
- A server-side fetch of a user-supplied URL follows the skill's SSRF rule (allowlist, resolved-IP block, no redirects).
- Validate third-party responses against a schema.

### 3.5 Reliability — `be-reliability`
- Connect and total timeout on every outbound call; propagate the caller's deadline.
- Retry only idempotent or keyed requests, only on 5xx, 429, timeout or reset, at one layer only, with capped exponential backoff and full jitter; honour `Retry-After`; log each retry.
- A flaky dependency gets a circuit breaker and a fallback (cached, degraded or fast error).
- Jobs: IDs in the payload, idempotent consumer, enqueue after commit, max attempts then a dead-letter queue.
- SIGTERM: stop accepting work, drain within a deadline, close pools, exit 0.
- Liveness checks nothing external; readiness checks only local needs (started, pool usable), never downstream services.
- Test timeout, 5xx, partial failure and duplicate delivery.
- → Heremita: routing and geocoding lookups are the outbound calls these rules govern.

### 3.6 Observability — `be-observability`
- JSON logs on stdout, one event per line, with `trace_id`/`span_id` or a request ID; never log files.
- `error` needs a human; `warn` is handled; `info` is a business or lifecycle event; `debug` is off in production.
- Log once, where the error is handled (no log-and-rethrow); constant message, data in fields.
- Never log secrets, tokens, raw PII or request bodies; redact at the logger (field denylist plus `Authorization` and `Cookie`).
- OpenTelemetry for traces and metrics: initialised once at startup, auto-instrumentation, semantic-convention names, W3C `traceparent` propagated.
- Per endpoint: rate, errors, duration histogram (p95/p99, never averages); labels bounded to route template, method, status class.
- Telemetry never breaks a request. Alert on user-visible symptoms, not causes.

## 4. Git and pull requests

### 4.1 Commits — `git-conventional-commits` *(rule)*, `git-commit`
- `type(scope): subject`; types `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `revert`; scope optional, lowercase; `!` marks a breaking change.
- Subject: imperative, ≤ 50 characters preferred, 72 maximum, no period. Body: bullets only, WHY not WHAT, wrapped at 72; mandatory for breaking changes, security fixes, data migrations and reverts.
- Ticket ID inline when one exists: `fix:PROJ-456 handle null`.
- Atomic commits: one logical change that builds and passes tests alone; read the full diff, then stage by path; tests and linters pass first.
- Pushed commits are immutable: add a commit or `git revert`; amend only unpushed ones.
- Ban: first person; narration; filler subjects ("WIP", "Fix bug"); AI attribution in subject, body or trailers; committing to `main`; `--no-verify`; staging secrets, build output or debug output.
- Repository conventions override these defaults; Heremita had none when checked.

### 4.2 Branches — `git-workflow` *(rule)*
- `feat/short-description`, `fix/what-is-broken`, `chore/what-task`, `release/v1.2.3`. Squash-merge feature branches; merge-commit release branches. Never force-push `main`; elsewhere only `--force-with-lease`.

### 4.3 Pull requests and releases — `git-pull-request`, `git-changelog`
- Title in commit format, under 72 characters; describe the whole diff. Fallback body: `## What`, `## Why`, `## How` (only if non-obvious), `## Test`.
- Release: an annotated tag carrying a changelog of `feat`/`fix`/`perf` commits; never push a tag without confirmation.

## 5. Named, silent, not applicable

- **Named libraries.** TanStack Query v5; React Hook Form + zod v4 + `@hookform/resolvers`; `useSearchParams` or `nuqs`, Zustand v5, Jotai, Redux Toolkit; React Testing Library, user-event, jest-dom, Vitest or Jest, MSW; Playwright; React DevTools Profiler, `why-did-you-render`, optional React Compiler; OpenTelemetry; Argon2id, scrypt or bcrypt; OpenAPI 3.1; RFC 9457.
- **Styling method: unspecified.** No styling library is named. Required: role-named tokens (the examples are CSS custom properties), the scales of 2.10, co-located styles, plain CSS features (`clamp()`, Grid, `@container`).
- **Silent** (searched, zero mentions): NestJS; Prisma or any ORM except Doctrine; Tailwind, CSS Modules, CSS-in-JS; MapLibre or any map library; geolocation; i18n; XSS, CSRF, sanitising user-generated text, CSP; ESLint, Prettier, TypeScript strictness; monorepo or pnpm layout; Docker; offline or PWA; Web Vitals budgets; database key type; Storybook. Also silent on file-name casing, on a list-response envelope, and on how a Server Component authenticates to a separate API.
- **Not applicable.** `be-symfony`; every "React Native deltas" block; MySQL notes in `be-migrations`; `flow-*` rules, hooks and commands (agent output style and model routing); `flow-find-skills` and the naming rules in `AGENTS.md` (they govern the pack itself). The `sp-*` agents and `/flow-*` commands are not installed here.
- **Versions.** The API notes target React 19, TanStack Query v5, zod v4 and Zustand v5. Nothing covers Next 16, Nest 12, Prisma 7, Vitest 5 or MapLibre 6; check those against the installed packages.

## 6. Conflicts and tensions

1. **AI attribution.** `git-conventional-commits` bans it everywhere; `git-commit` says to follow repo and harness instructions, and the harness default adds a `Co-Authored-By` trailer (that reminder itself yields to the owner's instructions).
2. **Pushed history.** `git-commit`: pushed commits are immutable. `git-workflow`: force-push feature branches with `--force-with-lease`.
3. **Contract format.** `be-api-design` wants OpenAPI 3.1 first; Heremita's fixed contract is zod in `packages/shared`.
4. **Casing.** One convention is required, yet the playbook's own names mix `page_size`, `next_page_token`, `owner_id` with `updatedAt`.
5. **Response validation.** `fe-react-data-fetching` says validate the entire response, then allows skipping internal end-to-end-typed endpoints.
6. **Field errors.** `fe-react-forms`: `aria-invalid` + `role="alert"`. `fe-a11y`: `aria-describedby` + `aria-invalid`, announced politely.
7. **Type sizes.** `fe-ui-foundations`: fixed scale. `fe-responsive`: fluid `clamp()`.
8. **Reuse threshold.** "Three similar lines beat a helper" and "promote on the second or third use" against "two near-identical components are a bug", "a hook at two uses", and `fe-ui-states` wanting state views standardised once as shared components.
9. **Compatibility code.** `cq-clean-code` bans shims and `_v2` variants; `be-api-design` and `be-migrations` require deprecate-then-remove, `/v2`, and dual writes during expand/contract.
10. **Fetch in effects.** Valid in `fe-react-effects`; restricted to one-off loads by `fe-react-data-fetching`, which says it supersedes.
11. **Classes.** `fe-react-component` bans class components; `fe-react-data-fetching` sends Suspense errors to an error boundary.
12. **Readiness.** `be-reliability` allows "pool usable" and bans "readiness pings the database".
13. **Retry layers.** `be-reliability`: one layer. `fe-react-data-fetching` counts client retries as a benefit; server retries on top make two.
14. **Minor.** Squash merges (`git-workflow`) collapse the atomic commits `git-commit` asks for; the rule lists commit type `style`, `git-commit`'s default list omits it.

Not playbook text: 6 and 7 can both be honoured at once (`aria-invalid` + `aria-describedby` pointing at an error element with `role="alert"`; `clamp()` bounded by scale steps). The others need a decision from the lead.

## 7. Skills to load per task

| Task | Load |
|---|---|
| Component, state, effects | `fe-react-component`, `fe-react-effects`, `fe-ui-foundations`, `fe-a11y`; `fe-react-state-management` when deciding where state lives |
| Data-driven screen | `fe-react-data-fetching`, `fe-ui-states`, `fe-react-component`, `fe-responsive`, `fe-a11y` |
| Form | `fe-react-forms`, `fe-a11y`, `fe-touch`, `fe-ui-states` |
| Map or other imperative widget | `fe-react-effects`, `fe-react-performance`, `fe-touch`, `fe-a11y` |
| Layout, navigation, mobile shell | `fe-responsive`, `fe-touch`, `fe-a11y` |
| Tokens, theme, dark mode, identity | `fe-ui-foundations` plus section 2.12 |
| Slow UI or large bundle | `fe-react-performance`, `fe-react-effects` |
| Tests | components: `fe-react-testing`; unit, integration, e2e: `cq-testing` |
| Endpoint | `be-api-design`, `be-security`, `be-data-access`, `cq-testing` |
| Queries, transactions, concurrency | `be-data-access` |
| Schema change | `be-migrations`, `be-data-access` |
| Auth, sessions, CORS, rate limits | `be-security` |
| Outbound calls, jobs, shutdown, health | `be-reliability` |
| Logging, metrics, tracing | `be-observability` |
| Bug or flaky test | `cq-debug`, then `cq-testing` |
| Listing deferred work | `cq-simplify-debt` |
| Commit, PR, release | `git-commit`, `git-pull-request`, `git-changelog` |
| Review of a GitHub PR | `git-pr-review` (local diff: `/code-review`, not part of the pack) |
| Planning documents | `pm-product-brief`, `pm-product-spec`, `pm-roadmap`, `pm-backlog`, `pm-work-ticket` |
| Never for Heremita | `be-symfony`, `flow-find-skills` |
