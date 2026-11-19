import { describe, expect, it } from 'vitest';
import { projectToFrame } from './thumbnail-geometry';

const frame = { width: 120, height: 80, padding: 10 };

describe('projectToFrame', () => {
  it('returns_nothing_without_points', () => {
    expect(projectToFrame([], frame)).toEqual([]);
  });

  it('centres_a_single_point', () => {
    expect(projectToFrame([{ lng: -9.1, lat: 38.7 }], frame)).toEqual([{ x: 60, y: 40 }]);
  });

  it('centres_points_at_the_same_spot', () => {
    const spot = { lng: 2.35, lat: 48.85 };

    expect(projectToFrame([spot, spot], frame)).toEqual([
      { x: 60, y: 40 },
      { x: 60, y: 40 },
    ]);
  });

  it('puts_north_up_and_east_right', () => {
    const [west, east] = projectToFrame(
      [
        { lng: 0, lat: 0 },
        { lng: 1, lat: 1 },
      ],
      frame,
    );

    expect(east!.x).toBeGreaterThan(west!.x);
    expect(east!.y).toBeLessThan(west!.y);
  });

  it('fits_the_longer_side_and_centres_the_shorter_one', () => {
    const points = projectToFrame(
      [
        { lng: 0, lat: 0 },
        { lng: 10, lat: 0 },
      ],
      frame,
    );

    expect(points).toEqual([
      { x: 10, y: 40 },
      { x: 110, y: 40 },
    ]);
  });

  it('keeps_every_point_inside_the_padding', () => {
    const points = projectToFrame(
      [
        { lng: -9.2065, lat: 38.6979 },
        { lng: -9.1335, lat: 38.7139 },
        { lng: -9.1365, lat: 38.7077 },
        { lng: -9.15, lat: 38.75 },
      ],
      frame,
    );

    for (const { x, y } of points) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(110);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(70);
    }
  });

  it('squashes_longitude_by_latitude', () => {
    const [a, b, c] = projectToFrame(
      [
        { lng: 0, lat: 60 },
        { lng: 1, lat: 60 },
        { lng: 0, lat: 61 },
      ],
      { width: 1000, height: 1000, padding: 0 },
    );

    const east = b!.x - a!.x;
    const north = a!.y - c!.y;
    expect(east / north).toBeCloseTo(Math.cos((60 + 1 / 3) * (Math.PI / 180)), 1);
  });
});
