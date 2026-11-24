import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { styleUrl } from './basemap';
import { renderStaticMap, resetStaticMaps } from './static-map';
import {
  createdMaps,
  failNextMap,
  GPUInitializationError,
  latestMap,
  resetFakeMaps,
} from './testing/fake-maplibre';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

const LISBON = { points: [[-9.1365, 38.7077] as const, [-9.1335, 38.7139] as const] };
const request = (overrides: Partial<Parameters<typeof renderStaticMap>[0]> = {}) => ({
  ...LISBON,
  theme: 'light' as const,
  language: 'en' as const,
  ...overrides,
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

let urls = 0;

beforeEach(() => {
  urls = 0;
  // jsdom has no canvas: the snapshot's 2D drawing and encoding are stubbed.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: () => undefined,
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) {
    callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
  };
  URL.createObjectURL = vi.fn(() => {
    urls += 1;
    return `blob:map-${urls}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  resetStaticMaps();
  resetFakeMaps();
  vi.restoreAllMocks();
});

/** Lets the renderer get past `load`, push its data and ask for a frame. */
async function loadAndSettle() {
  const map = latestMap();
  map.load();
  await nextTask();
  map.fire('idle');
  await nextTask();
  return map;
}

describe('renderStaticMap', () => {
  it('draws_the_places_on_a_hidden_non_interactive_map_once_it_is_idle', async () => {
    const picture = renderStaticMap(request());
    const map = latestMap();

    expect(map.options).toMatchObject({
      interactive: false,
      attributionControl: false,
      style: styleUrl('primary', 'light'),
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const container = map.options.container as HTMLElement;
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(container.inert).toBe(true);

    await loadAndSettle();

    await expect(picture).resolves.toBe('blob:map-1');
    const data = map.getSource('h-thumb')?.data as GeoJSON.FeatureCollection;
    expect(data.features.map((feature) => feature.geometry.type)).toEqual([
      'LineString',
      'Point',
      'Point',
    ]);
    expect(map.jumps).toEqual([
      { center: [expect.closeTo(-9.135, 4), expect.closeTo(38.7108, 4)], zoom: 12 },
    ]);
    expect(map.getLayer('h-thumb-dot')?.paint['circle-stroke-color']).toBe('#ffffff');
  });

  it('centres_one_place_at_street_level', async () => {
    const picture = renderStaticMap(request({ points: [[-9.1365, 38.7077]] }));
    const map = await loadAndSettle();

    await expect(picture).resolves.toBe('blob:map-1');
    expect(map.jumps).toEqual([{ center: [-9.1365, 38.7077], zoom: 14 }]);
    const data = map.getSource('h-thumb')?.data as GeoJSON.FeatureCollection;
    expect(data.features).toHaveLength(1);
  });

  it('serves_the_same_trip_from_the_cache_without_drawing_again', async () => {
    const first = renderStaticMap(request());
    await loadAndSettle();
    await expect(first).resolves.toBe('blob:map-1');

    await expect(renderStaticMap(request())).resolves.toBe('blob:map-1');
    expect(createdMaps).toHaveLength(1);
    expect(latestMap().jumps).toHaveLength(1);
  });

  it('shares_one_map_between_trips_drawn_one_after_the_other', async () => {
    const first = renderStaticMap(request());
    const second = renderStaticMap(request({ points: [[2.35, 48.85]] }));
    const map = await loadAndSettle();
    await expect(first).resolves.toBe('blob:map-1');

    map.fire('idle');
    await expect(second).resolves.toBe('blob:map-2');
    expect(createdMaps).toHaveLength(1);
    expect(map.jumps).toHaveLength(2);
  });

  it('switches_the_basemap_before_drawing_in_another_theme_or_language', async () => {
    const light = renderStaticMap(request());
    const map = await loadAndSettle();
    await expect(light).resolves.toBe('blob:map-1');

    const dark = renderStaticMap(request({ theme: 'dark', language: 'pt' }));
    await nextTask();
    expect(map.styleCalls.at(-1)?.url).toBe(styleUrl('primary', 'dark'));
    expect(map.jumps).toHaveLength(1);

    map.fire('style.load');
    await nextTask();
    map.fire('idle');
    await expect(dark).resolves.toBe('blob:map-2');
    expect(map.jumps).toHaveLength(2);
  });

  it('fails_at_once_without_webgl_and_never_tries_again', async () => {
    failNextMap(new GPUInitializationError('no WebGL 2'));

    await expect(renderStaticMap(request())).rejects.toBeInstanceOf(GPUInitializationError);
    await expect(renderStaticMap(request({ points: [[2.35, 48.85]] }))).rejects.toThrow(
      'unavailable',
    );
    expect(createdMaps).toHaveLength(1);
    expect(document.querySelector('[aria-hidden="true"][inert]')).toBeNull();
  });
});
