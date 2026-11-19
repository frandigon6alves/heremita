import { cleanup } from '@testing-library/react';
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
  it('eases_the_visible_centre_above_the_settled_sheet', () => {
    installFakeMatchMedia();

    const { map } = renderInMap(<SheetPadding bottom={136} />);

    expect(map.cameraCalls.at(-1)).toEqual({
      method: 'easeTo',
      args: [{ padding: { top: 0, right: 0, bottom: 136, left: 0 }, duration: 200 }],
    });
  });

  it('follows_a_new_snap_height', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding bottom={136} />);

    rerender(<SheetPadding bottom={422} />);

    expect(map.cameraCalls.at(-1)?.args[0]).toMatchObject({ padding: { bottom: 422 } });
  });

  it('does_not_move_again_for_the_same_padding', () => {
    installFakeMatchMedia();
    const { map, rerender } = renderInMap(<SheetPadding left={400} />);
    const calls = map.cameraCalls.length;

    rerender(<SheetPadding left={400} />);

    expect(map.cameraCalls).toHaveLength(calls);
  });

  it('jumps_under_reduced_motion', () => {
    installFakeMatchMedia().set('(prefers-reduced-motion: reduce)', true);

    const { map } = renderInMap(<SheetPadding bottom={136} />);

    expect(map.cameraCalls.at(-1)?.args[0]).toMatchObject({ duration: 0 });
  });
});
