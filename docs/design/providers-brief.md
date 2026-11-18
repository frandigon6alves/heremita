# Heremita: geocoding and routing providers brief

2026-11-18. Based on 103 saved request/response pairs, 10 new requests, and a harness that checks schemas, mappers and optimiser against the saved bodies. Re-run today: `tsc` clean (TypeScript 7.0.2 and the scaffold's 6.0.3), `run.ts` 95 PASS, `run-mappers.ts` 13 PASS.

**Measured** = seen in a saved response; **config** = the operator's published server configuration; **docs** = quoted documentation. `W` = the research workspace; its saved responses now live in `apps/api/test/fixtures/upstream/` and its reference code in `apps/api/test/fixtures/upstream/reference/`.

## 0. Decisions

| Need | Use | Reason |
|---|---|---|
| (a) Search, autocomplete | Photon `https://photon.komoot.io/api/` | Search-as-you-type, bias, bbox, category filters |
| (a) Explicit-search fallback | Nominatim `/search`, submit only | Photon does not index Portuguese names (1.2) |
| (b) Reverse | Photon `/reverse` | Same shape as search |
| (c) Routes | FOSSGIS OSRM `https://routing.openstreetmap.de/routed-{foot,bike,car}/` | The only key-less host that really serves all three modes |
| (d) Stop order | Our optimiser on straight-line distances | FOSSGIS `/table` and `/trip`: one call per 10 s, each matrix cell counts as a request (4.4) |
| Provider down | Labelled straight-line estimate per leg | 7.7 |

Not used: `router.project-osrm.org` (car for every profile), `valhalla1.openstreetmap.de` (works; documented alternative), Nominatim for autocomplete (forbidden).

## 1. Endpoints, parameters, samples

### 1.1 Photon search: `GET https://photon.komoot.io/api/`

Photon 1.3.0, data import 2026-11-08 (`/status`). Latency 0.21–3.33 s over 35 calls. Responses carry `Cache-Control: max-age=3600`.

| Parameter | Semantics |
|---|---|
| `q` | Text; optional with `include` ("museums near here") |
| `lang` | `default`, `de`, `en`, `fr` only (1.2) |
| `limit` | 100 returned 50 (measured); we send 6, max 20 |
| `lat`, `lon`, `zoom` | Bias point; zoom sets its radius (default 12). Ranks, never filters: a Rio bias still returned Utah museums |
| `location_bias_scale` | 0.0–1.0 weight of prominence, default 0.4 |
| `bbox` | `minLon,minLat,maxLon,maxLat`; filters |
| `countrycode`, `layer` | Filters; layers `house, street, locality, district, city, county, state, country, other` |
| `include`, `exclude` | `osm.<key>[.<value>]`, comma = OR; `osm.historic` matches all values (measured). Replaces `osm_tag` |
| `dedupe` | Leave on; duplicates still occur (measured), so de-duplicate by OSM ref |
| other | 400 listing the allowed parameters |

Real sample, trimmed to 1 of 3 features:

```
GET https://photon.komoot.io/api/?q=museu+de+arte&lat=-23.5614&lon=-46.6559&limit=3   → 200, 1,531 B, 0.94 s
{"type":"FeatureCollection","features":[{"type":"Feature",
  "properties":{"osm_type":"W","osm_id":1370081491,"osm_key":"tourism","osm_value":"museum","type":"house",
    "housenumber":"1578","name":"Museu de Arte de São Paulo","street":"Av. Paulista","locality":"Morro dos Ingleses",
    "district":"Bela Vista","city":"São Paulo","state":"São Paulo","country":"Brasil","postcode":"01310-200",
    "countrycode":"BR","extent":[-46.6563185,-23.5611808,-46.6556147,-23.5618152]},
  "geometry":{"type":"Point","coordinates":[-46.6559677,-23.5614961]}}, …]}
```

`extent` is `[west, north, east, south]`. Plain addresses have no `name`; the mapper names them "street number".

### 1.2 Languages: what Photon really supports

- `lang=pt` → `400 {"lang":[{"message":"Language is not supported. Supported are: default, de, en, fr","args":{},"value":"pt"}]}`.
- Without `lang`, `Accept-Language` applies: `pt-BR` gave local names ("Lisboa"), `de` "Lissabon". Node's `fetch` sends `Accept-Language: *`, so always send `lang`.
- Portuguese exonyms are not indexed. "Torre Eiffel" → three streets in Mexico, even biased to the tower, and nothing inside a Paris bbox. "Coliseu Roma" → a Romanian hotel; "Munique" → Brazilian apartment blocks. Nominatim (`accept-language=pt-BR`) found the tower (W5013364) and "Munique, Baviera, Alemanha".
- `lang=en` matches English names: "tokyo tower" → Tokyo Tower (R4247312); `default` → apartment blocks.

Decision: pt-BR → `lang=default`, en → `lang=en`. If no result name contains the query on an explicit search, call Nominatim once (1.4).

### 1.3 Photon reverse: `GET https://photon.komoot.io/reverse`

`lat`, `lon`, `radius` in **kilometres** (0–5000), `limit`, `lang`, `include`.

```
GET https://photon.komoot.io/reverse?lon=-43.2105&lat=-22.9519&lang=default   → 200, 0.87 s
{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"osm_type":"W","osm_id":105667349,
  "osm_key":"amenity","osm_value":"place_of_worship","type":"house","name":"Capela de Nossa Senhora Aparecida",
  "street":"Estrada do Corcovado","district":"Santa Teresa","city":"Rio de Janeiro","state":"Rio de Janeiro",
  "country":"Brasil","postcode":"22470-180","countrycode":"BR","extent":[…]},
  "geometry":{"type":"Point","coordinates":[-43.2104633,-22.9519172]}}]}
```

The chapel in the statue's base beat Christ the Redeemer (N4919986733, returned with `osm_tag=tourism`). So request `limit=5&radius=0.15` and let the user pick, beside "custom pin here". Open sea → `200` with `features: []`.

### 1.4 Nominatim (fallback only): `https://nominatim.openstreetmap.org`

> **Read the policy before enabling it:** https://operations.osmfoundation.org/policies/nominatim/. It asks LLMs that suggest the service to point to it and explain its restrictions:
> - at most 1 request per second for the whole application;
> - an identifying User-Agent or Referer, and attribution;
> - no autocomplete, no systematic or bulk queries;
> - cache results, and be able to switch the service without a software update.
>
> It must not be wired in by default by low-code tools: the owner decides deliberately.

- `GET /search?q=Torre+Eiffel&format=jsonv2&accept-language=pt-BR&limit=2&addressdetails=1`
- `GET /lookup?osm_ids=W1370081491,R5400890,N4919986733&format=jsonv2&accept-language=pt-BR&extratags=1` gives Portuguese names plus `opening_hours`, `website` and `wikidata` for known places.

```
[{"place_id":97665530,"osm_type":"way","osm_id":5013364,"lat":"48.8582599","lon":"2.2945006","category":"man_made",
  "type":"tower","place_rank":30,"importance":0.6205937724353116,"addresstype":"man_made","name":"Torre Eiffel",
  "display_name":"Torre Eiffel, 5, Avenue Anatole France, Quartier du Gros-Caillou, Paris 7e Arrondissement, Paris, Ilha de França, França metropolitana, 75007, França",
  "boundingbox":["48.8574753","48.8590453","2.2933119","2.2956897"]}]
```

Coordinates are strings; `boundingbox` is `[south, north, west, east]`.

### 1.5 OSRM on FOSSGIS

`GET https://routing.openstreetmap.de/routed-{foot|bike|car}/route/v1/driving/{lon},{lat};…?overview=full&geometries=polyline&steps=false&generate_hints=false`

| Parameter | Use |
|---|---|
| path prefix | Picks the profile; the `driving` segment is ignored (measured) |
| coordinates | `lon,lat;…`, 2–25 stops (our cap); `0,0` → code `InvalidOptions` (config) |
| `overview=full` | One polyline for the route; `simplified` (124 B vs 386 B) loses street detail |
| `geometries=polyline` | Precision 5, the smallest (4.2) |
| `steps=false` | Steps cost 15 KB for one 10 km leg |
| `generate_hints=false` | Otherwise each waypoint carries a ~100-character hint |
| `radiuses`, `exclude` | Unused: `radiuses` gave `NoSegment`; car `exclude=ferry` gave `InvalidValue` |

```
GET https://routing.openstreetmap.de/routed-foot/route/v1/driving/-9.1366,38.7075;-9.1335,38.7139;-9.1307,38.7165?overview=full&geometries=polyline&steps=false&alternatives=false
→ 200, 1,287 B, 0.16 s (hint strings removed here)
{"code":"Ok","routes":[{"legs":[{"steps":[],"weight":97.85,"summary":"","duration":846.9,"distance":1046.6},
  {"steps":[],"weight":80.78,"summary":"","duration":652.3,"distance":813.1}],"weight_name":"routability",
  "geometry":"{`gkFznwv@UE[Gm@PWFMDC@C@E@A?E@E@C@IBYH{@TG@EB_AVa@mCA?C@…","weight":178.63,"duration":1499.2,"distance":1859.7}],
 "waypoints":[{"location":[-9.136616,38.707503],"name":"","distance":1.430672714},
  {"location":[-9.133318,38.713346],"name":"Rua do Espírito Santo","distance":63.50353508},
  {"location":[-9.130374,38.716512],"name":"Largo da Graça","distance":28.38047737}]}
```

Metres and seconds. `waypoints[i].distance` = how far the stop moved to reach the network.

### 1.6 Measured, not recommended

- **router.project-osrm.org**: `/driving/`, `/foot/` and `/bike/` returned byte-identical car responses; its nginx config routes everything to the car backend.
- **valhalla1.openstreetmap.de** (3.9.3, FOSSGIS terms): `POST /route` (`"costing":"pedestrian"`) returns per-leg polyline6 shapes; `/optimized_route` and `/sources_to_targets` work. Pedestrian routes over 100 km fail with `400 {"error_code":154,…}`. The 3 Lisbon stops: 2.67 km against OSRM's 1.86 km.

## 2. Stable place identity

- **Key:** `osm_type + osm_id` (`N`/`W`/`R` + integer).
- **Not `place_id`.** Docs: "The same OSM object will have a different value on another server". Measured: N4919986733 had 10468680 and 10602000 from two backends a minute apart.
- **Not the class.** R5400890 is `place=city` in Photon and `boundary=administrative` in Nominatim; Photon returned N1513483139 as both `amenity=cafe` and `shop=pastry`.
- **Limits** (docs): "mappers can delete, split, recreate places (and those get a new osm_id), there is no link between those old and new ids."
- **Size:** `osm_id` exceeds 32 bits (N14183629101): `bigint`.

`places` stores `id` (UUIDv7, exposed), `osm_type char(1)` and `osm_id bigint` (NULL for custom pins) under `UNIQUE (osm_type, osm_id)`, `name`, `category`, raw `osm_key`/`osm_value` (to re-derive categories), `lng`/`lat`, address, `country_code` and `last_seen_at`.

To save, the client sends only the `key` (`osm:W:1370081491`). The server resolves it from its cache of served results, or from Nominatim `/lookup`, then runs `INSERT … ON CONFLICT (osm_type, osm_id) DO UPDATE … RETURNING id`. It never trusts client-sent names or coordinates. Reviews reference `places.id` and need an OSM-backed place; notes belong to the trip stop; a vanished OSM object keeps its row and reviews.

## 3. OSM tags → Heremita categories

Order: exact `key=value`, then key default, then `other` (`validate/categories.ts`). Photon's `osm_key`/`osm_value` is the main tag picked at import (Nominatim `presets.lua`): `tourism=attraction` and `historic=*` win only when nothing else applies. The samples' 122 features covered 44 pairs, all mapped as intended.

| Category | Exact rules | Key default | Photon `include` for browsing |
|---|---|---|---|
| sight | tourism=attraction, viewpoint, artwork; amenity=place_of_worship, fountain, monastery; man_made=tower, lighthouse, watermill, pier, bridge; building=cathedral, church, chapel, mosque, temple, synagogue, castle; bridge=yes | historic=*, other tourism=* | osm.tourism.attraction, osm.tourism.viewpoint, osm.tourism.artwork, osm.historic, osm.amenity.place_of_worship, osm.man_made.tower, osm.man_made.lighthouse |
| food | amenity=restaurant, fast_food, food_court | | the same three |
| cafe | amenity=cafe, ice_cream; shop=bakery, pastry, coffee, tea, confectionery, ice_cream | | osm.amenity.cafe, osm.amenity.ice_cream, osm.shop.bakery, osm.shop.pastry, osm.shop.coffee |
| nightlife | amenity=bar, pub, nightclub, biergarten, casino, stripclub, hookah_lounge, karaoke_box | | bar, pub, nightclub, biergarten |
| lodging | tourism=hotel, hostel, guest_house, motel, apartment, chalet, alpine_hut, wilderness_hut, camp_site, caravan_site; leisure=resort; building=hotel | | hotel, hostel, guest_house, motel, apartment, camp_site |
| shopping | amenity=marketplace | shop=* | osm.shop, osm.amenity.marketplace |
| nature | leisure=park, garden, nature_reserve; boundary=national_park, protected_area; waterway=waterfall; landuse=forest; tourism=picnic_site | natural=* | osm.leisure.park, osm.leisure.garden, osm.leisure.nature_reserve, osm.natural.peak, osm.waterway.waterfall, osm.boundary.national_park |
| beach | natural=beach; leisure=beach_resort | | the same two |
| culture | tourism=museum, gallery; amenity=theatre, arts_centre, cinema, library, planetarium, concert_hall, exhibition_centre | | museum, gallery, theatre, arts_centre, cinema, library |
| transport | amenity=bus_station, ferry_terminal, taxi, car_rental, bicycle_rental, parking, fuel, charging_station; highway=bus_stop; building=train_station | railway=*, aeroway=*, public_transport=*, aerialway=* | osm.railway.station, osm.railway.tram_stop, osm.amenity.bus_station, osm.amenity.ferry_terminal, osm.aeroway.aerodrome |
| activity | tourism=theme_park, zoo, aquarium, wine_cellar; craft=winery, brewery; amenity=public_bath, dive_centre, spa | leisure=*, sport=* | osm.tourism.theme_park, zoo, aquarium; osm.leisure.water_park, stadium, sports_centre |
| other | tourism=information; leisure=playground, dog_park; natural=tree, tree_row; railway=level_crossing, crossing, switch, rail, signal | every other key (place, boundary, building, highway, office, remaining amenity values) | none |

Fixed in this run: the nature filter used `osm.natural.waterfall`. Measured near Iguaçu, `osm.waterway.waterfall` returned Iguazú Falls, Garganta del Diablo and two more; `osm.natural.waterfall` returned four mis-tagged falls in Wales, France and Réunion. A harness check now covers it.

## 4. Routing

### 4.1 Shape and per-leg geometry

`legs[i]` carry `distance` and `duration`; `geometry` is one polyline for the whole route; `waypoints[i]` carry the snapped `location` and snap `distance`. The UI needs legs (leg chips, a mode per leg, dashed estimates), so `routeFromOsrm` cuts the polyline at the snapped waypoints. On 25 stops every waypoint was a vertex, in order, and each cut leg was within 0.59 % of `leg.distance`.

Legs inside a multi-stop route equal legs computed alone: all 24 legs of the 25-stop walk matched `/table` exactly, as did the car and bike samples; one foot leg differed by 2 s. So cache **per leg**: a changed mode or a moved stop refetches only the affected legs.

### 4.2 Geometry encodings (measured)

| Route | polyline5 | polyline6 | GeoJSON |
|---|---|---|---|
| 3 stops, 1.86 km, 167 vertices | 386 B (gzip 291) | 580 B (gzip 459) | 3,664 B as OSRM sends it (gzip 932) |
| 25 stops, 54.7 km, 4,090 vertices | 9,346 B (gzip 5,645) | not fetched | 80,913 B at 5 decimals (gzip 15,799) |

Polyline5 errs by at most 5.0e-6° (about 0.5 m) and round-trips exactly through `geo.ts`. Decision: store and send one polyline5 per leg; the client decodes it to GeoJSON for MapLibre.

### 4.3 Limits, profiles, unroutable stops

- **Stops:** 25 worked on `/route`, `/table` and `/trip`; a 101-stop `/trip` gave `400 {"message":"Too many trip coordinates","code":"TooBig"}`. Maximums are unpublished.
- **Profiles:** foot, bike and car, worldwide, each split into three graphs (Americas, Europe+Asia, Africa+Oceania). A dispatcher picks the graph holding most stops; ties go to Europe+Asia (config).
- **Unreachable stops still get "Ok"** (measured): an Atlantic stop was snapped 1,874,764 m away; New York → Lisbon on foot snapped New York to Portugal; a car route to Fernando de Noronha snapped the island to the mainland, 362 km away. `NoRoute` (400) came when two New York stops outvoted one Lisbon stop.
- **Decision** (`mappers.ts`): a stop snapped more than 1,000 m (walk, bike) or 3,000 m (drive) away is unroutable. Its legs become estimates and `quality` becomes `partial` (validated).
- **Ferries:** the foot profile uses them (a 45-minute ferry in one leg), invisible with `steps=false`.

### 4.4 `/trip` and `/table` on FOSSGIS

Both are enabled and throttled. Measured: a call 1.2 s after the previous one was held about 8.7 s, five times, with `Date` headers exactly 10 s apart; after an 11 s pause a call took 0.16 s. Config:

```
limit_req_zone $limit_route zone=standard:50m rate=1r/s;   # /route/, /nearest/
limit_req_zone $limit_table zone=table:50m rate=6r/m;      # /table/, /trip/, /match/
limit_req_status 429;
limit_req zone=standard burst=10 delay=9;
limit_req zone=table burst=1;
```

The 429 page: "For table and trip requests, each table *entry* equals one request." A 25×25 matrix is 625 requests under a one-per-second policy, so Heremita calls neither.

### 4.5 Ordering without an upstream call

`validate/optimize.ts` solves an open path deterministically, with stop 0 fixed and optionally the last. It runs exact Held-Karp up to 12 free stops; above that, nearest-neighbour and cheapest-insertion seeds improved by 2-opt and Or-opt.

| 25 Lisbon stops, fixed start and end | Walking time on the real matrix |
|---|---|
| Input order | 43,260 s |
| OSRM `/trip` | 29,332 s |
| Ours on the real matrix (3.8 ms) | 29,288 s |
| Ours on straight-line distances, no upstream call | 31,528 s (+7.5 %) |

On 5 stops the exact solver reproduced OSRM's order (fixed and free end); a 13-stop exact solve took 3.0 ms. Decision: optimise on straight-line distances, then route the suggestion's uncached legs so before/after times are real.

```ts
// SHORTCUT(owner): stop order optimised on straight-line distances — ceiling: +7.5 % walking time vs OSRM /trip on the 25-stop sample; upgrade: a self-hosted router without the 6/min table limit
```

## 5. Usage policies

| Service | Quoted rules |
|---|---|
| Photon, https://github.com/komoot/photon/blob/master/README.md | "You are welcome to use the API for your project as long as the number of requests stay in a reasonable limit. Extensive usage will be throttled or completely banned. We do not give guarantees for availability and reserve the right to implement changes without notice." No number given. |
| Nominatim, https://operations.osmfoundation.org/policies/nominatim/ | "No heavy uses (an absolute maximum of 1 request per second)." "Provide a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries will not do)." "Clearly display attribution as suitable for your medium." "the sum of traffic by all your users should not exceed the limits." "Apps must make sure that they can switch the service at our request at any time … If at all possible, set up a proxy and also enable caching of requests." "Clients sending repeatedly the same query may be classified as faulty and blocked." Forbidden: "Auto-complete search", systematic queries, scraping, reselling. "Please do not submit personal data or other confidential material to any of our services." |
| FOSSGIS terms (routing.openstreetmap.de, valhalla1.openstreetmap.de), https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ | Attribution and "a link to https://www.openstreetmap.org/fixthemap". "For websites, an email address of the operator must be easily identifiable and directly reachable". "The URLs of our services should not be hardcoded into the app." "Valid HTTP User-Agent identifying the application. User agents of libraries are not sufficient." "A valid origin indication (HTTP Referrer) where technically possible." "Maximum two downloading connections … Scripts are limited to one connection." "Commercial use is only permitted if the use of the services does not constitute a substantial part of an online offering." "Websites with high traffic volumes are generally not permitted to use our services." Routing: "Maximum one request per second." "each service is backed by only a single server. We do not guarantee availability." |
| FOSSGIS about, https://routing.openstreetmap.de/about.html | "One request per second max." "No scraping, no heavy usage." Requests are "saved in the server log file". Data "updated roughly every two days". |
| OSRM demo, https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server | "the demo server usage is restricted to reasonable, non-commercial use-cases. Do not exceed 1 request per second." The older policy, still "good practice", asks to credit ODbL "and the source of your routes (OSRM)" and warns: "Faking another app's User-Agent WILL get you blocked." |
| OSM, https://www.openstreetmap.org/copyright | "Provide credit to OpenStreetMap by displaying our attribution notice. Make clear that the data is available under the Open Database License." |

What this requires of Heremita:

- **Headers:** `User-Agent: Heremita/<version> (+https://<public site>/about)` and `Referer: https://<public site>/` on every call. Node's `fetch` sends `User-Agent: node` (measured). FOSSGIS rate-limits non-browser clients per User-Agent string at 3 req/s, so a generic agent shares strangers' traffic; blocked agents get 403 (config).
- **Site:** a contact e-mail, and "© OpenStreetMap contributors (ODbL) · Routes: OSRM / FOSSGIS · fix the map" visible near the map.
- **Configuration:** base URLs from env.
- **Privacy:** the privacy policy names komoot, OSMF and FOSSGIS as recipients of queries and coordinates; send no user identifiers.

## 6. Failure modes

| Host | Response | Source |
|---|---|---|
| Photon | 400 JSON in two shapes: `{"message":"…"}` (missing `q`, unknown parameter), `{"<param>":[{"message":"…","args":{},"value":…}]}` (`lang=pt`, `lat=999`) | measured |
| Photon | 200 with `features: []` (sea, no match); duplicate features | measured |
| Photon | Throttling or ban, status unknown | docs only |
| Nominatim | `400 {"error":{"code":400,"message":"Parameter 'limit' must be a number."}}`; reverse with nothing there → `200 {"error":"Unable to geocode"}` | measured |
| Nominatim | Rate-limit status undocumented, never seen | — |
| FOSSGIS OSRM | 200 `"Ok"` with absurd snaps (4.3) | measured |
| FOSSGIS OSRM | `400 {"message","code"}`: `NoSegment`, `NoRoute`, `TooBig`, `InvalidQuery`, `InvalidOptions`, `InvalidValue` | measured |
| FOSSGIS OSRM | `200 {"code":"InvalidOptions"}` for a 0,0 stop | config |
| FOSSGIS OSRM | `/table` and `/trip` held about 8.7 s | measured |
| FOSSGIS OSRM | 429 HTML page, no `Retry-After`, "This block will be automatically lifted after a while"; 403 for blocked agents or referrers | config |
| Valhalla | `400 {"error_code":154,"error":"…","status_code":400,"status":"Bad Request"}` | measured |

No saved response carried `Retry-After`. Latency: Photon 0.21–3.33 s, Nominatim 0.09–1.73 s, OSRM `/route` 0.15–0.28 s.

## 7. Recommendation and proxy design

### 7.1 API surface (proposal)

- `GET /api/v1/places/search?q&locale&near=lng,lat&zoom&within=w,s,e,n&categories&limit&intent=autocomplete|submit` → `{ items }` (bounded by `limit` ≤ 20, not paginated).
- `GET /api/v1/places/reverse?lng&lat&locale` → `{ items }`, nearest first, ≤ 5.
- `POST /api/v1/places { key }` → upsert (section 2).
- `GET /api/v1/trips/{tripId}/days/{dayId}/route` → legs and totals. The server reads stops and per-leg modes itself, which also enforces object-level authorisation.
- `GET /api/v1/trips/{tripId}/days/{dayId}/order-suggestion?keepLast=true` → `{ stopIds, before, after }`; applying it is the normal reorder mutation, with Undo.

Provider trouble gives 200 with estimated legs on the route endpoint, and problem+json 503 (`geocoding_unavailable` or `geocoding_busy`, with `Retry-After`) on search.

### 7.2 Provider-neutral interfaces (`validate/contract.ts`)

```ts
export type LngLat = { lng: number; lat: number };
export type BBox = { west: number; south: number; east: number; north: number };
export type Locale = 'pt-BR' | 'en';
export type TravelMode = 'walk' | 'bike' | 'drive';
export type PlaceKind = 'poi' | 'address' | 'street' | 'area';

export interface PlaceResult {
  key: string; // "osm:N:4919986733"
  ref: { osmType: 'N' | 'W' | 'R'; osmId: number };
  name: string;
  label: string; // "Av. Paulista 1578 · Bela Vista, São Paulo · Brasil"
  category: PlaceCategory;
  kind: PlaceKind;
  osmKey: string;
  osmValue: string;
  location: LngLat;
  bbox?: BBox;
  address: { houseNumber?: string; street?: string; district?: string; city?: string; state?: string; postcode?: string; country?: string; countryCode?: string };
}

export interface SearchQuery {
  text: string; // may be empty only when `categories` is set
  locale: Locale;
  intent: 'autocomplete' | 'submit';
  bias?: { center: LngLat; zoom?: number };
  within?: BBox;
  categories?: PlaceCategory[];
  limit?: number; // default 6, max 20
}

export interface ReverseQuery { point: LngLat; locale: Locale; radiusMeters?: number; limit?: number }

export interface GeocodingProvider {
  readonly id: string; // 'photon' | 'nominatim' | 'fake'
  readonly capabilities: { autocomplete: boolean; categoryFilter: boolean; locales: readonly Locale[] };
  search(query: SearchQuery, signal?: AbortSignal): Promise<PlaceResult[]>;
  reverse(query: ReverseQuery, signal?: AbortSignal): Promise<PlaceResult[]>; // [] when nothing is around
}

export interface RouteRequest { mode: TravelMode; stops: LngLat[] } // 2..25, visiting order
export interface RouteLeg { distanceMeters: number; durationSeconds: number; polyline: string; estimated: boolean }
export interface RouteResult {
  provider: string; // 'osrm-fossgis' | 'estimate' | 'fake'
  mode: TravelMode;
  quality: 'routed' | 'partial' | 'estimated';
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[]; // stops.length - 1, polyline precision 5 per leg
  snapped: Array<{ location: LngLat; offNetworkMeters: number; routable: boolean }>;
  attribution: string;
}

export interface RoutingProvider {
  readonly id: string;
  readonly capabilities: { modes: readonly TravelMode[]; maxStops: number };
  route(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult>;
}

export type ProviderErrorKind = 'bad_request' | 'no_route' | 'unroutable_stop' | 'too_many_stops'
  | 'rate_limited' | 'timeout' | 'unavailable' | 'bad_response';
// class ProviderError: provider, kind, retryable (timeout | unavailable), stopIndex? (from NoSegment)
```

`PlaceResult`, `SearchQuery` and `RouteResult` become zod schemas in `@heremita/shared`; the provider interfaces and `ProviderError` stay in `apps/api`.

### 7.3 Upstream zod schemas (`validate/upstream-schemas.ts`, zod 4.6.7 as in the scaffold)

Validated against every saved body (Photon, OSRM including six error codes, Valhalla, Nominatim). `z.object` strips unknown keys, so new upstream fields never break parsing. Parse Photon's envelope, then each feature alone (drop and count bad ones). Try `OsrmRouteOk`, then `OsrmError`, whatever the status: a 200 can carry an error code.

```ts
export const PhotonProperties = z.object({
  osm_type: z.enum(['N', 'W', 'R']), osm_id: z.number().int().positive(),
  osm_key: z.string().min(1), osm_value: z.string().min(1),
  type: z.string().optional(), name: z.string().optional(), housenumber: z.string().optional(),
  street: z.string().optional(), locality: z.string().optional(), district: z.string().optional(),
  city: z.string().optional(), county: z.string().optional(), state: z.string().optional(),
  country: z.string().optional(), countrycode: z.string().length(2).optional(), postcode: z.string().optional(),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(), // [west, north, east, south]
  extra: z.record(z.string(), z.unknown()).optional(),
});
export const OsrmRouteOk = z.object({
  code: z.literal('Ok'),
  routes: z.array(z.object({ distance: z.number().nonnegative(), duration: z.number().nonnegative(),
    geometry: z.string().optional(), legs: z.array(OsrmLeg).min(1) })).min(1),
  waypoints: z.array(z.object({ location: lonLat, distance: z.number().nonnegative(), name: z.string() })).min(2),
});
export const OsrmError = z.object({ code: z.string().refine((c) => c !== 'Ok'), message: z.string().optional() });
```

### 7.4 Cache keys and TTLs

The cache is a Postgres table `provider_cache (key text primary key, value jsonb, expires_at timestamptz)`, purged hourly in batches. Identical in-flight requests share one promise.

| What | Key | TTL |
|---|---|---|
| Photon search | `geo:v1:` + exact upstream URL (bias rounded to 4 decimals, integer zoom) | 24 h; 1 h if empty |
| Photon reverse | upstream URL, point rounded to 4 decimals (11 m) | 7 days |
| Place served to a client | `place:v1:osm:W:1370081491` | 24 h |
| Nominatim search / lookup | upstream URL | 24 h / 30 days |
| Route leg | `leg:v1:{provider}:{mode}:{lng5},{lat5}>{lng5},{lat5}` (provider in the key so fake and real legs never mix) | 7 days (data refresh ~2 days) |
| Estimates, errors | not cached | — |

### 7.5 Debounce and throttling

| Layer | Rule |
|---|---|
| Browser, autocomplete | ≥ 3 characters after NFKC trim; 300 ms debounce; abort the previous request (TanStack Query `signal`); `staleTime` 5 min; one retry on network errors only; Enter sends `intent=submit` at once |
| Browser, reverse | Explicit tap, long-press or button twin only; never on map move |
| API → Photon | Our own cap, since Photon publishes none: 1 req/s, burst 3. Autocomplete fails fast (503, `Retry-After: 1`, client keeps old suggestions); submit waits ≤ 2 s |
| API → Nominatim | 1 token per 1.1 s, burst 1, one connection; submit fallback and save-time lookup only; skip after 2 s without a token |
| API → FOSSGIS `/route` | 1 req/s, burst 1, one connection (FOSSGIS allows two, scripts one); same-mode uncached legs share one call; estimates after 3 s without a token |
| Clients → our API | Per session or IP: search 5/s (burst 10), reverse 1/s (burst 3), day route 2/s (burst 5); 429 + `Retry-After` |

```ts
// SHORTCUT(owner): upstream token buckets live in the API process — ceiling: one API instance; upgrade: before a second instance runs, move them to a shared store
```

### 7.6 Timeouts and retries

- Each attempt: `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`, within an 8 s request deadline. Timeouts: Photon autocomplete 4 s, other Photon and Nominatim 5 s, OSRM 6 s.
- Retry GETs only, on network error, timeout, 5xx or 429: at most 2 retries, full-jitter backoff from 250 ms capped at 2 s, honouring `Retry-After`, never past the deadline, each retry logged. Never retry autocomplete or a 4xx (an OSRM 400 is an answer).
- FOSSGIS 429: pause the host 60 s. 403: pause 1 h and log an `error` (our User-Agent or Referer was blocked; a human must act).
- Circuit breaker per host: opens after 5 consecutive retryable failures, 30 s, then one probe.

### 7.7 What users see when a provider is down

- **Search:** "Busca indisponível. Tentar de novo" in the results area; recents and "drop a pin here" still work.
- **Reverse:** the pin is saved as "Ponto no mapa", name editable.
- **Routes:** affected legs become straight line × 1.4 at 4.6 km/h walking, 15 km/h cycling, 30 km/h driving (65 beyond 10 km), dashed, labelled "estimativa", never cached.
  - Detour, measured: walking median 1.38, mean 1.49 over 34 Lisbon legs (range 1.11–4.24); on the 3 old-town stops, foot 1.63, bike 1.87, car 2.77.
  - Speeds, measured: foot 4.6, car 29.2 urban and 66.8 over 343 km, bike 8.4 in hilly Lisbon (so 15 is an assumption).
  - The 3-stop walk estimate: 1,594 m / 1,247 s against 1,860 m / 1,499 s routed.
- **Unroutable stop:** its legs are estimated, with "Não foi possível traçar a rota até aqui".

### 7.8 Deterministic fakes

- **Selection:** env `GEOCODING_PROVIDER=photon|fake` and `ROUTING_PROVIDER=osrm|fake`, zod-validated at boot. A fake with `NODE_ENV=production` refuses to boot unless `ALLOW_FAKE_PROVIDERS=true` is also set, because e2e runs a production build.
- **Fake geocoder:** about 15 fixture places made by running saved Photon features through the real `placeFromPhoton`, so fixtures carry real keys and categories. Matching is diacritic- and case-insensitive substring; prefix matches first, then distance to the bias, then name. Reverse returns the nearest fixture within 2 km, else an empty list.
- **Fake router:** straight 2-point legs, distance = haversine × 1.3, duration at the estimate speeds, `estimated: false`, `provider: 'fake'`. The factor differs from the 1.4 fallback on purpose, so a test can tell a fake-routed leg from an estimate. A stop with latitude above 85 is "snapped too far": its legs come back estimated and `quality: 'partial'`, exercising the same path as a real unroutable stop (section 4.3). (FOSSGIS itself answers a 0,0 stop with `InvalidOptions`, not a snap, so the fake does not copy that.)
- **Where:** `apps/api/src/providers/fake/`, beside the real adapters; it implements the same `GeocodingProvider` / `RoutingProvider` and runs through the same cache and throttle, so e2e covers that code too.
- **Failures:** both take `failWith?: ProviderErrorKind`; e2e sets it through `FAKE_PROVIDER_FAILURE`. A cached success would hide the failure, so failure scenarios use stops and queries no other scenario uses (or truncate `provider_cache` first). The fakes never read the clock or use randomness.
- **Tests:** mapper tests use the saved bodies as fixtures. Integration tests serve them through an HTTP stub (MSW or undici `MockAgent`), never mocks of our own classes.

### 7.9 Self-hosting later

Self-host when the terms stop fitting (sustained 429s, a high-traffic or commercial site) or Portuguese search matters.

- **Photon:** Java 21+. A planet database takes about 95 GB of disk, and the README recommends 64 GB of RAM.
- **Photon data:** GraphHopper's weekly dumps (planet 63.3 GB, continental extracts) carry only en/de/fr/local names. Portuguese needs the 27.1 GB JSON dump imported with `-languages pt,…`.
- **OSRM:** FOSSGIS serves worldwide car, bike and foot from servers with 6 cores and 256 GB RAM each. A regional extract needs far less; I did not measure how much.
- **What changes:** only base URLs, plus a `/table`-fed matrix for the optimiser. The interfaces stay the same.

## 8. Files implementers can copy (`W/validate/`)

| File | Contents |
|---|---|
| `contract.ts` | Provider-neutral types (7.2); unused `kinds` and speculative `matrix` removed in this run |
| `upstream-schemas.ts` | zod 4 schemas: Photon, OSRM, Valhalla, Nominatim |
| `mappers.ts` | `placeFromPhoton`, `dedupePlaces`, `photonSearchUrl`, `osrmRouteUrl`, `routeFromOsrm` (leg split, snap check), `estimateLeg`/`estimateRoute`, `providerErrorFromOsrm` |
| `categories.ts` | `categoryFromOsm`, `PHOTON_INCLUDE` (waterfall fix) |
| `geo.ts` | Polyline encode/decode (precision 5 or 6), haversine |
| `optimize.ts` | `optimiseOrder(matrix, { fixedEnd })`, `pathCost` |
| `run.ts`, `run-mappers.ts` | The checks; port them to Vitest with the saved bodies |

To run: `cd W/validate && node run.ts && node run-mappers.ts` (Node 24 strips types). To typecheck: `node_modules/.bin/tsc -p tsconfig.json`. Evidence: `W/responses/*.{hdr,body}`, plus `W/responses-r2/` (FOSSGIS config files, waterfall checks, `requests.log`).

Not verified:
- Photon and Nominatim throttling responses (never triggered).
- FOSSGIS 429/403 behaviour (config only).
- Stop maximums beyond the counts tested.
- The cycling estimate speed.
- Self-hosting resource needs for extracts.
