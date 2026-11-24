import {
  GPUInitializationError,
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { localizeLabels, styleUrl, type LabelLanguage, type MapTheme } from './basemap';
import { attachBasemap, type BasemapController } from './basemap-controller';
import { boundsOf, type LngLat } from './geo';
import { STATIC_MAP_SIZE } from './static-map-size';
import type { ExpressionSpecification } from './style-types';
import { readToken } from './tokens';

// A bundled MapLibre cannot find its web worker by itself (same value as map-view.tsx).
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

const MAX_PIXEL_RATIO = 2;
const FIT_PADDING_PX = 28;
const FIT_MAX_ZOOM = 15;
const SINGLE_POINT_ZOOM = 14;
/** A job that never settles (both basemaps unreachable) gives up here. */
const JOB_TIMEOUT_MS = 15_000;
/** The hidden map and its WebGL context go away this long after the last job. */
const DISPOSE_AFTER_MS = 30_000;
const CACHE_MAX = 80;
const JPEG_QUALITY = 0.86;

const SOURCE = 'h-thumb';
const CASING_LAYER = 'h-thumb-casing';
const LINE_LAYER = 'h-thumb-line';
const DOT_LAYER = 'h-thumb-dot';
const PIN_STROKE = '#ffffff';
const LINE_DASHES = [1, 1.5];

export interface StaticMapRequest {
  /** Pins in visit order; at least one. */
  points: readonly LngLat[];
  theme: MapTheme;
  language: LabelLanguage;
}

function cacheKey({ points, theme, language }: StaticMapRequest): string {
  return `${theme}|${language}|${points.map(([lng, lat]) => `${lng},${lat}`).join(';')}`;
}

function toFeatureCollection(points: readonly LngLat[]): GeoJSON.FeatureCollection {
  const line: GeoJSON.Feature<GeoJSON.LineString>[] =
    points.length > 1
      ? [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: points.map(([lng, lat]) => [lng, lat]) },
            properties: { kind: 'line' },
          },
        ]
      : [];
  const dots: GeoJSON.Feature<GeoJSON.Point>[] = points.map(([lng, lat], index) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { kind: 'dot', start: index === 0 },
  }));
  return { type: 'FeatureCollection', features: [...line, ...dots] };
}

function nextEvent(map: MapLibreMap, type: 'load' | 'style.load' | 'idle'): Promise<void> {
  return new Promise((resolve) => {
    map.once(type, () => resolve());
  });
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('static map timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Paints the WebGL frame over an opaque surface-coloured canvas (a style
 * without a background layer, or one still loading, is transparent) and
 * encodes it as a JPEG object URL.
 */
async function encodeSnapshot(map: MapLibreMap): Promise<string> {
  const frame = map.getCanvas();
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas unavailable');
  }
  context.fillStyle = readToken('--color-surface');
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(frame, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) {
    throw new Error('snapshot encoding failed');
  }
  return URL.createObjectURL(blob);
}

/**
 * One hidden, non-interactive MapLibre map that draws trips one after the
 * other and hands back a picture of each: the basemap of the trip's area with
 * its places as pins joined in visit order. One WebGL context for every card
 * on a page instead of one per card (browsers allow about sixteen).
 */
class StaticMapRenderer {
  private readonly container: HTMLDivElement;
  private readonly map: MapLibreMap;
  private readonly basemap: BasemapController;
  private readonly loaded: Promise<void>;
  private theme: MapTheme;
  private language: LabelLanguage;
  private chain: Promise<unknown> = Promise.resolve();
  disposed = false;

  constructor(initial: { theme: MapTheme; language: LabelLanguage }) {
    this.theme = initial.theme;
    this.language = initial.language;
    this.container = document.createElement('div');
    this.container.setAttribute('aria-hidden', 'true');
    this.container.inert = true;
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      width: `${STATIC_MAP_SIZE.width}px`,
      height: `${STATIC_MAP_SIZE.height}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.container);
    try {
      this.map = new MapLibreMap({
        container: this.container,
        style: styleUrl('primary', initial.theme),
        transformStyle: localizeLabels(initial.language),
        center: [0, 0],
        zoom: 1,
        interactive: false,
        attributionControl: false,
        trackResize: false,
        fadeDuration: 0,
        pixelRatio: Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO),
        // The frame must still be there when the snapshot reads it.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch (error) {
      this.container.remove();
      throw error;
    }
    this.loaded = nextEvent(this.map, 'load');
    this.basemap = attachBasemap(this.map, initial, () => undefined);
  }

  /** Queues one trip; jobs run one at a time on the single map. */
  render(request: StaticMapRequest): Promise<string> {
    const job = () => withTimeout(this.draw(request), JOB_TIMEOUT_MS);
    const result = this.chain.then(job, job);
    this.chain = result.catch(() => undefined);
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.map.remove();
    this.container.remove();
  }

  private async draw({ points, theme, language }: StaticMapRequest): Promise<string> {
    await this.loaded;
    if (theme !== this.theme || language !== this.language) {
      const swapped = nextEvent(this.map, 'style.load');
      this.basemap.show(theme, language);
      this.theme = theme;
      this.language = language;
      await swapped;
    }
    this.ensureLayers();
    this.paint();
    this.frame(points);
    await this.map.getSource<GeoJSONSource>(SOURCE)?.setData(toFeatureCollection(points));
    const idle = nextEvent(this.map, 'idle');
    this.map.triggerRepaint();
    await idle;
    return encodeSnapshot(this.map);
  }

  /** Our source and layers, added once; a style switch carries them over (`keepOurLayers`). */
  private ensureLayers(): void {
    if (this.map.getSource(SOURCE)) {
      return;
    }
    this.map.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    const isLine: ExpressionSpecification = ['==', ['get', 'kind'], 'line'];
    const isDot: ExpressionSpecification = ['==', ['get', 'kind'], 'dot'];
    this.map.addLayer({
      id: CASING_LAYER,
      type: 'line',
      source: SOURCE,
      filter: isLine,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-width': 5 },
    });
    this.map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE,
      filter: isLine,
      layout: { 'line-join': 'round' },
      paint: { 'line-width': 2.5, 'line-dasharray': LINE_DASHES },
    });
    this.map.addLayer({
      id: DOT_LAYER,
      type: 'circle',
      source: SOURCE,
      filter: isDot,
      paint: {
        'circle-radius': ['case', ['get', 'start'], 7, 5.5],
        'circle-stroke-width': 2,
        'circle-stroke-color': PIN_STROKE,
      },
    });
  }

  /** Colours follow the page's tokens (theme) at draw time: teal pins, the first one coral. */
  private paint(): void {
    const pin = readToken('--color-primary');
    this.map.setPaintProperty(CASING_LAYER, 'line-color', readToken('--color-route-casing'));
    this.map.setPaintProperty(LINE_LAYER, 'line-color', pin);
    this.map.setPaintProperty(DOT_LAYER, 'circle-color', [
      'case',
      ['get', 'start'],
      readToken('--color-accent'),
      pin,
    ]);
  }

  private frame(points: readonly LngLat[]): void {
    const bounds = boundsOf(points);
    const [first] = points;
    if (!bounds || !first) {
      return;
    }
    if (points.length === 1) {
      this.map.jumpTo({ center: [first[0], first[1]], zoom: SINGLE_POINT_ZOOM });
      return;
    }
    const camera = this.map.cameraForBounds(bounds, {
      padding: FIT_PADDING_PX,
      maxZoom: FIT_MAX_ZOOM,
    });
    if (camera) {
      this.map.jumpTo(camera);
    }
  }
}

let renderer: StaticMapRenderer | null = null;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;
/** WebGL refused once: every later request fails at once, without a second try. */
let unavailable = false;
const pending = new Map<string, Promise<string>>();
/** Finished pictures by request, insertion-ordered so the oldest goes first. */
const cache = new Map<string, string>();

function remember(key: string, url: string): void {
  cache.set(key, url);
  if (cache.size > CACHE_MAX) {
    const [oldest] = cache.keys();
    if (oldest !== undefined) {
      const stale = cache.get(oldest);
      cache.delete(oldest);
      if (stale) {
        URL.revokeObjectURL(stale);
      }
    }
  }
}

function rendererFor(request: StaticMapRequest): StaticMapRenderer {
  if (renderer === null || renderer.disposed) {
    renderer = new StaticMapRenderer(request);
  }
  return renderer;
}

function scheduleDispose(): void {
  clearTimeout(disposeTimer);
  disposeTimer = setTimeout(() => {
    if (pending.size === 0) {
      renderer?.dispose();
      renderer = null;
    }
  }, DISPOSE_AFTER_MS);
}

/**
 * A picture (object URL, JPEG) of `points` on the basemap: the trip card's
 * map. Cached for the session by points, theme and label language, so a
 * feed re-render or a second page of the same list costs nothing. Rejects
 * when WebGL is missing or the basemap never answers; callers keep their
 * placeholder then.
 */
export function renderStaticMap(request: StaticMapRequest): Promise<string> {
  const key = cacheKey(request);
  const known = cache.get(key);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    return inFlight;
  }
  if (unavailable) {
    return Promise.reject(new Error('static maps unavailable'));
  }
  clearTimeout(disposeTimer);

  let target: StaticMapRenderer;
  try {
    target = rendererFor(request);
  } catch (error) {
    if (error instanceof GPUInitializationError) {
      unavailable = true;
    }
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  const work = target
    .render(request)
    .then((url) => {
      remember(key, url);
      return url;
    })
    .catch((error: unknown) => {
      // A map that stalled is not trusted again: the next request starts a fresh one.
      target.dispose();
      if (renderer === target) {
        renderer = null;
      }
      throw error;
    })
    .finally(() => {
      pending.delete(key);
      scheduleDispose();
    });
  pending.set(key, work);
  return work;
}

/** Test support: forgets every picture and drops the hidden map. */
export function resetStaticMaps(): void {
  clearTimeout(disposeTimer);
  renderer?.dispose();
  renderer = null;
  unavailable = false;
  pending.clear();
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
}
