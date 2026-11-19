import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import { Map as FakeMap, resetFakeMaps } from '@/shared/map/testing/fake-maplibre';
import { renderInMap } from '@/shared/map/testing/render-map';
import { MAP_SETTLE_MS, MapCentreTracker } from './map-centre-tracker';
import { PlannerCamera } from './planner-camera';

vi.mock('maplibre-gl', () => import('@/shared/map/testing/fake-maplibre'));

const castle = { lng: -9.1334, lat: 38.7139 };
const tower = { lng: -9.2159, lat: 38.6916 };

type CameraMap = FakeMap & {
  getZoom?: () => number;
  getCenter?: () => { lng: number; lat: number };
};

beforeEach(() => {
  installFakeMatchMedia();
  const proto = FakeMap.prototype as CameraMap;
  proto.getZoom = () => 12.4;
  proto.getCenter = () => ({ lng: -9.14, lat: 38.72 });
});

afterEach(() => {
  cleanup();
  const proto = FakeMap.prototype as CameraMap;
  delete proto.getZoom;
  delete proto.getCenter;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetFakeMaps();
});

describe('PlannerCamera', () => {
  it('frames_the_selected_days_points_on_mount_and_when_the_day_changes', () => {
    const { map, rerender } = renderInMap(
      <PlannerCamera fitKey="day-1" points={[castle, tower]} focus={null} />,
    );
    const fits = () => map.cameraCalls.filter((call) => call.method === 'fitBounds');

    expect(fits().at(-1)?.args[0]).toEqual([
      [tower.lng, tower.lat],
      [castle.lng, castle.lat],
    ]);

    rerender(<PlannerCamera fitKey="day-1" points={[castle]} focus={null} />);
    const before = fits().length;
    rerender(<PlannerCamera fitKey="day-2" points={[castle]} focus={null} />);

    expect(fits()).toHaveLength(before + 1);
  });

  it('eases_to_the_selected_place_at_street_zoom_or_closer', () => {
    const { map } = renderInMap(<PlannerCamera fitKey="day-1" points={[]} focus={castle} />);

    expect(map.cameraCalls.at(-1)).toEqual({
      method: 'easeTo',
      args: [{ center: [castle.lng, castle.lat], zoom: 15, duration: 300 }],
    });
  });
});

describe('MapCentreTracker', () => {
  it('reports_the_centre_at_once_and_again_after_a_move_settles', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { map } = renderInMap(<MapCentreTracker onChange={onChange} />);

    expect(onChange).toHaveBeenLastCalledWith({ center: { lng: -9.14, lat: 38.72 }, zoom: 12 });
    onChange.mockClear();

    act(() => {
      map.fire('moveend');
      map.fire('moveend');
      vi.advanceTimersByTime(MAP_SETTLE_MS);
    });

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('tells_when_the_viewer_drags_the_map', () => {
    const onUserPan = vi.fn();
    const { map } = renderInMap(<MapCentreTracker onChange={vi.fn()} onUserPan={onUserPan} />);

    act(() => map.fire('dragstart'));

    expect(onUserPan).toHaveBeenCalledOnce();
  });
});
