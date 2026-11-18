# Heremita design proposal: UX and frontend architecture

Status: COMPLETE (2026-11-18). Lens: user experience and frontend architecture. Applies to `apps/web` only, plus the contract shapes the web needs from `packages/shared`.

Inputs: `standards.md` (cited as §x.y), `ux-research.md` (cited as UX §x / principle n), `maplibre-guide.md` (COMPLETE; cited as ML §x), `providers-brief.md` (cited as PB §x), `scaffold-report.md` (in progress) and the skeleton's package.json files. None of the inputs was missing.

Tags: **[V]** checked today on this machine (installed package, `npm view`, `npm pack` + grep, Node `Intl`, Next 16.4.6 docs in `node_modules/next/dist/docs`); **[R]** from the research files; unmarked = my design decision.

Skeleton facts that shape this design [V]: `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`; `@tanstack/react-query` 5.108.0 with retry policy already "once, network errors only"; `maplibre-gl` ^6.19.0; React 19.3.1; Next 16.4.6; zod ^4.6.7; Playwright project `mobile-chromium` (Pixel 7). `cacheComponents` means any `cookies()` read must sit inside `<Suspense>` or the build fails (Next doc `authentication-with-cache-components.md`); that rule drives the auth design below.

---

## 1. Information architecture and route tree

### 1.1 Locale and i18n library

- **Library: `next-intl` 4.15.1** [V]: peer `next ^16.0.0`, `react ^19.0.0`, published 2026-11-12. It gives ICU plurals, `useFormatter` (dates, numbers, relative time), a `proxy.ts`-compatible middleware and locale-aware `Link`/`redirect`.
- **Locale in the URL, always prefixed:** `/pt-BR/...` and `/en/...`. Locales `['pt-BR', 'en']`, default `pt-BR`. Path segments stay in English for both locales (no localized pathnames: one route table, a shared link works in either language by swapping the prefix).
- Root segment `app/[locale]/` is the root layout. Next 16 `next/root-params` [V] (`node_modules/next/root-params.d.ts`, doc `next-root-params.md`) lets `i18n/request.ts` read the locale without prop drilling; next-intl 4.15.1 marks its own `requestLocale`/`setRequestLocale` as deprecated in favour of it [V]. With `cacheComponents`, the root layout must export `generateStaticParams()` returning both locales or the build fails [V].
- `src/proxy.ts` (Next 16 renamed `middleware` to `proxy` [V]) runs next-intl's middleware: `/` and unprefixed paths redirect by `NEXT_LOCALE` cookie, then `Accept-Language`, then `pt-BR`. Matcher excludes `/api`, `/_next`, files with extensions.
- The language switcher (settings and footer) is a plain link to the same path under the other prefix, which also sets `NEXT_LOCALE`.

### 1.2 Route tree

```
src/app/
  manifest.ts                          PWA manifest (metadata route)
  [locale]/
    layout.tsx                         <html lang>, fonts, theme script, NextIntlClientProvider, QueryProvider, Toaster
    not-found.tsx, error.tsx, global-error.tsx (in app/)
    (public)/                          static shell, SEO, no session read at top level
      page.tsx                         Landing                                   index
      explore/page.tsx                 Explore public trips  (?q=&sort=)         index
      t/[shareId]/page.tsx             Read-only trip (shared link)              index only if visibility=public
      places/[placeId]/page.tsx        Place: facts, community reviews           index if >=1 review
      u/[handle]/page.tsx              Public profile: public trips + reviews    index if it has public content
    (auth)/
      login/page.tsx                   ?next=/pt-BR/trips/...                    noindex
      signup/page.tsx                                                            noindex
    (app)/                             requires a session; noindex
      layout.tsx                       <Suspense> + ViewerGate (redirects to login?next=)
      trips/page.tsx                   My trips
      trips/new/page.tsx               Create trip
      trips/[tripId]/page.tsx          Planner (?day=&place=&mode=)
      trips/[tripId]/settings/page.tsx Trip details, dates, visibility, share link, copy, delete
      places/[placeId]/review/page.tsx Write or edit my review
      settings/page.tsx                Profile, language, theme, units, blocked users, sign out, delete account
```

Server-rendered vs client-heavy:

| Segment | Rendering |
|---|---|
| Landing, explore, place, public trip, public profile | Server Components. Public data is fetched server-to-server in `'use cache'` functions with `cacheLife('minutes')` and `cacheTag('trip:<id>')`/`('place:<id>')`. Viewer-only bits (my note, "Copy to my trips" state, my review) stream in behind `<Suspense>`. Only leaf islands are client: review sort, copy button, small cooperative-gesture map. |
| Login, signup, trip create, review form, settings | Server page shell + one client form leaf (React Hook Form + zod). |
| Trips list | Server-rendered first page (cookie forwarded), client `useInfiniteQuery` for "Load more". |
| Planner | Server Component fetches the trip and renders the itinerary list HTML (usable before any map JS); `PlannerScreen` is the client root that hydrates with that data as `initialData` and lazy-loads the map. |

### 1.3 Auth gating and server data access

- `src/lib/api/server.ts` (`import 'server-only'`): `serverFetch(path, init)` reads `cookies()`, forwards only the session cookie as a `cookie` header to `API_URL` (internal, not the public origin), sets a 5 s timeout, parses problem bodies with `problemDetailsSchema`.
- `getViewer()`: `GET /api/v1/me`, wrapped in `'use cache: private'` (the Next pattern for session reads [V]); returns `Viewer | null`.
- `(app)/layout.tsx` renders `<Suspense fallback={<AppSkeleton/>}><ViewerGate>{children}</ViewerGate></Suspense>`. `ViewerGate` calls `getViewer()`; null → `redirect('/<locale>/login?next=<path>')`. The proxy does not check sessions (it cannot validate them; a cookie-presence check would only duplicate this).
- `next` is accepted only if it starts with `/<locale>/` and not `//` (open-redirect guard), validated by a zod schema in the login page.
- Client mutations go to the same origin `/api/v1/...` (rewrite already in `next.config.ts`); the API's SameSite + Origin check covers CSRF (lead decision 5). No Server Actions for API calls: one client path, one error shape.
- 401 from any client query/mutation: a global `QueryCache`/`MutationCache` `onError` redirects to login with `next` = current URL (the only global side effect).

### 1.4 Guests

Recommendation within the lead decisions: **no guest mode in v1.** The research (principle 8) argues against a login wall, so v1 removes the wall where it costs least: landing, explore, public trips, place pages and reviews are fully public; "Start planning" goes to signup, which asks for 3 fields (display name, e-mail, password) and lands directly in a new trip. A server-side guest account is the upgrade path; `SHORTCUT(owner): signup required to create a trip — ceiling: users who abandon at the signup form; upgrade: if signup-start → signup-done drops below 60%, add server-side guest accounts that convert on signup`.

---

## 2. Screen-by-screen spec

Layout grid: phone 360–767 px single column, 16 px gutters; tablet 768–1023 side panel 360 px; desktop ≥ 1024 side panel 400 px (440 px ≥ 1280). Top app bar 56 px + `env(safe-area-inset-top)`. All primary actions on phones live in the bottom third or at mid-height (UX §1.2: centre is best, corners worst). Every data screen ships the four states through shared `Skeleton`, `EmptyState`, `ErrorState` components (§2.11); skeletons appear after 250 ms.

### 2.1 Landing `/[locale]`

```
Phone                                   Desktop (>=1024)
+----------------------------+          +-----------------------------------------------------------+
| (shell) Heremita   [Entrar]|          | (shell) Heremita        Explorar   Entrar  [Criar conta]  |
|                            |          |                                                           |
| Sua viagem, do seu jeito.  |          |  Sua viagem,              +-----------------------------+ |
| Marque lugares, monte os   |          |  do seu jeito.            |  static map illustration    | |
| dias, veja as rotas.       |          |  Marque lugares...        |  numbered pins + day route  | |
| [ static map illustration ]|          |  [Começar a planejar]     +-----------------------------+ |
| 3 steps: Marque / Organize |          |  3 steps in a row                                         |
| / Siga                     |          |  Viagens da comunidade: 3 PublicTripCards ->              |
| Viagens da comunidade ->   |          |                                                           |
| [card][card] (h-scroll)    |          |                                                           |
|[ Começar a planejar      ] |  sticky bottom CTA (phone only)                                      |
+----------------------------+          +-----------------------------------------------------------+
```

Primary: "Start planning" (→ signup, or → trips when signed in; the button label is decided in a Suspense leaf, fallback "Start planning" → signup). The illustration is an SVG, not a live map (LCP stays text). Community strip: 6 public trips from a cached server fetch. Empty strip: hidden. Error: hidden (marketing page never shows an error panel).

### 2.2 Sign up / log in

```
+----------------------------+
| [<]                        |
| Criar conta                |  h1
| Nome   [_______________]   |
| E-mail [_______________]   |  type=email autocomplete=email
| Senha  [_____________][o]  |  show/hide toggle; autocomplete=new-password
|        min 10 caracteres   |  hint, linked via aria-describedby
| [ Criar conta            ] |  full width, 48 px, bottom third on 360x740
| Já tem conta? Entrar       |
+----------------------------+
```

Desktop: the same 420 px form in the left third with the illustration on the right (not a centred card, §2.12). Validation: `signupBodySchema` from `@heremita/shared` via `zodResolver`; errors on blur then on change; server 422 `errors[].pointer` mapped to fields with `setError`; 409 `email_taken` → field error on e-mail with a "Log in instead" link; 429 → form-level alert with the `Retry-After` seconds. Submit disabled while `isSubmitting`, label becomes "Creating…" (spinner inline, no skeleton). Success → `router.replace(next ?? '/<locale>/trips/new?first=1')`. Paste and password managers are never blocked (§2.7).

### 2.3 My trips `/trips`

```
Phone                                   Desktop
+----------------------------+          +-----------------------------------------------------+
| Minhas viagens       (avatar)|        | rail | Minhas viagens                 [+ Nova viagem] |
| +------------------------+ |          |      | +-----------+ +-----------+ +-----------+     |
| |Lisboa  mar 2027        | |          |      | |card       | |card       | |card       |     |
| |4 dias · 23 lugares     | |          |      | +-----------+ +-----------+ +-----------+     |
| |Privada                 | |          |      | grid repeat(auto-fill, minmax(280px,1fr))      |
| +------------------------+ |          +-----------------------------------------------------+
| +------------------------+ |
| |Chile  sem datas        | |
| +------------------------+ |
|            [+ Nova viagem] |  extended FAB bottom-right, 56 px, above safe area
+----------------------------+
```

Card: title (Fraunces 20), dates or "N days" (dates optional, principle 1), places count, visibility badge, whole card is one link. Sort: last updated. Empty: "You have no trips yet" + "New trip" + "Or copy one from Explore". Error: region-level `ErrorState` with Retry and the problem `code`. Pagination: "Load more" button (keyset cursor), no infinite scroll (footer stays reachable).

### 2.4 Create / edit trip

Create `/trips/new` is one screen: Title (required, 1–80), Destination hint (optional free text, used only to centre the first map view via a geocode on submit), Dates (optional: start, end; or "Number of days" 1–60 when no dates). Primary "Create and open" → planner with `?day=ideas`. Edit lives in `/trips/[tripId]/settings`:

```
+----------------------------+
| [<] Ajustes da viagem      |
| Título [Lisboa 2027      ] |
| Datas  [14 mar]-[17 mar]   |  or "Sem datas: [4] dias"
| -- Visibilidade --         |
| (o) Privada                |
| ( ) Por link               |  link-only: anyone with the link, never listed
| ( ) Pública                |  listed in Explore, exact dates hidden (UX 1.5/principle 9)
| [Copiar link]  [Compartilhar] (navigator.share when present)
| -- Exportar --  [Imprimir]  |
| -- Zona de perigo --       |
| [Excluir viagem]           |  far from the primary action; <dialog> confirm (irreversible)
+----------------------------+
```

Changing dates that would drop days with stops: zod `superRefine` on the client blocks it with "Day 4 has 3 places; move them first" and a link to the planner. Visibility change is a single PATCH with an inline status; the share URL is `/<locale>/t/<shareId>` (`shareId` is an unguessable opaque id separate from `tripId`, regenerable: "Reset link").

### 2.5 The planner `/trips/[tripId]`

Specified in depth in section 3.

### 2.6 Place details

Two presentations of the same content:
- **In the planner:** the place card inside the sheet (half snap) with the traveller's note, day assignment, rating summary and the 2 most recent reviews, plus "See all reviews" → the place page.
- **Place page `/places/[placeId]`** (public, SEO): server-rendered.

```
+----------------------------+
| [<]  Museu de Arte de SP   |
| Cultura · Av. Paulista 1578|
| [ small map, cooperative ] |  180 px, cooperativeGestures: true (ML §7)
| -- Sua nota (Lisboa 2027) --|  only for a signed-in viewer arriving with ?trip=, Suspense leaf
| "Ir na terça, entrada..."  |
| -- Opiniões --              |
| 4,4 ★  12 avaliações       |  distribution bars only when count > 5 (UX 1.5)
| 5 ▇▇▇▇▇▇ 7                  |
| ...                        |
| [Mais recentes v]          |  sort: recent | lowest | highest (53% seek negatives)
| Ana · visitou em out 2026  |
| ★★★★☆ "Chegue cedo..."  [⋯]|  ⋯ = Report / Block user
| [Carregar mais]            |
| [ Escrever avaliação     ] |  sticky bottom on phone
+----------------------------+
```

Fewer than 6 reviews: show the count and each review, no average ("3 reviews" not "4.7 ★"). Zero reviews: "No reviews yet. Been there? Write the first one." Facts from OSM (category, address, opening hours if present, website) in a definition list; thin OSM data is normal (UX §1.2), so the page never shows empty fact rows. Desktop: two columns (facts + map left 40%, reviews right).

### 2.7 Write a review `/places/[placeId]/review`

```
+----------------------------+
| [x] Avaliar Museu de Arte  |
| Nota *  ☆☆☆☆☆              |  radio group of 5, 44 px each, arrow keys move
| Quando você foi? [out 2026]|  month input (type=month), required, not in the future
| Sua opinião                |
| [                        ] |  10-2000 chars, counter "123/2000" (aria-live=polite, throttled)
| Sem e-mail, sem fotos: só  |
| texto público.             |
| [ Publicar               ] |
+----------------------------+
```

One review per user per place: if one exists the form opens prefilled with "Update" and "Delete my review". Success → back to the place page, toast "Review published", the list shows it first. 409 `review_exists` cannot happen from this UI but is handled as "refresh". Desktop: same form in a 560 px column with the place summary on the right.

### 2.8 Explore `/explore`

```
+----------------------------+
| Explorar                   |
| [Search destination...  ]  |  ?q= (server-side text match on title/destination/country)
| [Recentes] [Mais copiadas] |  ?sort=recent|copied  (segmented)
| +------------------------+ |
| |[mini route thumbnail]  | |  static SVG of the trip's stops (server-built from coords)
| |Lisboa a pé · 4 dias    | |
| |por Ana · 18 lugares    | |
| |copiada 12x             | |
| +------------------------+ |
| [Carregar mais]            |
+----------------------------+
```

Server-rendered first page; filters are links (work without JS). Empty search: "No public trips for 'Fiji' yet" + "Plan it yourself". The seed data guarantees ≥ 12 public trips across 6 cities in both languages (not fabricated reviews counted as real users: seeded authors are visibly "Heremita demo" accounts, UX §1.5 "never fabricate density").

### 2.9 Public read-only trip `/t/[shareId]`

```
Phone                                   Desktop
+----------------------------+          +-------------------------------------------+
| Lisboa a pé       [Copiar] |          | panel 400: title, author, days list | map |
| por Ana · 4 dias           |          |                                     |     |
| [ map 45dvh, normal gestures]|        |                                     |     |
| (D1)(D2)(D3)(D4)           |          |                                     |     |
| 1 Castelo de S. Jorge      |          |                                     |     |
|   12 min a pé · 900 m      |          |                                     |     |
| 2 Miradouro da Graça       |          |                                     |     |
| ...                        |          |                                     |     |
| [ Copiar para minhas viagens ]  sticky bottom                                    |
+----------------------------+          +-------------------------------------------+
```

No editing affordances, no notes (notes are private even on public trips, UX §1.5), no exact dates ("4 days, March"). Map is the same map module in read-only mode (`?day=` and `?place=` work, so a shared link can point at a stop). "Copy to my trips": signed out → login with `next` back here plus `?copy=1` to resume; signed in → POST copy → toast with "Open copy". Report link in the footer of the page. Indexing: `robots: noindex` unless visibility is public.

### 2.10 Profile and settings `/settings`

Sections as a single scrolling page with anchored headings (no tabs on phone): Profile (display name, handle; handle used in `/u/[handle]`), Preferences (Language: radio pt-BR/English; Theme: System/Light/Dark; Distance units: km/mi), Privacy (blocked users list with Unblock), Account (Sign out, Sign out everywhere, Delete account with typed confirmation in a `<dialog>`). Each preference saves on change with an inline "Saved" status; theme and units also apply instantly locally.

---

## 3. The planner in depth

### 3.1 Layout

```
PHONE (390x844)                                       DESKTOP (>=1024)
+--------------------------------+                    +----------------------+-------------------------------+
| [<] Lisboa 2027           [⋯] |  top bar 56         | [<] Lisboa 2027  [⋯] |  [Q Search places......]      |
| [Q  Buscar lugares...        ]|  search 48          | (Ideias)(Todos)(D1)  |                               |
|                                |                    | (D2)(D3)(+)          |                               |
|          MAP (full height)     |                    | Dia 2 · sáb 15 mar   |        MAP                    |
|      (1)----(2)                |                    | 4 lugares · 3,2 km · |     (1)---(2)                 |
|               \                |                    | 48 min  [a pé|bike|carro]       \                     |
|               (3)       [+]    |  Add here 56       | 1 Castelo      [⋮][≡]|          (3)        [+] [◎]   |
|                         [◎]    |  Locate 44         |   12 min · 900 m  >  |                               |
| (i)                            |  attribution       | 2 Miradouro    [⋮][≡]|                               |
+--------------------------------+  above the sheet   | ...                  | (i) attribution bottom-left   |
| ====  (grab handle button)     |                    | [Otimizar ordem]     |                               |
| (Ideias)(Todos)(D1)(D2)(D3)(+) |  day chips 44      +----------------------+-------------------------------+
| Dia 2 · 4 lugares · 3,2 km ·48m|  summary  peek=136
+--------------------------------+
```

- The map is always full-height behind the sheet (ML §1, §5); the sheet's height is expressed as map padding, applied when the sheet settles at a snap (not per drag frame).
- Search pill sits under the top bar (familiar from maps apps); day chips and the day summary sit in the sheet header so they stay visible at every snap and within thumb reach.
- Floating buttons on the right edge at mid-height of the visible map: "Add here" (56 px, primary) and "Locate me" (44 px). Attribution control top-left in compact mode on phones so the sheet never hides it (ML §3).
- Desktop: side panel holds exactly the sheet's content (same components, `variant="panel"`), no sheet mechanics; map fills the rest. The place card replaces the panel content with a Back button (one panel, no stacking), keeping the map width stable.
- Plan mode / Trip mode (principle 5): the planner has a "Today" toggle in the `⋯` menu when the trip has dates covering today: it selects today's day, hides drag handles and menus, and makes "Directions to next stop" the primary button. Default when opening a trip during its dates.

### 3.2 Bottom sheet snap points (phone and tablet portrait < 768 px)

| Snap | Height | Content visible |
|---|---|---|
| peek | 136 px + `env(safe-area-inset-bottom)` | handle, day chips, one summary line |
| half | 50 dvh | + list of stops (or place card) |
| full | 100 dvh − 56 px top bar − 8 px | everything, map peeks above |

Behaviour: built in-house (section 6.9). Drag from the header area (handle + chips row + summary) with Pointer Events; the list body scrolls on its own with `overscroll-behavior: contain`. Release picks the nearest snap, or the next one in the fling direction when velocity > 0.5 px/ms. The handle is a `<button>` that cycles peek → half → full → half on tap/Enter (Apple HIG grabber behaviour, UX §1.2) with `aria-label` "Panel: half height. Expand". Default snap on open: half if the selected day has stops, peek otherwise. Selecting a place moves the sheet to half; panning the map with the sheet at full moves it to half. Snap state is local UI state (not URL). Back closes the top layer via URL history: `place` is pushed, so Back deselects; it never collapses the sheet.

### 3.3 Interaction steps and tap counts (phone)

Defaults: the "target day" is the selected chip; with Ideas or All selected the target is Ideas. "Add to Day 2" names its destination.

| Task | Steps | Taps |
|---|---|---|
| Search and add | tap search pill → type ≥ 3 chars (300 ms debounce, PB §7.5) → results list (combobox, 6 items, biased to map centre) → tap result: map eases to it, draft pin shown, place card at half → tap **"Add to Day 2"** → toast "Added to Day 2 · Change · Undo" | 3 + typing |
| Add from map (long-press) | hold 500+ ms on the map (ML §6) → draft pin + "What's here?" card with ≤ 5 nearby places (reverse, radius 150 m, PB §1.3) and "Use this exact spot" → tap one → **Add** | 2 + long-press |
| Same, visible twin | tap **[+] Add here** → crosshair at the visible map centre (above the sheet) + same "What's here?" card; pan the map under the crosshair to adjust (card refreshes on `moveend`, debounced 400 ms, only while this mode is open) → pick → **Add** | 3 |
| Custom pin (no OSM match) | in "What's here?" tap "Use this exact spot" → name field (required) → Add | 3 + typing |
| Select a marker | tap pin → `?place=<stopId>` pushed, pin grows + stroke, card at half, list row marked `aria-current` | 1 |
| Edit the note | in the card tap "Your note" textarea → type → autosaves 800 ms after the last keystroke and on blur | 1 + typing |
| Assign to a day | card: tap "Day: Ideas ▾" → choose day in the popover | 2 |
| Reorder (drag) | press the ≡ handle 200 ms → drag → drop; live region announces "Castelo moved to position 3 of 4" | 1 gesture |
| Reorder (no drag) | tap ⋮ on the row → "Move up" / "Move down" / "Move to first" / "Move to last" | 2 |
| Move between days | tap ⋮ → "Move to day…" → pick a day (or "New day") | 3 |
| Switch day | tap a chip (map fits the day's stops; chips scroll horizontally, selected chip scrolled into view) | 1 |
| Change route mode | segmented control Walk / Bike / Drive in the day summary (sheet at half) | 1 (2 from peek) |
| Per-leg mode | tap the leg line "12 min a pé" → popover: Walk / Bike / Drive / Directions | 2 |
| Optimise order | tap "Optimise order" under the list → preview card: before/after time, numbered diff, toggles "Keep first stop" (on) and "Keep last stop" (off) → **Apply** → toast with Undo | 2 |
| Open in a navigation app | per leg: leg popover → "Google Maps" or "Apple Maps" (one leg, origin → destination, matching travel mode; UX §1.4 says hand off per leg) | 3 |
| Whole day hand-off | day ⋯ → "Open day in Google Maps": if ≤ 5 stops, one URL with ≤ 3 waypoints; otherwise "Part 1 / Part 2" links split at stops 5, 9… | 3 |

Drag rules: drag only by the handle (scrolling the list never starts a drag); `@dnd-kit` `TouchSensor` with `delay: 200, tolerance: 6`, `PointerSensor` with `distance: 4`, `KeyboardSensor` with sortable coordinates. Cross-day drag only on desktop: rows can be dropped on a day chip. On phones, moving between days is the menu (NN/g, UX §1.3). Reorder and the menu share one mutation.

Route display: one `RouteLayer` for the selected day; "All" shows every day's route at 60% opacity and pins in day colours. Each leg row shows "12 min · 900 m" and a dashed "≈ 15 min (estimate)" when the API marks the leg `estimated` (PB §4.3, §7.1); the day summary appends "includes estimates". A day with 1 stop shows "Add another place to see a route". `quality: partial` shows a banner "1 place could not be reached by walk; times are estimates" with the stop named.

### 3.4 Slow and failed network, per mutation

Client rules: mutations never auto-retry (lead 9); every mutation on a trip uses TanStack `scope: { id: 'trip:' + tripId }` so they run serially in order [V: `MutationScope` exists in query-core 5.108.0]; each optimistic change snapshots the trip query, rolls back on error, invalidates on settle. Pending state appears after 400 ms as a subtle "Saving…" in the top bar (one global indicator fed by `useIsMutating({ mutationKey: ['trip', tripId] })`). Errors are toasts with Retry (a user-initiated retry re-sends the same payload with the same `Idempotency-Key` for creates).

| Mutation | Optimistic | On slow (> 400 ms) | On failure |
|---|---|---|---|
| Add stop (`POST /trips/{id}/stops`, `Idempotency-Key`) | yes: row and pin appear with a dashed outline and `aria-busy` | "Saving…" | row/pin removed; toast "Could not add Castelo. Retry" (keeps the place selected so Retry is one tap) |
| Edit note (`PATCH stop {note}`) | text stays in the field; status line under the field | "Saving…" | "Not saved. Retry"; text kept, also mirrored to `sessionStorage` per stop until saved so a reload does not lose it |
| Assign / move to day | yes | — | rollback + toast with Retry |
| Reorder day (`PUT /trips/{id}/days/{dayId}/order {stopIds, version}`) | yes | — | 409 `version_conflict`: refetch trip, toast "Trip changed elsewhere; showing latest"; other errors: rollback + Retry |
| Remove stop | yes, row collapses | — | rollback + toast. Undo (6 s) re-creates the stop with its note, day and position |
| Change day route mode (`PATCH day {routeMode}`) | URL `mode` changes at once and the route refetches for that mode | route region shows a skeleton line on the map list legs | rollback of the persisted mode only; displayed mode stays (the URL wins) with toast "Mode not saved" |
| Apply optimisation | = reorder | = reorder | = reorder |
| Create day / delete empty day | yes | — | rollback + toast |

Queries on a slow network: route fetch shows the previous route dimmed (`placeholderData: keepPreviousData`) plus a thin progress bar on the summary line; route error → summary "Route unavailable. Retry" and straight-line dashed legs drawn client-side, labelled as estimates. Search: keeps previous suggestions while fetching; 503 `geocoding_busy` shows "Search is busy, try again in a moment" under the input, not a toast. Offline (`navigator.onLine === false` / TanStack `onlineManager`): a persistent banner "You are offline. Changes are paused." and all edit controls disabled (TanStack's default `networkMode: 'online'` would otherwise queue mutations silently, which reads as data loss).

---

## 4. Component inventory and parallel work

### 4.1 Folders (rulebook §2.1: shared never imports features; features never import each other)

```
apps/web/src/
  app/[locale]/...                 routes: thin pages, layouts, error.tsx, loading.tsx; route-local
                                   composition in _components/ next to its only caller
  i18n/                            routing.ts (locales, defaultLocale), request.ts, navigation.ts
  messages/{pt-BR,en}/<ns>.json    one file per namespace: common, auth, trips, planner, places,
                                   explore, settings (merged in i18n/request.ts)
  proxy.ts                         next-intl locale negotiation only
  lib/api/                         client.ts (apiFetch for the browser), server.ts (server-only),
                                   problem.ts, query-client.ts, idempotency.ts
  lib/format/                      distance.ts, duration.ts, trip-dates.ts (pure, unit-tested)
  shared/styles/                   tokens.css, reset.css, base.css (imported once in the layout)
  shared/components/               generic, no domain types:
    button/ icon-button/ link-button/ text-field/ text-area/ field/ (label+hint+error wiring)
    select/ radio-group/ segmented-control/ chip/ chip-row/ rating-input/ rating-stars/
    dialog/ (native <dialog>), popover/ (native popover attr), toast/ (Toaster + live region)
    bottom-sheet/ skeleton/ empty-state/ error-state/ spinner/ avatar/ visually-hidden/
    combobox/ (downshift wrapper), sortable-list/ (dnd-kit wrapper, items are generic ids)
    app-bar/ status-line/ (Saving… / Saved / Not saved)
  shared/map/                      MapView, useMap, isMapAlive, basemap.ts (style URLs, transformStyle),
                                   PinsLayer (generic {id, label?, colorToken, variant}), RouteLineLayer,
                                   DraftPin, geo.ts (polyline5 decode, bounds), useMapPadding
  shared/hooks/                    use-media-query.ts, use-reduced-motion.ts, use-online.ts
  features/auth/                   LoginForm, SignupForm, LogoutButton, viewer queries
  features/trips/                  TripCard, TripList, TripForm, VisibilitySettings, ShareLink,
                                   CopyTripButton, DeleteTripDialog, trips queries/mutations
  features/itinerary/              the planner's domain: DayChips, DaySummary, ModeSwitch, StopList,
                                   StopRow, StopActions, LegRow, LegActions, OptimisePreview,
                                   PlaceCard (trip context: note + day), NoteEditor, AddHereButton,
                                   TodayView, ReadOnlyItinerary, trip-to-geojson.ts, nav-links.ts,
                                   usePlannerParams, itinerary queries/mutations
  features/place-search/           PlaceSearch (combobox), WhatsHereCard (reverse), search queries
  features/reviews/                RatingSummary, ReviewList, ReviewItem, ReviewForm, ReportDialog,
                                   BlockUserButton, review queries/mutations
  features/explore/                PublicTripCard, RouteThumbnail (SVG), ExploreFilters
  features/settings/               ProfileForm, PreferencesForm, BlockedUsers, DeleteAccountDialog
```

The planner composes four features (itinerary, place-search, reviews, map), so its client root lives at `app/[locale]/(app)/trips/[tripId]/_components/planner-screen.tsx`: it imports `features/itinerary`, `features/place-search`, `features/reviews` and `shared/map`, and passes reviews into `PlaceCard` through a `communitySlot` prop (composition over cross-feature imports). The public trip page composes `ReadOnlyItinerary` + `shared/map` the same way.

Boundaries worth stating:
- `shared/map` knows pins, lines and colours, not stops or days. `features/itinerary/trip-to-geojson.ts` turns a trip into `PinsLayer`/`RouteLineLayer` input.
- `shared/components/sortable-list` knows ids and a render function; the itinerary decides what a row is.
- Query keys and API functions live in the feature that owns the resource (`features/itinerary/queries.ts` owns `['trip', id]`). Another feature that must invalidate it does so through the route-level composition passing an `onChanged` callback, never by importing the key.

### 4.2 Parallel lanes (no shared files after day 1)

Day 1, one engineer, ~half a day: `shared/styles/tokens.css`, `i18n/*`, `[locale]/layout.tsx`, `lib/api/*`, empty namespace files. Everything after that is disjoint:

| Lane | Owns | Depends on |
|---|---|---|
| A Design system | `shared/components/*`, `shared/hooks/*` | tokens |
| B Map | `shared/map/*` | — (ML guide is the spec) |
| C Auth + settings | `features/auth`, `features/settings`, `(auth)/*`, `settings/`, `messages/*/auth.json`, `settings.json` | A's Field/Button (stub with native elements first) |
| D Trips + explore + public | `features/trips`, `features/explore`, `trips/page`, `trips/new`, `trips/[id]/settings`, `explore/`, `t/[shareId]/`, `u/[handle]/` | contract schemas |
| E Itinerary (planner) | `features/itinerary`, `trips/[tripId]/page.tsx` + `_components/` | B, A's BottomSheet/SortableList |
| F Search + reviews | `features/place-search`, `features/reviews`, `places/*` | A's Combobox, RatingInput |

Contract schemas in `packages/shared` are written first by the API owner per resource; the web lanes consume them and MSW handlers are built from the same schemas.

---

## 5. State and data plan

### 5.1 Where each piece of state lives (§2.5 ladder)

| State | Home |
|---|---|
| Selected day `day` (`ideas` \| `all` \| dayId), selected stop `place` (stopId), route mode `mode` (`walk`\|`bike`\|`drive`), explore `q`/`sort`, review `sort` | URL search params via **nuqs 2.10.3** (peer `next >=14.2` [V]); `day` and `mode` use `history: 'replace'`, `place` uses `push` so Back deselects; all `shallow: true` (no server round trip) |
| Trip, days, stops, notes, routes, search results, reviews, viewer | TanStack Query cache |
| Sheet snap, draft pin position, "What's here" mode, optimise preview open | `useState` in `PlannerScreen`, passed down (one level of context `PlannerUiContext` for the sheet snap, low frequency) |
| Theme, units | `<html data-theme>` + `localStorage` (per-viewer convenience) and the user's profile for units; React Context `PreferencesContext` |
| Map instance | `MapContext` from `MapView` (ML §1) |
| Form state | React Hook Form |

No client store (no Zustand): nothing high-frequency is shared beyond a parent, and the URL plus the query cache cover selection and data. `mode` in the URL is what the screen shows; when absent it falls back to the day's saved `routeMode`; when the owner changes it, the URL updates instantly and the day's `routeMode` is PATCHed (so a shared link and the owner's default agree on reload).

### 5.2 Query keys, stale times, invalidation

Factories with `queryOptions()` per feature (§2.3):

| Key | Endpoint | staleTime | Notes |
|---|---|---|---|
| `['viewer']` | `GET /me` | 5 min | seeded from the server render |
| `['trips', 'mine']` | `GET /trips?limit=20&cursor=` | 30 s | `useInfiniteQuery`, `getNextPageParam: p => p.nextCursor` |
| `['trip', tripId]` | `GET /trips/{id}` → trip + days + stops (place summary, note, legMode) | 30 s, `refetchOnWindowFocus: true` | one document for the planner; `initialData` from the RSC fetch with `initialDataUpdatedAt` |
| `['trip', tripId, 'route', dayId, mode, stopsSig]` | `GET /trips/{id}/days/{dayId}/route?mode=` | `Infinity`, gcTime 30 min | `stopsSig` = ordered `stopId:legMode` joined; any reorder/add/remove/mode change makes a new key, so no invalidation needed; `keepPreviousData` |
| `['trip', tripId, 'order-suggestion', dayId, stopsSig, keepLast]` | `GET .../order-suggestion` | `Infinity` | `enabled` only while the preview is open |
| `['places', 'search', {q, locale, near, zoom}]` | `GET /places/search` | 5 min | `near` rounded to 2 decimals so panning slightly reuses results; `signal` aborts |
| `['places', 'reverse', {lng, lat, locale}]` | `GET /places/reverse` | 1 h | coords rounded to 4 decimals |
| `['place', placeId]` | `GET /places/{id}` | 5 min | |
| `['place', placeId, 'reviews', sort]` | `GET /places/{id}/reviews` | 60 s | infinite |
| `['explore', {q, sort}]` | `GET /public-trips` | 60 s | infinite |

Invalidation map: stop/day/order mutations → optimistic write to `['trip', tripId]`, `invalidateQueries(['trip', tripId], { exact: true })` on settle (routes refetch through the new `stopsSig`, not invalidation); add/remove stop also invalidates `['trips', 'mine']` (counts); review mutations → `['place', placeId]` prefix; copy trip → `['trips', 'mine']`; visibility → `['trip', tripId]` and, server side, `revalidateTag('trip:<id>')` is not available to the API, so public pages use `cacheLife` of minutes (stated limit: a trip made private disappears from Explore within the cache life; `SHORTCUT(owner): public pages cached up to 5 min after a visibility change — ceiling: a private trip stays visible ≤ 5 min; upgrade: an internal revalidate route the API calls after commit`).

Optimistic update pattern (one helper per mutation, pure functions `applyReorder(trip, dayId, stopIds)`, `applyMove(trip, stopId, toDayId, index)`, unit-tested):

```ts
onMutate: async (vars, ctx) => {
  await ctx.client.cancelQueries({ queryKey: tripKey(tripId) });
  const previous = ctx.client.getQueryData(tripKey(tripId));
  ctx.client.setQueryData(tripKey(tripId), (trip) => trip && applyReorder(trip, vars.dayId, vars.stopIds));
  return { previous };
},
onError: (_e, _v, result, ctx) => ctx.client.setQueryData(tripKey(tripId), result?.previous),
onSettled: (_d, _e, _v, _r, ctx) => ctx.client.invalidateQueries({ queryKey: tripKey(tripId), exact: true }),
```

(The exact v5.108 callback signatures must be checked against the installed `MutationOptions` types before coding; I verified only that `scope` exists.)

### 5.3 Map and list in sync

One direction of truth: URL + `['trip', tripId]` → derived values in render → both the list and the map layers.

- `PlannerScreen` derives `visibleStops`, `pins` (GeoJSON with `promoteId: 'id'`, ML §4) and `selectedStopId` from data + params. No copies in state.
- Map → URL: pin tap calls `setPlace(stopId)`; empty-map tap (after the `queryRenderedFeatures` check, ML §4) calls `setPlace(null)`.
- URL → map: an effect keyed on `selectedStopId` sets feature-state and `easeTo` the pin (duration 0 under reduced motion); an effect keyed on `day` runs `fitBounds` with 24 px padding over the map's persistent bottom padding (ML §5).
- URL → list: the selected row gets `aria-current="true"` and `scrollIntoView({ block: 'nearest' })` only when the selection came from the map (a ref records the source of the last change).
- Sheet → map: `onSnapSettled(heightPx)` → `map.easeTo({ padding: { bottom: heightPx } })`; desktop uses `left: 0` and no bottom padding.

---

## 6. Visual identity and design system

### 6.1 Brand idea

"Heremita" is the hermit crab (caranguejo-eremita): it carries its home and changes shells as it goes. The solo traveller carries their trip the same way. The brand is **a shell you carry**: calm, self-sufficient, tidal. Visual language: a warm sand paper ground, a deep tide-pool teal for action, a crab-shell coral reserved for the one thing that matters on a screen (the selected pin, the primary action on marketing pages), and a spiral mark that is also a route: a logarithmic spiral drawn as a line with three numbered dots. Lucide's `Shell` icon [V] is the placeholder mark until the spiral SVG is drawn.

Process (§2.12): three token sets were sketched. (a) *Field notebook*: kraft background, ink blue, red pencil; rejected: kraft under a light basemap made the map look dirty and muted text fell under 4.5:1. (b) *Night market*: near-black with neon day colours; rejected: busy over a map, dark-only. (c) *Tide pool*: chosen; warm but not beige-everywhere, one cool primary, one warm accent, saturated-but-deep day colours that hold white numbers. Checked against the tells: no Inter, no purple or violet anywhere (one candidate day colour `#5A4A8C` was dropped for that reason), no dead-centred cards (forms sit left-aligned in a grid), surfaces carry hue rather than safe greys.

### 6.2 Colour tokens (contrast computed with the WCAG formula [V])

Light (`:root`, `[data-theme="light"]`):

| Token | Value | Pair → ratio |
|---|---|---|
| `--color-bg` | `#F5EFE3` | text 13.50, muted 5.83, primary 6.92 |
| `--color-surface` | `#FFFCF6` | text 15.09, muted 6.52, primary 7.74, accent 5.29, danger 6.93, success 6.70, warning 5.79 |
| `--color-surface-raised` | `#FFFFFF` | text 15.46, muted 6.68 |
| `--color-text` | `#1C2629` | |
| `--color-text-muted` | `#535E62` | on primary-soft 5.44 |
| `--color-primary` | `#0E5A60` | on-primary `#FFFFFF` 7.92 |
| `--color-primary-soft` | `#DCEBEA` | text 12.60, primary 6.46 (selected row, chips) |
| `--color-accent` | `#B8432A` | on-accent `#FFFFFF` 5.42 |
| `--color-accent-soft` | `#F7E1DA` | text 12.32 |
| `--color-danger` | `#A8261C` | |
| `--color-success` | `#2C6637` | |
| `--color-warning` | `#8A5A00` | |
| `--color-border` | `#D8CDB8` | 1.54 on surface: decorative dividers only |
| `--color-border-control` | `#8C8273` | 3.69 on surface: inputs, chips, toggles (≥ 3:1, §2.7) |
| `--color-focus` | `#0E5A60` | 7.74 on surface, 6.92 on bg |

Dark (`[data-theme="dark"]`, and `@media (prefers-color-scheme: dark)` when no override):

| Token | Value | Pair → ratio |
|---|---|---|
| `--color-bg` | `#0F1619` | text 14.57, muted 8.16, primary 9.21 |
| `--color-surface` | `#162024` | text 13.22, muted 7.41, primary 8.36, accent 6.71, danger 7.27, success 8.49, warning 8.93 |
| `--color-surface-raised` | `#1D2A2F` | text 11.75, muted 6.59 |
| `--color-text` | `#EBE5D9` | |
| `--color-text-muted` | `#A6AFB0` | |
| `--color-primary` | `#6CC7C2` | on-primary `#0B2224` 8.35 |
| `--color-primary-soft` | `#173A3C` | text 9.81, primary 6.20 |
| `--color-accent` | `#F0896B` | on-accent `#2A0E06` 7.30 |
| `--color-accent-soft` | `#3A211B` | text 11.85 |
| `--color-danger` / `success` / `warning` | `#FF8A80` / `#7BCB8A` / `#E9B65C` | |
| `--color-border` | `#2C3A40` | 1.41, decorative only |
| `--color-border-control` | `#6E7C80` | 3.84 on surface |
| `--color-focus` | `#6CC7C2` | 8.36 on surface |

Focus ring: `outline: 3px solid var(--color-focus); outline-offset: 2px`, plus a 2px `--color-surface` inner box-shadow on elements over the map so the ring reads on any tile colour.

**Day colours** (pins and routes; same in both themes because pins carry a white 2 px stroke; white number on fill ≥ 4.5:1 since 13 px bold is not "large text"):

| Day | Token | Value | White text | vs positron `#F2F3F0` |
|---|---|---|---|---|
| 1 | `--day-1` tide | `#0E5A60` | 7.92 | 7.11 |
| 2 | `--day-2` crab | `#B8432A` | 5.42 | 4.87 |
| 3 | `--day-3` harbour | `#3D5A99` | 6.73 | 6.04 |
| 4 | `--day-4` amber | `#9A5B00` | 5.43 | 4.87 |
| 5 | `--day-5` kelp | `#2C6637` | 6.86 | 6.16 |
| 6 | `--day-6` urchin | `#8E3B6A` | 7.04 | 6.32 |
| 7 | `--day-7` olive | `#4F5B12` | 7.40 | 6.64 |
| 8 | `--day-8` slate | `#41535E` | 8.00 | 7.19 |

Day 9+ cycles; the day number on the chip and the stop number on the pin carry identity, so colour is never alone. On the `dark` basemap (`#0C0C0C`) fills are 2.5–3.6:1, so the white stroke (19.56:1) is the non-text boundary that meets 3:1. Map paint values are read from the tokens with `getComputedStyle` at layer creation and on theme change (ML §8).

### 6.3 Typography

- Headings: **Fraunces** variable (OFL; axes `opsz 9–144`, `wght 100–900`, `SOFT 0–100` [V in next/font data]), weight 600, `SOFT 50`, `opsz` auto. Its soft, shell-like curves are the brand voice; used only for h1–h3 and trip titles.
- Text and UI: **Atkinson Hyperlegible Next** variable (OFL; `wght 200–800`, latin + latin-ext [V]), built for legibility, distinct from Inter, with full Portuguese diacritics. Weights 400, 600, 700.
- Loaded with `next/font/google` (self-hosted at build, no runtime third-party request), `display: 'swap'`, subsets `latin` and `latin-ext`; only Atkinson is preloaded.
- Distances and times use `font-variant-numeric: tabular-nums` (to be checked against the font's feature list when installed; if absent, accept proportional figures).

Scale (steps 12/14/16/20/24/32/48; `clamp()` bounded by adjacent steps, lead 11):

| Token | Size | Line height | Use |
|---|---|---|---|
| `--text-xs` | 12px | 1.4 | attribution, badges |
| `--text-sm` | 14px | 1.45 | meta, leg lines |
| `--text-md` | 16px | 1.5 | body, inputs (≥ 16 px avoids iOS zoom, §2.9) |
| `--text-lg` | `clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` 16→20 | 1.3 | card titles, sheet summary |
| `--text-xl` | `clamp(1.25rem, 1.05rem + 0.8vw, 1.5rem)` 20→24 | 1.25 | h2 |
| `--text-2xl` | `clamp(1.5rem, 1.1rem + 1.6vw, 2rem)` 24→32 | 1.15 | h1 app pages |
| `--text-3xl` | `clamp(2rem, 1.2rem + 3.2vw, 3rem)` 32→48 | 1.1 | landing h1 only |

### 6.4 Spacing, radii, elevation, motion

- Spacing: `--space-1: 4px` `--space-2: 8px` `--space-3: 12px` `--space-4: 16px` `--space-6: 24px` `--space-8: 32px` `--space-12: 48px` `--space-16: 64px` (§2.10). Rhythm: 16 inside cards, 24 between cards, 32 between page sections.
- Radii: `--radius-sm: 4px` (inputs' inner, badges), `--radius-md: 8px` (buttons, inputs, rows), `--radius-lg: 16px` (cards, sheet top corners, dialogs), `--radius-full: 9999px` (chips, FABs, avatars).
- Elevation (tinted with the ink colour, not black): `--shadow-1: 0 1px 2px rgb(28 38 41 / 0.12)` (cards), `--shadow-2: 0 4px 12px rgb(28 38 41 / 0.14)` (FABs, popovers), `--shadow-3: 0 -6px 24px rgb(28 38 41 / 0.16)` (bottom sheet). Dark: same offsets, `rgb(0 0 0 / 0.5)` and surfaces lighten with height (`surface` → `surface-raised`).
- Motion: `--duration-fast: 120ms` (pressed states), `--duration-base: 200ms` (popovers, chips), `--duration-slow: 320ms` (sheet snap), `--ease-out: cubic-bezier(0.2, 0, 0, 1)`, `--ease-in: cubic-bezier(0.3, 0, 1, 1)`. Under `prefers-reduced-motion: reduce` all durations become `0ms` except opacity fades (120 ms), and map camera calls pass `duration: 0`.
- Pressed state everywhere: `transform: scale(0.97)` + `--color-primary-soft` background (§2.9: every control shows a pressed state).

### 6.5 Iconography

**lucide-react 1.75.0** [V: peer `react ^19.0.0`, published 2026-11-18; all needed icons present: `MapPin`, `MapPinPlus`, `Route`, `Footprints`, `Bike`, `Car`, `GripVertical`, `Crosshair`, `LocateFixed`, `Search`, `Star`, `Share2`, `Copy`, `Ellipsis`, `Undo2`, `Navigation`, `Flag`, `Moon`, `Sun`, `Languages`, `WandSparkles`, `ListOrdered`, `Shell`]. Named imports only (tree-shaken), `strokeWidth={1.75}`, 20 px in rows, 24 px in bars. Icon-only buttons always carry an `aria-label`; decorative icons `aria-hidden`.

### 6.6 Map markers

GL layers, not DOM markers (ML §4):
- **Day stop:** circle radius 14 (28 px) in the day colour, white stroke 2, white number in `Noto Sans Bold` 13 px (on OFM's glyph server; ML §4). Invisible hit circle radius 22 (44 px target).
- **Selected:** radius 18, stroke 4 white, plus an outer halo circle radius 24 in `--color-accent` at 0.35 opacity. Size and stroke change, not colour alone.
- **Idea (unassigned):** radius 9 ring: fill `--color-surface`, stroke 3 `--color-text` (13.9:1 on positron, 15.6:1 inverted on dark). No number.
- **Saving (optimistic):** stroke dashed is not supported on circles, so opacity 0.6 until confirmed.
- **Draft pin:** the one DOM marker (draggable, keyboard-movable, ML §6): a 40 px teardrop in `--color-accent` with a white `Crosshair` glyph, `aria-label` "New place pin. Use arrow keys to move".
- Clusters only for "All" at zoom < 12 (ML §4), a circle in `--color-primary` with the count.
- Route line: day colour 3→7 px over a white (light) / `#0F1619` (dark) casing; estimated legs dashed (`line-dasharray [1, 1.5]`).

### 6.7 Headless packages

| Need | Decision | Evidence |
|---|---|---|
| Bottom sheet | **Build it** (`shared/components/bottom-sheet`, ~200 lines: Pointer Events on the header, CSS `transform` + transition, snap math in a pure function) | `vaul` 1.1.2 [V] is a Radix *Dialog* (modal by design; dependency `@radix-ui/react-dialog`), last published 2024-12-14. Our sheet is persistent and non-modal over a live map: dialog semantics, focus trapping and scroll lock are wrong for it. |
| Drag and drop | **`@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0** | Peers `react >=16.8` [V]; the dist uses `unstable_batchedUpdates`, which react-dom 19.3.1 still exports (`typeof === 'function'` [V]); no `findDOMNode`. Has Touch, Pointer and Keyboard sensors and screen-reader announcements. Risk: last release 2024-12; its successor `@dnd-kit/react` 0.5.3 is pre-1.0. Not run in a React 19 app today. |
| Combobox | **`downshift` 9.5.0** (`useCombobox` hook) | Peer `react >=16.12.0`, published 2026-11-16 [V]; no removed React APIs in dist [V]; a hook, so markup and styles stay ours; follows the ARIA 1.2 combobox pattern. |
| Menus, popovers | Native `popover` attribute + plain `<button>` lists (not `role="menu"`); native `<dialog>` with `showModal()` | No package. Popover is Baseline 2024. |

Rendering a minimal sortable list and a combobox under React 19.3.1 Strict Mode is the first task of lane A; if either fails, the fallback is `@dnd-kit/react` 0.5.3 (peer `react ^19`) and Ariakit 0.4.43 (peer `react ^19`) [V].

---

## 7. Accessibility and i18n

### 7.1 Map-dependent tasks without the map

The itinerary list is the primary keyboard and screen-reader path; the map is a visual enhancement (ML §10).

- DOM order in the planner: top bar → search → sheet/panel (day chips, summary, list) → map region → floating buttons. A "Skip to map" link sits first in the sheet; the map canvas is one tab stop (`role="region"`, translated `aria-label` "Trip map", ML §10).
- Select a stop: each row's name is a `<button>` that sets `place`; the card opens and focus moves into its heading (`tabIndex={-1}`) only when the selection came from the keyboard.
- Add a searched place: combobox with `aria-activedescendant`; Enter on a result opens the card with focus on the "Add to Day 2" button.
- Add a custom spot without a pointer: "Add here" → draft DOM marker receives focus; arrow keys move it 10 px (Shift 50 px; maplibre's built-in behaviour since 6.4, ML §6); Enter opens "What's here?". A "Coordinates" disclosure in that card accepts typed `lat, lng` for anyone who cannot aim at all.
- Reorder: the ⋮ actions (Move up/down/first/last, Move to day) are the single-pointer and keyboard path (§2.7, WCAG 2.5.7); dnd-kit's `KeyboardSensor` (Space to lift, arrows, Space to drop) is an extra. Every reorder announces "Castelo, now 3 of 4 in Day 2" in the shared polite live region.
- Route: the day summary and each leg row are text ("12 min walk, 900 m"); the map line adds nothing a screen reader needs.

### 7.2 Focus, sheets, dialogs, live regions

- Bottom sheet: non-modal `<section aria-labelledby>`, no focus trap, `inert` is never applied to the map. Snap changes do not move focus. The handle button's label states the current snap.
- Dialogs (delete trip, delete account, report, optimise preview on phones): native `<dialog>` + `showModal()` (§2.7), initial focus on the least destructive control, focus returns to the invoker on close, Escape closes.
- Popovers (row actions, day picker, leg actions): `popover="auto"` (light-dismiss + Escape), focus moves to the first button, returns to the trigger.
- One app-wide polite live region inside `Toaster` for toasts, async results ("4 results"), save status; form errors use `role="alert"` on the field's error element (lead 11): `aria-invalid="true"` + `aria-describedby="<hint-id> <error-id>"`.
- Sticky bars: `scroll-padding-bottom` equals the sheet/CTA height so focused elements are never covered (WCAG 2.4.11).
- Targets: 44×44 minimum (chips 44 tall, leg rows 48, drag handle 44×44, FAB 56); 8 px between adjacent targets (§2.9). Zoom never disabled.
- Reduced motion: section 6.4. Colour: section 6.2 (never alone).

### 7.3 i18n details

- Messages: `messages/{pt-BR,en}/{common,auth,trips,planner,places,explore,settings}.json`, ICU syntax, keys by screen and role (`planner.stop.moveUp`). A unit test asserts both locales have identical key sets and that every ICU message parses.
- Plurals: Portuguese has CLDR categories `one`, `many`, `other` and treats 0 as `one` [V: `Intl.PluralRules('pt-BR').select(0) === 'one'`], so zero always gets an explicit `=0` branch: `{count, plural, =0 {Nenhum lugar} one {# lugar} other {# lugares}}`. The `many` category only matters for compact millions; not used.
- Dates: trip dates are calendar dates (`YYYY-MM-DD` strings in the contract, not timestamps) and are formatted with `timeZone: 'UTC'` so they never shift a day [V: pt-BR renders "dom., 14 de mar."]. Review visit dates are months ("out. 2026"). Timestamps (review published) use relative time ("há 3 dias") via `useFormatter().relativeTime` with the `now` passed from the server render (no hydration mismatch, Next "preventing flash" guide [V]).
- Numbers and distances: `Intl.NumberFormat` with `style: 'unit'`: `3,3 km` (pt-BR) / `2 mi` (en, imperial) [V]. Units default: metric for both locales; a profile setting switches to miles (feet below 0.1 mi). Below 1 km show metres rounded to 10 m.
- Durations: `Intl.DurationFormat` exists in Node 24 [V: "1 h e 5 min" / "1 hr, 5 min"], but browser coverage is recent; `lib/format/duration.ts` uses it when present and falls back to a two-unit message (`{h} h {m} min`). Durations ≥ 1 h drop seconds; < 1 min shows "< 1 min".
- Place names: shown as the API returns them (localized when the provider has the name, PB §1.2); the basemap labels follow the locale via `transformStyle` (ML §3).
- `<html lang>` from the root param; `hreflang` alternates on public pages.

---

## 8. Performance budget and PWA

Reference device: mid-range Android (Moto G Power class), Lighthouse mobile (4× CPU, slow 4G).

| Metric | Public pages (landing, explore, place, public trip) | Planner |
|---|---|---|
| LCP | ≤ 2.5 s | list visible ≤ 2.5 s; map tiles visible ≤ 4 s |
| INP | ≤ 200 ms | ≤ 200 ms for tap-to-select, chip switch, reorder |
| CLS | ≤ 0.05 | ≤ 0.05 (sheet and skeletons reserve space) |
| First-load JS (gzip, route) | ≤ 150 KB | ≤ 200 KB before the map chunk |
| Map | not loaded, except the public trip page, where it loads lazily after hydration | 288 KB gzip chunk + 551 KB raw worker [R: ML §1], never on the critical path |

Rules:
- The map is loaded with `next/dynamic({ ssr: false })` from a client component (ML §1); the server-rendered list is the LCP element in the planner. On the trips list, `requestIdleCallback(() => import('@/shared/map/map-view'))` warms the chunk so opening a trip feels instant.
- `<link rel="preconnect" href="https://tiles.openfreemap.org">` in the planner and public trip layouts only.
- `pixelRatio: Math.min(devicePixelRatio, 2)`, one map instance per screen, `remove()` on unmount (ML §7).
- Fonts: two variable families, latin + latin-ext subsets, only the body font preloaded.
- dnd-kit is imported only by `StopList` in edit mode; downshift only by `PlaceSearch`; both live in the planner chunk.
- Route geometry arrives as polyline5 per leg (PB §4.2) and is decoded on the client.
- CI check: `next build` output per route compared to the JS budget (a script that fails above budget); Lighthouse CI on landing and public trip with the fake providers. Measure with the React Profiler before any memoisation (§2.6); React Compiler stays off unless the lead turns it on.

PWA basics: `app/manifest.ts` (metadata route [V: Next PWA guide]) with `name: "Heremita"`, `short_name`, `start_url: "/"` (the proxy picks the locale), `display: "standalone"`, `background_color: #F5EFE3`, `theme_color: #0E5A60`, icons 192/512 + maskable 512, and `viewport.themeColor` per scheme. iOS gets `apple-touch-icon` and `appleWebApp` metadata. No service worker in v1 (offline-first is out of scope); portability comes from a print stylesheet for the trip (one day per page, list + leg times) and the share link. `SHORTCUT(owner): no service worker — ceiling: the planner needs the network to open; upgrade: when "open on the road" is requested, cache the last opened trip document and its tiles within OpenFreeMap's offline limits (ML §3)`.

---

## 9. Frontend test plan

Tooling already in the skeleton: Vitest 5.1.0 + jsdom + RTL 16.3.3 + jest-dom; Playwright with a Pixel 7 project. Add `@testing-library/user-event` and **MSW 3.0.7** [V: peers `vite >=6`, `typescript >=5.9`] with handlers typed from the shared schemas.

**Unit (pure modules, no DOM):** `applyReorder` / `applyMove` / `applyRemove` (empty, one, many, move to same index, unknown id); `stopsSig`; `trip-to-geojson` (ideas vs day pins, order numbers, selected); polyline5 decode round trip; `nav-links` (Google URL with `travelmode`, ≤ 3 waypoints split, Apple URL); snap math (nearest, fling, clamp); `formatDistance`/`formatDuration` in both locales and both units (0, 9 m, 999 m, 1 km, 1 h 05); trip date formatting at UTC boundaries; `next` param validation (rejects `//evil`, `https://`, other locale prefixes allowed); message catalogues have equal keys; `keepOurLayers`/`localizeLabels` (ML §9).

**Component (RTL + MSW, user-event, no `fireEvent`, §2.13):** LoginForm and SignupForm (field errors with `aria-invalid` + described-by + `role="alert"`, 422 pointer mapping, 409, 429, submit disabled while pending); TripForm (dates vs number of days, dropping a non-empty day blocked); ReviewForm (rating radio keyboard, future month rejected, update vs create); PlaceSearch (debounce with fake timers, arrow/Enter, 503 busy message, empty results copy); StopList via the action popover (move up/down/to day; announcement text; rollback on 500 restores order and shows Retry); NoteEditor (Saving → Saved, failure keeps text, Retry); BottomSheet (handle button cycles snaps with Enter, label updates, no focus trap); RatingSummary (≤ 5 reviews shows count without average); every data component in loading (after 250 ms), empty, error and success. MapView tests follow ML §9 (real maplibre for the no-WebGL path, a fake map for layers).

**End-to-end (Playwright, fake geocoding/routing providers selected by env on the API, basemap intercepted with `page.route` to a minimal local style, ML §9):** projects `mobile-chromium` (Pixel 7, touch), `desktop-chromium` (1280×800), and `mobile-webkit` (iPhone 15) as non-blocking until WebGL2 under headless WebKit is confirmed. Data seeded per test through the API; auth reused with `storageState`; locators by role and name; no `waitForTimeout`.

1. Sign up → first trip created → planner opens with Ideas selected (phone, pt-BR).
2. Search "museu" → add to Day 1 → toast Undo → undo removes it → add again; pin count via the list and `data-map-state="ready"`.
3. Long-press on the map (CDP touch, 700 ms) → "What's here?" → add; then the "Add here" button path to the same result.
4. Reorder Day 1 by the action popover (phone) and by drag (desktop); route summary updates; reload keeps the order.
5. Move a stop to Day 2 via "Move to day"; switch chips; URL `day` updates; Back closes a selected place.
6. Change mode to bike; legs and totals change (fake provider is deterministic); one leg marked as estimate when the fake provider flags it.
7. Optimise → preview shows saving → apply → Undo restores.
8. Make the trip public → open `/t/<shareId>` signed out (new context) → no notes visible → "Copy to my trips" → login → copy appears in My trips.
9. Write a review on a seeded place → appears first; ≤ 5 reviews show no average; report a review.
10. Language switch to English and theme to dark persist across reload; axe scan (`@axe-core/playwright` 4.14.0 [V]) on every page in both themes with zero serious violations.
11. Offline banner: `context.setOffline(true)` disables editing; back online re-enables.

---

## 10. Verified facts, open questions, risks

Verified today [V]: next-intl 4.15.1 peers (next ^16, react ^19) and its deprecation of `requestLocale` in favour of `next/root-params`; `next/root-params` and `proxy.ts` exist in Next 16.4.6 docs; `cacheComponents` requires Suspense around cookie reads and `generateStaticParams` for root params; font availability in `next/font` data; lucide-react 1.75.0 icons and peer; vaul is a Radix Dialog last published 2024-12; dnd-kit core uses only `unstable_batchedUpdates`, which react-dom 19.3.1 exports; downshift 9.5.0 and Ariakit 0.4.43 peers; `MutationScope` in query-core 5.108.0; nuqs 2.10.3 peer range; MSW 3.0.7 peers; `@axe-core/playwright` 4.14.0; all contrast ratios; pt-BR plural categories; `Intl.DurationFormat` and unit formatting in Node 24.

Not verified (must be checked when building):
- next-intl + `next/root-params` + `cacheComponents` end-to-end in a running app (only types and docs read).
- nuqs 2.10.3 with Next 16.4 `cacheComponents` and `partialPrefetching` (peer range only); fallback is `useSearchParams` + `router.replace/push`.
- dnd-kit and downshift rendering under React 19.3.1 Strict Mode (static inspection only).
- Atkinson Hyperlegible Next's `tnum` feature.
- `@axe-core/playwright` against Playwright 1.65 at runtime; headless WebKit WebGL2.
- Exact TanStack v5.108 mutation callback signatures used in 5.2.

Open questions for the lead / API architects:
1. Contract needs from the web: trip document `GET /trips/{id}` returning days and stops in one payload with a per-day `version`; `PUT /trips/{id}/days/{dayId}/order`; stop `legMode` override; trip `visibility: private | link | public` with a separate regenerable `shareId`; `Idempotency-Key` on creates; `GET /me` with `units`, `handle`; review report and user block endpoints; `GET /public-trips` with `q`/`sort`.
2. Guest accounts (section 1.4): deferred by this proposal; confirm.
3. Should public pages be invalidated by the API after commit (revalidate route) instead of the 5-minute cache life?
4. Dates: confirm the contract uses `YYYY-MM-DD` date-only strings for trip days (lead decision 2 covers timestamps, not calendar dates).
