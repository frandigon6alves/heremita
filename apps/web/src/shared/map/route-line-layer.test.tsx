import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { PinsLayer } from './pins-layer';
import { RouteLineLayer, type MapRouteLine } from './route-line-layer';
import { createdMaps, resetFakeMaps, type Map as FakeMap } from './testing/fake-maplibre';
import { defineTokens, renderInMap, setPageTheme } from './testing/render-map';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

const routed: MapRouteLine = {
  id: 'leg-1',
  points: [
    [-9.133, 38.713],
    [-9.14, 38.71],
  ],
  colorToken: '--day-2',
  estimated: false,
};
const estimate: MapRouteLine = {
  id: 'leg-2',
  points: [
    [-9.14, 38.71],
    [-9.216, 38.692],
  ],
  colorToken: '--day-2',
  estimated: true,
};

let removeTokens: () => void;

beforeEach(() => {
  installFakeMatchMedia();
  removeTokens = defineTokens(
    { '--day-2': '#b8432a', '--color-route-casing': '#ffffff', '--color-accent': '#b8432a' },
    { '--color-route-casing': '#0f1619' },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  removeTokens();
  resetFakeMaps();
  document.documentElement.removeAttribute('data-theme');
});

const layerIds = (map: FakeMap) => map.layers.map(({ id }) => id);
const routeData = (map: FakeMap) =>
  map.getSource('h-route')?.data as GeoJSON.FeatureCollection<GeoJSON.LineString>;

describe('RouteLineLayer', () => {
  it('keeps_the_source_when_rerendered_with_equal_lines', () => {
    const { map, rerender } = renderInMap(<RouteLineLayer lines={[routed, estimate]} />);
    const source = map.getSource('h-route');
    if (!source) {
      throw new Error('route source missing');
    }
    const setData = vi.spyOn(source, 'setData');

    rerender(<RouteLineLayer lines={[{ ...routed }, { ...estimate }]} />);

    expect(setData).not.toHaveBeenCalled();
  });

  it('replaces_the_source_data_when_the_lines_change', () => {
    const { map, rerender } = renderInMap(<RouteLineLayer lines={[routed]} />);

    rerender(<RouteLineLayer lines={[routed, estimate]} />);

    expect(routeData(map).features).toHaveLength(2);
  });

  it('draws_casing_then_routed_then_estimated_lines', () => {
    const { map } = renderInMap(<RouteLineLayer lines={[routed, estimate]} />);

    expect(layerIds(map)).toEqual(['h-route-casing', 'h-route-line', 'h-route-estimated']);
  });

  it('goes_below_the_pins_so_they_stay_tappable', () => {
    const { map } = renderInMap(
      <>
        <PinsLayer pins={[]} selectedId={null} onSelect={vi.fn()} />
        <RouteLineLayer lines={[routed]} />
      </>,
    );

    expect(layerIds(map).indexOf('h-route-estimated')).toBeLessThan(
      layerIds(map).indexOf('h-places-hit'),
    );
  });

  it('colours_each_line_from_its_token_and_flags_estimates', () => {
    const { map } = renderInMap(<RouteLineLayer lines={[routed, estimate]} />);

    expect(routeData(map).features.map(({ properties }) => properties)).toEqual([
      { id: 'leg-1', color: '#b8432a', estimated: false },
      { id: 'leg-2', color: '#b8432a', estimated: true },
    ]);
  });

  it('dashes_estimated_legs_only', () => {
    const { map } = renderInMap(<RouteLineLayer lines={[routed, estimate]} />);

    expect(map.getLayer('h-route-estimated')?.paint['line-dasharray']).toEqual([1, 1.5]);
    expect(map.getLayer('h-route-line')?.paint).not.toHaveProperty('line-dasharray');
  });

  it('skips_lines_with_fewer_than_two_points', () => {
    const { map } = renderInMap(
      <RouteLineLayer lines={[{ ...routed, points: [[-9.14, 38.71]] }, estimate]} />,
    );

    expect(routeData(map).features).toHaveLength(1);
  });

  it('dims_every_line_to_60_percent', () => {
    const { map, rerender } = renderInMap(<RouteLineLayer lines={[routed]} />);
    expect(map.getLayer('h-route-line')?.paint['line-opacity']).toBe(1);

    rerender(<RouteLineLayer lines={[routed]} dimmed />);

    for (const id of ['h-route-casing', 'h-route-line', 'h-route-estimated']) {
      expect(map.getLayer(id)?.paint['line-opacity']).toBe(0.6);
    }
  });

  it('uses_the_casing_colour_of_the_current_theme', async () => {
    const { map } = renderInMap(<RouteLineLayer lines={[routed]} />);
    expect(map.getLayer('h-route-casing')?.paint['line-color']).toBe('#ffffff');

    await setPageTheme('dark');

    expect(map.getLayer('h-route-casing')?.paint['line-color']).toBe('#0f1619');
  });

  it('replaces_the_lines_when_the_route_changes', () => {
    const { map, rerender } = renderInMap(<RouteLineLayer lines={[routed, estimate]} />);

    rerender(<RouteLineLayer lines={[]} />);

    expect(routeData(map).features).toEqual([]);
  });

  it('unmounts_with_the_map_without_touching_the_removed_map', () => {
    const { unmount } = renderInMap(<RouteLineLayer lines={[routed]} />);

    expect(() => unmount()).not.toThrow();
    expect(createdMaps.every((map) => map.removed)).toBe(true);
  });
});
