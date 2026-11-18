# MapLibre GL JS 6.19 in Heremita (Next.js 16 + React 19): implementation guide

Status: COMPLETE (2026-11-18). Written from three research sessions. Every claim is tagged:
**[RAN]** = executed against maplibre-gl 6.19.0 in headless Chromium 159 (Playwright, 390x844 @2x, SwiftShader software WebGL) or in a throwaway Next.js 16.4.6 + React 19.3.1 app with Strict Mode on; **[SRC]** = read in the installed package source, types, CHANGELOG or a fetched provider page; **[ADVICE]** = judgement, not tested.
Evidence lives in `scratchpad/w1-maplibre/` (scripts `t01`–`t16`, outputs in `logs/r3-*.json`, screenshots in `shots/`).

## 1. Setup in the App Router

```tsx
// src/components/map/map-view.tsx
'use client';
import {MapLibreMap, setWorkerUrl, type MapOptions} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {createContext, use, useEffect, useRef, useState, type ReactNode} from 'react';

// v6 ships the worker as a separate ES module; a bundler does not find it by itself.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

const removedMaps = new WeakSet<MapLibreMap>();
/** React runs the parent's cleanup BEFORE its children's: guard every child cleanup with this. */
export const isMapAlive = (map: MapLibreMap) => !removedMaps.has(map);

const MapContext = createContext<MapLibreMap | null>(null);
export function useMap(): MapLibreMap {
  const map = use(MapContext);
  if (!map) throw new Error('useMap() must be used inside <MapView>');
  return map;
}

type Props = {styleUrl: string; center: [number, number]; zoom: number; label: string;
  options?: Omit<MapOptions, 'container' | 'style' | 'center' | 'zoom'>; children?: ReactNode};

export function MapView({styleUrl, center, zoom, label, options, children}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useRef({styleUrl, center, zoom, label, options}); // read once per mount

  useEffect(() => {
    const init = initial.current;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({...init.options, container: containerRef.current!, style: init.styleUrl,
        center: init.center, zoom: init.zoom, locale: {...init.options?.locale, 'Map.Title': init.label}});
    } catch (error) { // GPUInitializationError when WebGL2 is missing
      console.error(error);
      setFailed(true);
      return;
    }
    instance.once('load', () => setMap(instance));
    return () => { removedMaps.add(instance); instance.remove(); setMap(null); };
  }, []);

  return (
    <div className="mapRoot" data-map-state={failed ? 'failed' : map ? 'ready' : 'loading'}>
      <div ref={containerRef} className="mapCanvas" /> {/* MapLibre owns this node: keep it empty */}
      {failed && <p role="alert">{/* translated "map unavailable" text; the list view still works */}</p>}
      {map && <MapContext value={map}>{children}</MapContext>}
    </div>
  );
}
```

```tsx
// src/components/map/trip-map.tsx: a Client Component, because `ssr: false` is only allowed there in Next 16
'use client';
import dynamic from 'next/dynamic';
export const TripMap = dynamic(() => import('./trip-map-screen').then((m) => m.TripMapScreen), {
  ssr: false, loading: () => <div className="mapRoot" aria-busy="true" />,
});
```

Verified **[RAN]** (Next dev and `next build && next start`, Strict Mode on, `t02`/`t05`/`t06`):
- The worker is emitted as `/_next/static/media/maplibre-gl-worker.<hash>.mjs` and started once. Without `setWorkerUrl` the map never loads: `Worker failed to load. Check that the worker URL is correct.` (`t07`, `?noworker=1`).
- Strict Mode double mount: one canvas, one map after mount; unmount leaves 0 canvases; remount works; 20 client navigations away and back still left exactly 1 canvas and 1 map.
- Unmount order: the child layer's cleanup ran **after** `map.remove()`; unguarded, `removeLayer` throws (`Cannot read properties of undefined`) and Next shows its error page. After `remove()`, `removeLayer`/`removeSource`/`setFeatureState` throw; `getLayer`, `off`, `marker.remove()`, `easeTo`, a second `remove()` do not (`t04`).
- Resize: shrinking the container (707 → 407 px) resized the canvas with **no** `resize()` call (built-in ResizeObserver, `trackResize`).
- Bundle: one chunk of 1,046 kB raw / 288 kB gzip, plus the worker (551 kB raw) and 72 kB CSS. With `next/dynamic` + `ssr: false` the chunk is absent from the route's initial HTML.
- Importing `maplibre-gl` in plain Node works (no default export); `new Map()` there throws `document is not defined`, so construct only in an effect. `require()` fails (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

Pitfalls:
- **GeoJSON types [RAN]** (TypeScript 6.0.3 and 7.0.2): maplibre's `.d.ts` uses the global `GeoJSON` namespace. `apps/web/tsconfig.json` has `"types": ["node"]` (and TS 6+ defaults `types` to empty), so `GeoJSON` does not resolve and, with `skipLibCheck`, `setData` silently accepts anything. Fix: add `@types/geojson` and `"types": ["node", "geojson"]`. With that, the wrapper and the snippets of sections 3–8 type-check under `strict` (`w3-jsdom/src/snippets.ts`).
- A **bottom sheet overlaying the map must not resize it**: keep the map full-height and express the sheet as padding (section 5).
- Keep the container div empty in JSX, and the camera props initial-only: later camera changes go through `easeTo`/`fitBounds` in effects keyed on URL params.

## 2. Wrapper: our own, not a library

Versions checked on npm on 2026-11-18 **[SRC]**:

| Package | Latest | maplibre-gl peer | Notes |
|---|---|---|---|
| `react-map-gl` (maplibre entry) / `@vis.gl/react-maplibre` | 8.1.3 (2026-09-02) | `>=4.0.0` (react `>=16.3`) | **[RAN]** works with 6.19 + React 19 + Next 16 (`t07`, 0 errors) given the same `setWorkerUrl` call. Uses private internals (`map._container`, `_resizeObserver`, `_update()`, `_frame`, `_render`). |
| `maplibre-react-components` | 0.2.6 (2025-05-30) | `^5.0.0` | Peer range excludes v6. |
| `@mapcomponents/react-maplibre` | 1.8.20 | depends on `maplibre-gl ^5.24` | Pulls in a second, v5 copy. |
| `react-maplibre-ui` | 2.0.0 (2021) | old | Unmaintained. |

**Recommendation [ADVICE]: our own wrapper** (section 1) plus small children that each own one source and its layers (`<PlacesLayer>`, `<RouteLayer>`, `<DraftPin>`), using `useMap()` and guarding cleanup with `isMapAlive`. What we need (feature-state, style switch keeping our layers, sheet padding, long-press) is imperative anyway, and we avoid a dependency on private internals. Fallback choice if declarative JSX is wanted later: `@vis.gl/react-maplibre` 8.1.3, the only one that works with v6 today.

Child component pattern: the add/cleanup/guard structure is **[RAN]** (`DemoLayer` in Next with Strict Mode, and a mocked Vitest test, section 9); the route paint values below are [ADVICE].

```tsx
const FIRST_PIN_LAYER = 'h-places-hit'; // routes are inserted below the pins
export function RouteLayer({dayId, line, color}: {dayId: string; line: GeoJSON.Feature<GeoJSON.LineString> | null; color: string}) {
  const map = useMap();
  const src = `h-route-${dayId}`;
  useEffect(() => {
    map.addSource(src, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
    map.addLayer({id: `${src}-casing`, type: 'line', source: src,
      layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 11]}}, FIRST_PIN_LAYER);
    map.addLayer({id: `${src}-line`, type: 'line', source: src,
      layout: {'line-cap': 'round', 'line-join': 'round'},
      paint: {'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7]}}, FIRST_PIN_LAYER);
    return () => {
      if (!isMapAlive(map)) return; // the whole map is already gone
      map.removeLayer(`${src}-line`); map.removeLayer(`${src}-casing`); map.removeSource(src);
    };
  }, [map, src]);
  useEffect(() => { map.setPaintProperty(`${src}-line`, 'line-color', color); }, [map, src, color]);
  useEffect(() => {
    void map.getSource<GeoJSONSource>(src)?.setData(line ?? {type: 'FeatureCollection', features: []});
  }, [map, src, line]);
  return null;
}
```

## 3. Basemap

OpenFreeMap styles that exist **[RAN]** (HTTP 200, `cache-control: max-age=86400`): `https://tiles.openfreemap.org/styles/positron`, `/bright`, `/liberty`, `/dark`, `/fiord`. **404**: `/dark-matter`, `/light`, `/osm-bright`, `/3d` (the "3D" on the quick-start page is a demo, not a style URL).

- **Light: `positron`** (background `rgb(242,243,240)`, low-key, pins stand out) or `liberty` (richer, the OFM default). **Dark: `dark`** (`rgb(12,12,12)`). `fiord` is a blue-grey dark alternative. [ADVICE] Use positron/dark as the pair: they share the source id `openmaptiles`, so a switch can diff (section 8).
- **Attribution [SRC]**: the vector TileJSON carries `OpenFreeMap © OpenMapTiles Data from OpenStreetMap` (with links) and the default AttributionControl shows it automatically. It collapses to a compact "i" button when the map is ≤ 640 px wide. OSM's attribution guidelines say not to hide attribution beneath UI: keep the control **out from under the bottom sheet** (`attributionControl: false` and `map.addControl(new AttributionControl({compact: true}), 'top-left')`, or offset it with CSS by the sheet height).
- **Terms [SRC]** (ToS of 2026-10-14): free, no key, no registration, no cookies, "no limits on the number of map views or requests"; as-is, may be discontinued without notice; no automated collection except offline downloads (≤ 3,000 tiles or 50 MB, ≤ 4 parallel requests, unique User-Agent); integrator 18+; donation-funded.
- **Label language [RAN]**: OFM tiles carry `name:pt`, `name:en`, `name_en`, `name:latin`, `name:nonlatin`. Rewrite symbol `text-field`s with `transformStyle`. In positron this rewrote 16 layers; country labels rendered "Alemanha, França, Espanha" for `pt` and "Germany, France, Spain" for `en`.

```ts
export const localizeLabels = (lang: 'pt' | 'en'): TransformStyleFunction => (_previous, next) => ({
  ...next,
  layers: next.layers.map((layer) =>
    layer.type === 'symbol' && JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name')
      ? {...layer, layout: {...layer.layout, 'text-field': ['coalesce', ['get', `name:${lang}`], ['get', 'name']]}}
      : layer),
});
```

`new Map({transformStyle})` is allowed since 6.16 and is reused by later `setStyle(url)` calls that pass no `transformStyle` **[RAN]** (`t16`: called for "initial" and "switch"). A `transformStyle` passed to `setStyle` replaces it for that call, so compose language + "keep our layers" in one function (section 8). Switching language = `setStyle(sameUrl, {transformStyle})`.

- **Fallback [RAN]**: a failed style fetch fires the map `error` event with an `AJAXError` (`status` 404, or 0 for an unreachable host; no `sourceId`); `setStyle(fallback)` then loads normally. Fallback: **VersaTiles** `https://tiles.versatiles.org/assets/styles/colorful/style.json` (light) and `.../eclipse/style.json` (dark), 200 today, OSM data, no key, also best-effort. Caveats: a different tile schema whose styles label from `name` only (Portuguese names in its tiles not checked), and different fontstacks (`noto_sans_bold` vs OFM's `Noto Sans Bold`), so our `text-font` must be chosen per provider. Not `tile.openstreetmap.org`: its policy forbids heavy use and blocks without notice.

```ts
map.on('error', (e) => {
  if (e.error instanceof AJAXError && !usingFallback && (e.error.url ?? '').includes('/styles/')) {
    usingFallback = true;
    map.setStyle(FALLBACK[theme], {transformStyle: keepOurLayers}); // no label rewrite: different schema
  }
});
```

## 4. Pins (up to a few hundred)

**Use GL layers (circle + symbol), not DOM markers [RAN + ADVICE].** Measured (`t10b`, 4x CPU throttle, software WebGL, so read as a trend only), one camera change, main-thread JS:

| Variant | n | sync ms (median / p95) | frame median ms | fps during pan |
|---|---|---|---|---|
| none | 0 | 0 / 0.6 | 33.3 | 29.5 |
| DOM markers | 100 | 1.3 / 2.1 | 33.3 | 26 |
| GL layers | 100 | 0 / 0.7 | 33.3 | 27.5 |
| DOM markers | 300 | 3.0 / 4.5 | **49.9** | 23 |
| GL layers | 300 | 0 / 0.7 | 33.4 | 27 |

DOM markers cost grows linearly with count and drops frames at 300 on a throttled CPU; GL cost stays flat. Real low-end phones were not measured.

```ts
// Feature properties: { id (UUIDv7), category, order (stop number or null) }
map.addSource('h-places', {type: 'geojson', data, promoteId: 'id'}); // promoteId is REQUIRED with UUID ids
// Type it: an untyped (or `as const`) array does not satisfy the paint types (TS2322).
const selected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];
map.addLayer({id: 'h-places-hit', type: 'circle', source: 'h-places',
  paint: {'circle-radius': 22, 'circle-opacity': 0}});             // 44 px tap target, invisible
map.addLayer({id: 'h-places-dot', type: 'circle', source: 'h-places', paint: {
  'circle-radius': ['case', selected, 18, 14],
  'circle-color': ['match', ['get', 'category'], 'food', '#e11d48', 'sight', '#2563eb', 'stay', '#16a34a', '#7c3aed'],
  'circle-stroke-width': ['case', selected, 4, 2], 'circle-stroke-color': '#ffffff'}});
map.addLayer({id: 'h-places-num', type: 'symbol', source: 'h-places', filter: ['has', 'order'],
  layout: {'text-field': ['to-string', ['get', 'order']], 'text-font': ['Noto Sans Bold'], 'text-size': 13,
    'text-allow-overlap': true, 'text-ignore-placement': true},
  paint: {'text-color': '#ffffff'}});
map.on('click', 'h-places-hit', (e) => selectPlace(e.features![0].properties.id as string)); // → URL param
// selection follows the URL param:
map.setFeatureState({source: 'h-places', id: previousId}, {selected: false});
map.setFeatureState({source: 'h-places', id: placeId}, {selected: true});
```

Verified **[RAN]** (`t11`, mouse and touch):
- Tap at the pin centre and 18 px off-centre (outside the 14 px dot, inside the 22 px hit circle) hit the pin; 30 px off missed. Map-level `click` fires as well, so the "tap empty map to deselect" handler must check `queryRenderedFeatures(e.point, {layers: ['h-places-hit']})` first.
- With `promoteId: 'id'`, `setFeatureState` with the UUID string worked and `queryRenderedFeatures` returned the UUID as `feature.id`. **Without `promoteId`, UUID strings in `Feature.id` were coerced: all three pins came back as id `193`** (the leading digits of `0193…`), so selection would hit the wrong pins. `setFeatureState` did not throw.
- Two taps under 500 ms and close together are a double-tap zoom; pins are not "double-clickable".
- Colours: category colours are paint data, so they follow the theme only if you swap them on theme change (`setPaintProperty`). Keep a white stroke for contrast on both basemaps.
- Numbers need the style's glyph server to have the font: `Noto Sans Bold` exists on OFM; VersaTiles calls it `noto_sans_bold`. [ADVICE] Alternative with no glyph dependency: draw badges as images with `map.setMissingStyleImageResolver` (v6; images it adds are regenerated after a style switch, **[RAN]** `t13`).

**Clustering [RAN]** (300 points, zoom 11): `cluster: true, clusterRadius: 50, clusterMaxZoom: 14` rendered 32 clusters + 2 single points; `getClusterExpansionZoom(id)` returns a **Promise** (resolved to 12). Use a separate clustered source for "all saved places" at low zoom; never cluster the current day's numbered stops (order must stay visible).

```ts
map.on('click', 'h-all-clusters', async (e) => {
  const f = e.features![0];
  const zoom = await map.getSource<GeoJSONSource>('h-all')!.getClusterExpansionZoom(f.properties.cluster_id);
  map.easeTo({center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom});
});
```

GL pins are not focusable or announced. Keyboard and screen-reader access is given by the equivalent list (section 10), not by the canvas. [ADVICE] Do not add hundreds of focusable DOM markers to fix this.

## 5. A day's route

Use one GeoJSON source per visible day (or one source with a `dayId` property and a `match` colour expression), casing under line, inserted **below** the pin layers (`addLayer(spec, 'h-places-hit')`). See `RouteLayer` in section 2. Day colours: a fixed palette indexed by day number, checked for contrast against both positron and dark [ADVICE].

Updates: `setData` returns a Promise in v6 and lost its second parameter (`waitForCompletion`). For small edits to a big collection, `updateData({add, remove, update})` needs feature ids (use `promoteId`). Route geometry changes as a whole: just `setData`.

**fitBounds with a bottom sheet [RAN]** (`t12`, 390x844, sheet 400 px, 444 px visible above it):

```ts
// When the sheet settles at a snap point (not on every drag frame):
map.easeTo({padding: {top: 0, right: 0, left: 0, bottom: sheetHeightPx}, duration: 200});
// Fitting the day: padding here is ADDED to the map's persistent padding.
const b = stops.reduce((acc, c) => acc.extend(c), new LngLatBounds(stops[0], stops[0]));
map.fitBounds(b, {padding: 24, maxZoom: 16, duration: reducedMotion ? 0 : 600});
```

- Map padding `bottom: 400` then `fitBounds(…, {padding: 24})` put all stops between y 117 and 327, inside the visible 444 px. Passing `padding: {bottom: 400 + 24, …}` straight to `fitBounds` gave the same result but does not persist for later `easeTo`/`flyTo`.
- `easeTo({padding})` alone (sheet snapping from 400 to 130) shifts the visual centre without refitting.
- Pitfall: `absolutePadding: true` (new in 6.12) with an **object** padding *replaces* the map padding: the stops landed at y 317–527, under the sheet. With a numeric padding it behaved like the default. Do not use `absolutePadding`.

## 6. Adding a pin

Since 6.11 maplibre fires the map `contextmenu` event on a touch long press (500 ms, single finger; a pan cancels it). **[RAN]** (`t14`, CDP touch events): hold 700 ms still → `contextmenu`, then a `click` when the finger lifts; hold 300 ms → `click` only; hold then drag 30 px → pan only; hold with 2 px jitter → `contextmenu`; mouse right-click → `contextmenu` only. So one handler covers long-press and right-click; suppress the click that ends a long press **[RAN]** (`t14b`: draft opened, the lift-click was ignored, the next tap was handled; right-click then left-click was handled normally):

```ts
let touchActive = false;
let ignoreNextClick = false;
map.on('touchstart', () => { touchActive = true; ignoreNextClick = false; });
map.on('touchend', (e) => { if (e.points.length === 0) touchActive = false; });
map.on('touchcancel', () => { touchActive = false; });
map.on('contextmenu', (e) => {
  ignoreNextClick = touchActive;             // a long press ends with a click on lift; right-click does not
  openDraft(e.lngLat.lng, e.lngLat.lat);     // [lng, lat] order everywhere
});
map.on('click', (e) => {
  if (ignoreNextClick) { ignoreNextClick = false; return; }
  // normal click: select a pin or clear the selection
});
```

No `preventDefault` needed for the browser menu **[SRC]**: while any `contextmenu` listener is registered, maplibre calls `preventDefault()` on the native event itself, and it suppresses the native one during a touch.

Draft marker **[RAN]** (`t16`): a default `new Marker({draggable: true})` is `role="button"`, `tabindex="0"`, `aria-label="Map marker"` (override it: `marker.getElement().setAttribute('aria-label', t('map.draftPin'))`) and, since 6.4, moves with arrow keys (Shift = 10 px); each key press fired `dragend`. Read the final position on `dragend` with `marker.getLngLat()`. Remove it with `marker.remove()` when the draft form closes.

[ADVICE] Long-press and right-click are invisible gestures: also offer an explicit "Add a place here" button that drops the draft at the map centre (above the sheet: use `map.getCenter()`, which honours padding) and a search box. Do not use plain left-click/tap to add pins: it fights selection and accidental taps during panning.

## 7. Touch and mobile

- **touch-action [SRC]**: maplibre's CSS sets `touch-action: none` on the canvas when drag-pan and touch zoom/rotate are on, `pan-x pan-y` / `pinch-zoom` when one is off. Do not override it; import the CSS.
- **Gestures [ADVICE]**: full-screen trip map: default gestures, **no** cooperative gestures. Disable rotation and pitch for travellers who expect north-up: `dragRotate: false, pitchWithRotate: false, touchPitch: false` and `map.touchZoomRotate.disableRotation()`. Small embedded maps inside scrolling pages (a place page, a public trip): `cooperativeGestures: true` so one-finger scroll passes to the page (its help texts are in `locale`: `CooperativeGesturesHandler.MobileHelpText` etc., translate them).
- **Pixel ratio and memory [ADVICE, option names SRC]**: `pixelRatio: Math.min(window.devicePixelRatio, 2)` (a 3x phone otherwise renders 2.25x the pixels); `maxTileCacheSize` lower on low-memory devices; one map instance per screen; `remove()` on unmount. v6 uses 1 worker except Safari (half the cores, max 3) **[SRC]**. `prewarm()` keeps the worker alive between map screens; optional. 6.8+ warns once when the canvas is clamped to `maxCanvasSize`.
- **Low-end and failure [RAN]**: WebGL2 is mandatory in v6. With WebGL2 disabled the constructor throws `GPUInitializationError` ("WebGL2 is required…"), leaving the container empty; the wrapper catches it and the list view remains (`t15`). 6.16 fixed a map shrinking to 1 px when a mobile browser returns from the background (context loss) and maps that stopped loading after iOS suspended them **[SRC]**: stay on ≥ 6.16.
- **Geolocation [RAN]** (`t16`, faked position): `new GeolocateControl({positionOptions: {enableHighAccuracy: true}, trackUserLocation: false, fitBoundsOptions: {maxZoom: 15}})`; the button's accessible name is "Find my location" (translate via `locale`), it fired `geolocate` with the coords and flew to zoom 15. Needs HTTPS (or localhost) and the user's permission; handle the `error` event with a toast.
- **Reduced motion**: the v6 `reduceMotion` map option only disables gesture inertia and defaults to the device setting **[SRC]**; our own `easeTo`/`fitBounds`/`flyTo` animations are not covered, so pass `duration: 0` when `prefers-reduced-motion: reduce` matches [ADVICE].

## 8. Light/dark switch without losing our layers

**[RAN]** (`t13`, positron → dark, with our route casing/line, places dot/number, feature-state, a manual image and a resolver image):

| Strategy | Our layers after | On top | Latest data | feature-state | `addImage` image |
|---|---|---|---|---|---|
| `setStyle(url)` | **gone** | – | – | – | kept |
| `setStyle(url, {transformStyle: keep})` (diff, default) | all 5 | yes | yes (2 of 2) | **kept** | kept |
| same with `diff: false` | all 5 | yes | yes | **lost** | **lost** |

```ts
const OURS = 'h-'; // prefix of every source and layer id we own
export const keepOurLayers: TransformStyleFunction = (previous, next) => ({
  ...next,
  sources: {...next.sources, ...Object.fromEntries(
    Object.entries(previous?.sources ?? {}).filter(([id]) => id.startsWith(OURS)))},
  layers: [...next.layers, ...(previous?.layers ?? []).filter((l) => l.id.startsWith(OURS))],
});
const styleFor = (lang: 'pt' | 'en'): TransformStyleFunction => (prev, next) =>
  keepOurLayers(prev, localizeLabels(lang)(prev, next));
map.setStyle(THEME_URL[theme], {transformStyle: styleFor(lang)});
```

Pitfalls: `map.getStyle()`-time data is what is carried, and it was the latest `setData` result. Theme-dependent paint values of our layers (route casing colour, pin stroke) must be updated after `style.load`. Switch on the resolved theme (user override → `prefers-color-scheme`), and only when it actually changes.

## 9. Testing

**Unit (Vitest + jsdom) [RAN]** (scratch project `scratchpad/w3-jsdom` with Heremita's exact versions: vitest 5.1.0, jsdom 31.0.1, @testing-library/react 16.3.3, @vitejs/plugin-react 6.3.0, vite 8.3.8, React 19.3.1; 2 tests passed):
- **Unmocked**, the real maplibre-gl imports fine under jsdom (Vite handles the CSS import and `new URL(…, import.meta.url)`), and `new MapLibreMap()` throws `GPUInitializationError`; the wrapper's `failed` state and `role="alert"` rendered. Use this for the "no WebGL" test. jsdom prints a harmless `Not implemented: HTMLCanvasElement's getContext()` line.
- **Mocked** for everything else: a fake map that records calls and lets the test fire `load`. Results under `<StrictMode>`: the map effect ran twice (2 fakes, the first `remove()`d); the child that appears after `load` was mounted, unmounted and mounted again while the map was alive (addLayer 2, removeLayer 1) so its cleanup must be correct, not just guarded; on unmount the parent's `remove()` ran first and the guarded child cleanup skipped; selection re-render called `setFeatureState({source: 'h-places', id}, {selected: true})`.

```tsx
const maps = vi.hoisted(() => [] as FakeMap[]);
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  // a `function`, not an arrow: the wrapper calls it with `new`
  MapLibreMap: vi.fn(function (options: MapOptions) { const f = makeFakeMap(options); maps.push(f); return f; }),
}));
// makeFakeMap: on/once store listeners; fire(type) calls them; addSource/addLayer/removeLayer/
// removeSource/setFeatureState are vi.fn() that THROW after remove() (as the real map does);
// getSource(id) returns {setData: vi.fn(() => Promise.resolve())}.

render(<StrictMode><MapView …><PlacesLayer places={places} selectedId={null} /></MapView></StrictMode>);
act(() => maps.at(-1)!.fire('load'));
expect(screen.getByTestId('map')).toHaveAttribute('data-map-state', 'ready');
```

Keep pure logic (GeoJSON building, bounds, colour per day, `keepOurLayers`, `localizeLabels`, the long-press click suppression) in plain modules and test those without any map.

**E2E (Playwright) [RAN]**: headless Chromium 159 gives WebGL2 through SwiftShader with **no extra flags** (all `t*` scripts). Wait for the map, then for idle:

```ts
await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
await page.evaluate(async () => {           // needs a test-only window hook to the map
  const map = (window as any).__heremitaMap;
  if (!map.loaded() || !map.areTilesLoaded() || map.isMoving()) await map.once('idle');
});
```

- `idle` only fires after something rendered; if nothing is pending it never comes. Call `map.triggerRepaint()` before waiting, or check `loaded()` first, and always race a timeout (the first `t10` hung for 400 s on this).
- Never give the container `id="map"`: `window.map` then points at the element (named access).
- GL pins are not in the DOM: assert through the equivalent list (role-based queries), the URL params, and `data-map-state`; for pixel-level checks use `queryRenderedFeatures` via the hook. DOM markers (draft pin, controls) can be queried by role (`getByRole('button', {name: 'Find my location'})`).
- Run E2E against the fake geocoding/routing providers; the basemap itself still loads from OpenFreeMap. [ADVICE] For hermetic runs, intercept `tiles.openfreemap.org` with `page.route` and serve a minimal local style (`{version: 8, sources: {}, layers: [{id: 'bg', type: 'background'}]}`).
- Touch: `browser.newContext({hasTouch: true, isMobile: true})` and `page.touchscreen.tap`; long press needs CDP `Input.dispatchTouchEvent` (start, wait 700 ms, end), as in `t14`. Leave ≥ 500 ms between taps or they become a double-tap zoom.

## 10. Accessibility of the map region

- **[RAN]** The canvas gets `role="region"`, `tabindex="0"` and `aria-label` from `locale['Map.Title']` (our wrapper passes the translated label; it showed "Trip map"). Translate every control string through the `locale` option (keys: `NavigationControl.ZoomIn`, `GeolocateControl.FindMyLocation`, `Marker.Title`, `AttributionControl.ToggleAttribution`, `Popup.Close`, cooperative-gesture help texts…).
- Keyboard on the focused canvas: `+`/`-` zoom **[RAN]**; arrow-key panning moved the map in one run and not in a re-run, so treat it as unverified.
- **Equivalent non-map list [ADVICE]**: the day's stops as an ordered list (`<ol>`) in the sheet, each item a link/button that sets the `place` URL param (which selects the pin and eases the map). It is the primary keyboard and screen-reader path; the map is a visual enhancement. Announce selection changes in the list, not from the canvas.
- Focus order: put the list (sheet) before the map in DOM order or provide a "Skip map" link; the map is one tab stop, the controls follow it.
- The map is not a "no-WebGL" dead end: the `failed` state shows a message (`role="alert"`) and the list still works.
- Contrast: pin colours with a white stroke on both basemaps; selection shown by size **and** stroke width, not colour alone.

## 11. maplibre-gl 5 → 6 changes that matter here [SRC]

- ESM only: no UMD/CSP bundle, no `require()`, no default export. The worker is a separate `.mjs` (`setWorkerUrl`); a CSP no longer needs `worker-src blob:`.
- WebGL2 required (`GPUInitializationError`).
- `styleimagemissing` is notify-only; supply images with `map.setMissingStyleImageResolver`.
- `GeoJSONSource.setData(data)` has no second parameter and returns a Promise (no chaining).
- `map.transform` removed; events are real classes (`MapStyleLoadEvent`, typed `Marker`/`Popup`/`GeolocateControl` events); `MapDataEvent` removed.
- Style spec v25 warns on legacy expressions (OFM styles log three harmless US-shield `filter` warnings).
- `zoomLevelsToOverscale` defaults to 4 (may change some `queryRenderedFeatures` results); nested GeoJSON properties round-trip; paint/layout property types are precise; `hash` rewritten (we do not use it).
- Added in 6.x and used above: `role=button` markers (6.1), keyboard-movable draggable markers (6.4), long-press `contextmenu` (6.11), `absolutePadding` (6.12, avoid), constructor `transformStyle` and mobile context-loss fixes (6.16).

## 12. Do / don't

Do:
- Load the map with `next/dynamic({ssr: false})` from a Client Component and call `setWorkerUrl` once at module level.
- Create the map in one effect, `remove()` it in the cleanup, and guard child cleanups with `isMapAlive`.
- Add `@types/geojson` and `"geojson"` to `types` in `apps/web/tsconfig.json`.
- Use GL circle/symbol layers with `promoteId: 'id'`, a 22 px transparent hit circle, and feature-state for selection.
- Keep the map full-height; express the bottom sheet as map padding; `fitBounds` with a small extra padding.
- Switch styles with `setStyle(url, {transformStyle})` that keeps `h-` sources/layers and rewrites labels.
- Offer an ordered list of stops as the accessible equivalent, and an explicit "add place here" button.
- Wait for `idle` with a timeout in E2E tests, after `triggerRepaint()`.

Don't:
- Don't construct `Map` during render or at module level, or use `require('maplibre-gl')` / a default import.
- Don't use string UUIDs as `Feature.id` without `promoteId`.
- Don't hand-write DOM markers for hundreds of pins, or call `resize()` on every sheet drag frame.
- Don't use `absolutePadding`, `diff: false` on theme switches, or plain `setStyle(url)` when our layers are on the map.
- Don't use `/styles/dark-matter`, `/light`, `/osm-bright` or `/3d` on OpenFreeMap (404), or `tile.openstreetmap.org` as a fallback.
- Don't hide the attribution under the bottom sheet.
- Don't depend on a React map library that reaches into maplibre's private fields.
