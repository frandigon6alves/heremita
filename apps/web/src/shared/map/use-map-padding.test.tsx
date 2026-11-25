import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { resetFakeMaps } from './testing/fake-maplibre';
import { renderInMap } from './testing/render-map';
import { useMapPadding, type MapPadding } from './use-map-padding';

vi.mock('maplibre-gl', () => import('./testing/fake-maplibre'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetFakeMaps();
});

function SheetPadding(padding: MapPadding) {
  useMapPadding(padding);
  return null;
}

describe('useMapPadding', () => {
  it('sets_the_first_padding_at_once_so_the_fit_that_follows_sees_it', () => {
    installFakeMatchMedia();

    const { map } = renderInMap(<SheetPadding bottom={136} />);

    expect(map.cameraCalls.at(-1)).toEqual({
      method: 'jumpTo',
      args: [{ padding: { top: 0, right: 0, bottom: 136, left: 0 } }],
    });
  });

  it('eases_the_visible_centre_above_a_new_snap_height', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding bottom={136} />);

    rerender(<SheetPadding bottom={422} />);

    expect(map.cameraCalls.at(-1)).toEqual({
      method: 'easeTo',
      args: [{ padding: { top: 0, right: 0, bottom: 422, left: 0 }, duration: 200 }],
    });
  });

  it('does_not_move_again_for_the_same_padding', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding left={400} />);
    const calls = map.cameraCalls.length;

    rerender(<SheetPadding left={400} />);

    expect(map.cameraCalls).toHaveLength(calls);
  });

  it('waits_for_a_running_camera_move_instead_of_cutting_it_short', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding bottom={136} />);
    map.moving = true;

    rerender(<SheetPadding bottom={422} />);
    expect(map.cameraCalls.at(-1)?.method).toBe('jumpTo');

    map.moving = false;
    act(() => map.fire('moveend'));

    expect(map.cameraCalls.at(-1)?.args[0]).toMatchObject({ padding: { bottom: 422 } });
    expect(map.listenerCount('moveend')).toBe(0);
  });

  it('forgets_a_deferred_padding_that_a_newer_one_replaced', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding bottom={136} />);
    map.moving = true;

    rerender(<SheetPadding bottom={422} />);
    rerender(<SheetPadding bottom={300} />);
    map.moving = false;
    act(() => map.fire('moveend'));

    const eases = map.cameraCalls.filter((call) => call.method === 'easeTo');
    expect(eases.map((call) => call.args[0])).toEqual([
      { padding: { top: 0, right: 0, bottom: 300, left: 0 }, duration: 200 },
    ]);
  });

  it('jumps_under_reduced_motion', () => {
    installFakeMatchMedia().set('(prefers-reduced-motion: reduce)', true);
    const { map, rerender } = renderInMap(<SheetPadding bottom={136} />);

    rerender(<SheetPadding bottom={422} />);

    expect(map.cameraCalls.at(-1)?.args[0]).toMatchObject({ duration: 0 });
  });
});
