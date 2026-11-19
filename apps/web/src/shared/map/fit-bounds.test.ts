import type { Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { fitToPoints } from './fit-bounds';
import { Map as FakeMap } from './testing/fake-maplibre';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createMap() {
  const fake = new FakeMap({ container: document.createElement('div') });
  return { fake, map: fake as unknown as MapLibreMap };
}

describe('fitToPoints', () => {
  it('frames_the_points_with_24_px_over_the_persistent_padding_up_to_zoom_16', () => {
    installFakeMatchMedia();
    const { fake, map } = createMap();

    fitToPoints(map, [
      [-9.14, 38.71],
      [-9.13, 38.72],
    ]);

    expect(fake.cameraCalls).toEqual([
      {
        method: 'fitBounds',
        args: [
          [
            [-9.14, 38.71],
            [-9.13, 38.72],
          ],
          { padding: 24, maxZoom: 16, duration: 600 },
        ],
      },
    ]);
  });

  it('jumps_without_animation_under_reduced_motion', () => {
    installFakeMatchMedia().set('(prefers-reduced-motion: reduce)', true);
    const { fake, map } = createMap();

    fitToPoints(map, [[-9.14, 38.71]]);

    expect(fake.cameraCalls[0]?.args[1]).toMatchObject({ duration: 0 });
  });

  it('leaves_the_camera_alone_without_points', () => {
    installFakeMatchMedia();
    const { fake, map } = createMap();

    fitToPoints(map, []);

    expect(fake.cameraCalls).toEqual([]);
  });
});
