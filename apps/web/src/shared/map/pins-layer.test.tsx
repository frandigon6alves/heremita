import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { LongPressHandler } from './long-press';
import { PinsLayer, type MapPin } from './pins-layer';
import { createdMaps, resetFakeMaps, type Map as FakeMap } from './testing/fake-maplibre';
import { defineTokens, renderInMap, setPageTheme } from './testing/render-map';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

const CASTLE = '019357a1-0000-7000-8000-000000000001';
const TOWER = '019357a1-0000-7000-8000-000000000002';
const MUSEUM = '019357a1-0000-7000-8000-000000000003';

const pins: MapPin[] = [
  { id: CASTLE, lngLat: [-9.133, 38.713], colorToken: '--day-1', variant: 'stop', order: 1 },
  { id: TOWER, lngLat: [-9.216, 38.692], colorToken: '--day-1', variant: 'saving', order: 2 },
  { id: MUSEUM, lngLat: [-9.15, 38.7], colorToken: '--day-1', variant: 'idea', label: 'Museu' },
];

let removeTokens: () => void;

beforeEach(() => {
  installFakeMatchMedia();
  removeTokens = defineTokens(
    {
      '--day-1': '#0e5a60',
      '--color-accent': '#b8432a',
      '--color-surface': '#fffcf6',
      '--color-text': '#1c2629',
      '--color-primary': '#0e5a60',
      '--color-on-primary': '#ffffff',
    },
    { '--color-accent': '#f0896b', '--color-surface': '#162024', '--color-text': '#ebe5d9' },
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
const sourceData = (map: FakeMap) =>
  map.getSource('h-places')?.data as GeoJSON.FeatureCollection<GeoJSON.Point>;
const isSelected = (map: FakeMap, id: string) =>
  map.getFeatureState({ source: 'h-places', id }).selected === true;

function hit(map: FakeMap, id: string) {
  map.renderedFeatures = [
    {
      id,
      layer: { id: 'h-places-hit' },
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { id },
    },
  ];
}

function click(map: FakeMap) {
  act(() => map.fire('click', { point: { x: 10, y: 10 } }));
}

describe('PinsLayer', () => {
  it('adds_one_source_promoting_the_uuid_id_and_its_layers_under_strict_mode', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);

    expect(map.getSource('h-places')?.spec).toMatchObject({ type: 'geojson', promoteId: 'id' });
    expect(layerIds(map)).toEqual([
      'h-places-hit',
      'h-places-halo',
      'h-places-dot',
      'h-places-num',
    ]);
  });

  it('gives_every_pin_a_44_px_invisible_hit_circle', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);

    expect(map.getLayer('h-places-hit')?.paint).toEqual({
      'circle-radius': 22,
      'circle-opacity': 0,
    });
  });

  it('draws_pins_in_their_token_colour_with_variant_and_number', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);

    expect(
      sourceData(map).features.map(({ geometry, properties }) => ({ geometry, properties })),
    ).toEqual([
      {
        geometry: { type: 'Point', coordinates: [-9.133, 38.713] },
        properties: { id: CASTLE, color: '#0e5a60', variant: 'stop', order: 1 },
      },
      {
        geometry: { type: 'Point', coordinates: [-9.216, 38.692] },
        properties: { id: TOWER, color: '#0e5a60', variant: 'saving', order: 2 },
      },
      {
        geometry: { type: 'Point', coordinates: [-9.15, 38.7] },
        properties: { id: MUSEUM, color: '#0e5a60', variant: 'idea', label: 'Museu' },
      },
    ]);
  });

  it('numbers_stops_in_the_basemap_font', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);

    expect(map.getLayer('h-places-num')?.layout).toMatchObject({
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
    });
  });

  it('skips_numbers_when_the_basemap_has_no_glyphs', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);
    map.glyphs = undefined;

    act(() => map.fire('style.load'));

    expect(layerIds(map)).toEqual(['h-places-hit', 'h-places-halo', 'h-places-dot']);
  });

  it('marks_the_selected_pin_with_feature_state', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />);

    expect(isSelected(map, CASTLE)).toBe(true);
    expect(isSelected(map, TOWER)).toBe(false);
  });

  it('moves_the_selection_when_the_selected_id_changes', () => {
    const { map, rerender } = renderInMap(
      <PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />,
    );

    rerender(<PinsLayer pins={pins} selectedId={TOWER} onSelect={vi.fn()} />);

    expect(isSelected(map, CASTLE)).toBe(false);
    expect(isSelected(map, TOWER)).toBe(true);
  });

  it('reapplies_the_selection_after_a_style_switch', () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />);
    map.featureState.clear();

    act(() => map.fire('style.load'));

    expect(isSelected(map, CASTLE)).toBe(true);
  });

  it('selects_a_tapped_pin', () => {
    const onSelect = vi.fn();
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={onSelect} />);
    hit(map, TOWER);

    click(map);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(TOWER);
  });

  it('deselects_when_the_empty_map_is_tapped', () => {
    const onSelect = vi.fn();
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={CASTLE} onSelect={onSelect} />);

    click(map);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('ignores_the_click_that_ends_a_long_press', () => {
    const onSelect = vi.fn();
    const onLongPress = vi.fn();
    const { map } = renderInMap(
      <>
        <PinsLayer pins={pins} selectedId={CASTLE} onSelect={onSelect} />
        <LongPressHandler onLongPress={onLongPress} />
      </>,
    );

    act(() => {
      map.fire('touchstart');
      map.fire('contextmenu', { lngLat: { lng: -9.14, lat: 38.71 } });
      map.fire('touchend', { points: [] });
    });
    click(map);

    expect(onLongPress).toHaveBeenCalledExactlyOnceWith([-9.14, 38.71]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects_again_on_the_next_tap_after_a_long_press', () => {
    const onSelect = vi.fn();
    const { map } = renderInMap(
      <>
        <PinsLayer pins={pins} selectedId={null} onSelect={onSelect} />
        <LongPressHandler onLongPress={vi.fn()} />
      </>,
    );
    act(() => {
      map.fire('touchstart');
      map.fire('contextmenu', { lngLat: { lng: 0, lat: 0 } });
    });
    click(map);
    hit(map, CASTLE);

    act(() => map.fire('touchstart'));
    click(map);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(CASTLE);
  });

  it('calls_the_latest_on_select_after_a_rerender', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { map, rerender } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={first} />,
    );
    rerender(<PinsLayer pins={pins} selectedId={null} onSelect={second} />);
    hit(map, MUSEUM);

    click(map);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(MUSEUM);
  });

  it('updates_the_data_when_pins_change', () => {
    const { map, rerender } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />,
    );

    rerender(<PinsLayer pins={pins.slice(0, 1)} selectedId={null} onSelect={vi.fn()} />);

    expect(sourceData(map).features).toHaveLength(1);
  });

  it('draws_ideas_as_rings_and_the_halo_in_the_accent_of_the_current_theme', async () => {
    const { map } = renderInMap(<PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />);
    expect(map.getLayer('h-places-halo')?.paint['circle-color']).toBe('#b8432a');

    await setPageTheme('dark');

    expect(map.getLayer('h-places-halo')?.paint['circle-color']).toBe('#f0896b');
    expect(map.getLayer('h-places-dot')?.paint['circle-color']).toEqual([
      'case',
      ['==', ['get', 'variant'], 'idea'],
      '#162024',
      ['get', 'color'],
    ]);
  });

  it('keeps_the_source_when_rerendered_with_equal_pins', () => {
    const { map, rerender } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} />,
    );
    const source = map.getSource('h-places');
    if (!source) {
      throw new Error('pins source missing');
    }
    const setData = vi.spyOn(source, 'setData');

    rerender(
      <PinsLayer pins={pins.map((pin) => ({ ...pin }))} selectedId={null} onSelect={vi.fn()} />,
    );

    expect(setData).not.toHaveBeenCalled();
  });

  it('clusters_pins_below_zoom_12_when_asked', () => {
    const { map } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={vi.fn()} cluster />,
    );

    expect(map.getSource('h-places')?.spec).toMatchObject({ cluster: true, clusterMaxZoom: 11 });
    expect(layerIds(map)).toEqual([
      'h-places-hit',
      'h-places-halo',
      'h-places-dot',
      'h-places-num',
      'h-places-cluster',
      'h-places-cluster-count',
    ]);
    expect(map.getLayer('h-places-cluster')?.paint['circle-color']).toBe('#0e5a60');
  });

  it('zooms_into_a_tapped_cluster_instead_of_selecting', async () => {
    const onSelect = vi.fn();
    const { map } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={onSelect} cluster />,
    );
    map.renderedFeatures = [
      {
        id: 7,
        layer: { id: 'h-places-cluster' },
        geometry: { type: 'Point', coordinates: [-9.15, 38.7] },
        properties: { cluster_id: 7, point_count: 3 },
      },
    ];

    await act(async () => {
      map.fire('click', { point: { x: 1, y: 1 } });
      await Promise.resolve();
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(map.cameraCalls.at(-1)).toEqual({
      method: 'easeTo',
      args: [{ center: [-9.15, 38.7], zoom: 13, duration: 300 }],
    });
  });

  it('ignores_a_cluster_that_is_gone_before_its_zoom_answers', async () => {
    const onSelect = vi.fn();
    const { map } = renderInMap(
      <PinsLayer pins={pins} selectedId={null} onSelect={onSelect} cluster />,
    );
    const source = map.getSource('h-places');
    if (!source) {
      throw new Error('pins source missing');
    }
    source.getClusterExpansionZoom = () => Promise.reject(new Error('cluster gone'));
    map.renderedFeatures = [
      {
        id: 7,
        layer: { id: 'h-places-cluster' },
        geometry: { type: 'Point', coordinates: [-9.15, 38.7] },
        properties: { cluster_id: 7, point_count: 3 },
      },
    ];
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    await act(async () => {
      map.fire('click', { point: { x: 1, y: 1 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(map.cameraCalls).toEqual([]);
  });

  it('rebuilds_cleanly_when_clustering_is_switched', () => {
    const { map, rerender } = renderInMap(
      <PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} cluster />,
    );

    rerender(<PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />);

    expect(map.getSource('h-places')?.spec).not.toHaveProperty('cluster');
    expect(layerIds(map)).not.toContain('h-places-cluster');
    expect(isSelected(map, CASTLE)).toBe(true);
  });

  it('removes_its_layers_and_click_handler_when_unmounted_from_a_live_map', async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>
            Hide pins
          </button>
          {shown && <PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />}
        </>
      );
    }
    const { map } = renderInMap(<Toggle />);

    await user.click(screen.getByRole('button', { name: 'Hide pins' }));

    expect(map.layers).toEqual([]);
    expect(map.getSource('h-places')).toBeUndefined();
    expect(map.listenerCount('click')).toBe(0);
  });

  it('unmounts_with_the_map_without_touching_the_removed_map', () => {
    const { unmount } = renderInMap(
      <PinsLayer pins={pins} selectedId={CASTLE} onSelect={vi.fn()} />,
    );

    expect(() => unmount()).not.toThrow();
    expect(createdMaps.every((map) => map.removed)).toBe(true);
  });
});
