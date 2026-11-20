/**
 * A stand-in for `maplibre-gl` in jsdom tests (jsdom has no WebGL):
 * `vi.mock('maplibre-gl', () => import('@/shared/map/testing/fake-maplibre'))`.
 * It records what the code asks of the map and, like the real map, throws
 * when used after `remove()`. Tests drive it with `fire()`.
 */

type Listener = (event: Record<string, unknown>) => void;

interface Registration {
  type: string;
  layer: string | undefined;
  listener: Listener;
  once: boolean;
}

export interface FakeLayer {
  id: string;
  type: string;
  source?: string;
  beforeId: string | undefined;
  filter?: unknown;
  layout: Record<string, unknown>;
  paint: Record<string, unknown>;
}

export interface FakeSource {
  spec: Record<string, unknown>;
  data: unknown;
  setData(data: unknown): Promise<void>;
  getClusterExpansionZoom(clusterId: number): Promise<number>;
}

export interface FakeFeature {
  id?: string | number;
  layer: { id: string };
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

class Evented {
  private registrations: Registration[] = [];

  on(type: string, layerOrListener: string | Listener, maybeListener?: Listener): this {
    this.register(type, layerOrListener, maybeListener, false);
    return this;
  }

  once(type: string, layerOrListener: string | Listener, maybeListener?: Listener): this {
    this.register(type, layerOrListener, maybeListener, true);
    return this;
  }

  off(type: string, layerOrListener: string | Listener, maybeListener?: Listener): this {
    const listener = typeof layerOrListener === 'string' ? maybeListener : layerOrListener;
    this.registrations = this.registrations.filter(
      (registration) => registration.type !== type || registration.listener !== listener,
    );
    return this;
  }

  /** Calls the listeners of `type` (map-level ones, or those of `layer`) with `data`. */
  fire(type: string, data: Record<string, unknown> = {}, layer?: string): void {
    const matching = this.registrations.filter(
      (registration) => registration.type === type && registration.layer === layer,
    );
    this.registrations = this.registrations.filter(
      (registration) => !(registration.once && matching.includes(registration)),
    );
    for (const { listener } of matching) {
      listener({ type, target: this, ...data });
    }
  }

  listenerCount(type: string): number {
    return this.registrations.filter((registration) => registration.type === type).length;
  }

  private register(
    type: string,
    layerOrListener: string | Listener,
    maybeListener: Listener | undefined,
    once: boolean,
  ): void {
    if (typeof layerOrListener === 'string') {
      if (maybeListener) {
        this.registrations.push({ type, layer: layerOrListener, listener: maybeListener, once });
      }
      return;
    }
    this.registrations.push({ type, layer: undefined, listener: layerOrListener, once });
  }
}

export class GPUInitializationError extends Error {}

export class AJAXError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
  ) {
    super(`AJAXError: ${statusText} (${status}): ${url}`);
  }
}

export class AttributionControl {
  constructor(readonly options: Record<string, unknown> = {}) {}
}

export class NavigationControl {
  constructor(readonly options: Record<string, unknown> = {}) {}
}

export class GeolocateControl extends Evented {
  constructor(readonly options: Record<string, unknown> = {}) {
    super();
  }
}

export function setWorkerUrl(): void {}

export class Map extends Evented {
  removed = false;
  readonly controls: { control: unknown; position: string | undefined }[] = [];
  readonly layers: FakeLayer[] = [];
  readonly sources = new globalThis.Map<string, FakeSource>();
  readonly featureState = new globalThis.Map<string, Record<string, unknown>>();
  readonly styleCalls: { url: string; options: Record<string, unknown> | undefined }[] = [];
  readonly cameraCalls: { method: 'easeTo' | 'fitBounds'; args: unknown[] }[] = [];
  readonly touchZoomRotate = {
    rotationDisabled: false,
    disableRotation: () => this.disableRotation(),
  };
  readonly canvasContainer = document.createElement('div');
  glyphs: string | undefined = 'https://tiles.example/fonts/{fontstack}/{range}.pbf';
  renderedFeatures: FakeFeature[] = [];

  constructor(readonly options: Record<string, unknown>) {
    super();
    createdMaps.push(this);
    if (constructorFailure) {
      const failure = constructorFailure;
      constructorFailure = null;
      throw failure;
    }
    const container = options.container as HTMLElement;
    container.appendChild(this.canvasContainer);
  }

  addControl(control: unknown, position?: string): this {
    this.assertAlive();
    this.controls.push({ control, position });
    return this;
  }

  addSource(id: string, spec: Record<string, unknown>): this {
    this.assertAlive();
    if (this.sources.has(id)) {
      throw new Error(`Source "${id}" already exists.`);
    }
    const source: FakeSource = {
      spec,
      data: spec.data,
      setData: (data) => {
        source.data = data;
        return Promise.resolve();
      },
      getClusterExpansionZoom: () => Promise.resolve(13),
    };
    this.sources.set(id, source);
    return this;
  }

  getSource(id: string): FakeSource | undefined {
    return this.sources.get(id);
  }

  removeSource(id: string): this {
    this.assertAlive();
    if (this.layers.some((layer) => layer.source === id)) {
      throw new Error(`Source "${id}" cannot be removed while a layer uses it.`);
    }
    if (!this.sources.delete(id)) {
      throw new Error(`There is no source with ID "${id}".`);
    }
    for (const key of [...this.featureState.keys()].filter((k) => k.startsWith(`${id}:`))) {
      this.featureState.delete(key);
    }
    return this;
  }

  addLayer(
    spec: Omit<FakeLayer, 'beforeId' | 'layout' | 'paint'> & {
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
    },
    beforeId?: string,
  ): this {
    this.assertAlive();
    if (this.getLayer(spec.id)) {
      throw new Error(`Layer "${spec.id}" already exists.`);
    }
    const layer: FakeLayer = {
      ...spec,
      beforeId,
      layout: { ...spec.layout },
      paint: { ...spec.paint },
    };
    const index = beforeId ? this.layers.findIndex(({ id }) => id === beforeId) : -1;
    if (index === -1) {
      this.layers.push(layer);
    } else {
      this.layers.splice(index, 0, layer);
    }
    return this;
  }

  getLayer(id: string): FakeLayer | undefined {
    return this.layers.find((layer) => layer.id === id);
  }

  removeLayer(id: string): this {
    this.assertAlive();
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index === -1) {
      throw new Error(`There is no layer with ID "${id}".`);
    }
    this.layers.splice(index, 1);
    return this;
  }

  setPaintProperty(layerId: string, name: string, value: unknown): this {
    this.requireLayer(layerId).paint[name] = value;
    return this;
  }

  setLayoutProperty(layerId: string, name: string, value: unknown): this {
    this.requireLayer(layerId).layout[name] = value;
    return this;
  }

  setFeatureState(target: { source: string; id: string }, state: Record<string, unknown>): this {
    this.assertAlive();
    if (!this.sources.has(target.source)) {
      throw new Error(`The source "${target.source}" does not exist in the map's style.`);
    }
    const key = `${target.source}:${target.id}`;
    this.featureState.set(key, { ...this.featureState.get(key), ...state });
    return this;
  }

  getFeatureState(target: { source: string; id: string }): Record<string, unknown> {
    return this.featureState.get(`${target.source}:${target.id}`) ?? {};
  }

  queryRenderedFeatures(_point: unknown, options: { layers: string[] }): FakeFeature[] {
    return this.renderedFeatures.filter((feature) => options.layers.includes(feature.layer.id));
  }

  setStyle(url: string, options?: Record<string, unknown>): this {
    this.assertAlive();
    this.styleCalls.push({ url, options });
    return this;
  }

  getStyle() {
    return { version: 8, glyphs: this.glyphs, sources: {}, layers: [] };
  }

  easeTo(...args: unknown[]): this {
    this.cameraCalls.push({ method: 'easeTo', args });
    return this;
  }

  fitBounds(...args: unknown[]): this {
    this.cameraCalls.push({ method: 'fitBounds', args });
    return this;
  }

  getCanvasContainer(): HTMLElement {
    return this.canvasContainer;
  }

  remove(): void {
    this.removed = true;
    this.canvasContainer.remove();
  }

  /** The style finished loading and the map is ready: `style.load` then `load`. */
  load(): void {
    this.fire('style.load');
    this.fire('load');
  }

  private disableRotation(): void {
    this.touchZoomRotate.rotationDisabled = true;
  }

  private requireLayer(id: string): FakeLayer {
    this.assertAlive();
    const layer = this.getLayer(id);
    if (!layer) {
      throw new Error(`The layer "${id}" does not exist in the map's style.`);
    }
    return layer;
  }

  private assertAlive(): void {
    if (this.removed) {
      throw new TypeError("Cannot read properties of undefined (reading 'getLayer')");
    }
  }
}

export class Marker extends Evented {
  private readonly element = document.createElement('div');
  private lngLat: [number, number] = [0, 0];
  map: Map | null = null;

  constructor(readonly options: Record<string, unknown> = {}) {
    super();
    createdMarkers.push(this);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setLngLat(lngLat: [number, number]): this {
    this.lngLat = lngLat;
    return this;
  }

  getLngLat(): { lng: number; lat: number } {
    return { lng: this.lngLat[0], lat: this.lngLat[1] };
  }

  addTo(map: Map): this {
    this.map = map;
    if (this.options.draggable) {
      this.element.setAttribute('role', 'button');
      this.element.setAttribute('tabindex', '0');
    }
    map.getCanvasContainer().appendChild(this.element);
    return this;
  }

  remove(): this {
    this.element.remove();
    this.map = null;
    return this;
  }
}

/** Every map and marker constructed since the last `resetFakeMaps()`, in order. */
export const createdMaps: Map[] = [];
const createdMarkers: Marker[] = [];
let constructorFailure: Error | null = null;

/** The next `new Map()` throws `error` (e.g. a `GPUInitializationError`). */
export function failNextMap(error: Error): void {
  constructorFailure = error;
}

export function resetFakeMaps(): void {
  createdMaps.length = 0;
  createdMarkers.length = 0;
  constructorFailure = null;
}

/** The newest map; throws when none was created. */
export function latestMap(): Map {
  const map = createdMaps.at(-1);
  if (!map) {
    throw new Error('No map was created');
  }
  return map;
}

export function latestMarker(): Marker {
  const marker = createdMarkers.at(-1);
  if (!marker) {
    throw new Error('No marker was created');
  }
  return marker;
}
