import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import { attachLongPress, consumeLiftClick, createLiftClickFilter } from './long-press';
import { Map as FakeMap } from './testing/fake-maplibre';

describe('createLiftClickFilter', () => {
  it('swallows_the_click_that_ends_a_touch_long_press_once', () => {
    const filter = createLiftClickFilter();

    filter.touchStart();
    filter.contextMenu();
    filter.touchEnd(0);

    expect(filter.consume()).toBe(true);
    expect(filter.consume()).toBe(false);
  });

  it('lets_the_click_after_a_right_click_through', () => {
    const filter = createLiftClickFilter();

    filter.contextMenu();

    expect(filter.consume()).toBe(false);
  });

  it('lets_a_plain_tap_through', () => {
    const filter = createLiftClickFilter();

    filter.touchStart();
    filter.touchEnd(0);

    expect(filter.consume()).toBe(false);
  });

  it('forgets_a_pending_lift_click_when_a_new_touch_starts', () => {
    const filter = createLiftClickFilter();
    filter.touchStart();
    filter.contextMenu();

    filter.touchStart();

    expect(filter.consume()).toBe(false);
  });

  it('treats_a_long_press_while_another_finger_stays_down_as_touch', () => {
    const filter = createLiftClickFilter();
    filter.touchStart();
    filter.touchEnd(1);

    filter.contextMenu();

    expect(filter.consume()).toBe(true);
  });

  it('treats_a_contextmenu_after_a_cancelled_touch_as_a_right_click', () => {
    const filter = createLiftClickFilter();
    filter.touchStart();
    filter.touchCancel();

    filter.contextMenu();

    expect(filter.consume()).toBe(false);
  });
});

function createMap() {
  const fake = new FakeMap({ container: document.createElement('div') });
  return { fake, map: fake as unknown as MapLibreMap };
}

describe('attachLongPress', () => {
  it('reports_the_pressed_point_as_lng_lat', () => {
    const { fake, map } = createMap();
    const onLongPress = vi.fn();
    attachLongPress(map, onLongPress);

    fake.fire('contextmenu', { lngLat: { lng: -9.14, lat: 38.71 } });

    expect(onLongPress).toHaveBeenCalledWith([-9.14, 38.71]);
  });

  it('marks_the_lift_click_of_a_touch_hold_for_click_handlers', () => {
    const { fake, map } = createMap();
    attachLongPress(map, vi.fn());

    fake.fire('touchstart');
    fake.fire('contextmenu', { lngLat: { lng: 0, lat: 0 } });
    fake.fire('touchend', { points: [] });

    expect(consumeLiftClick(map)).toBe(true);
    expect(consumeLiftClick(map)).toBe(false);
  });

  it('stops_listening_when_detached', () => {
    const { fake, map } = createMap();
    const onLongPress = vi.fn();
    const detach = attachLongPress(map, onLongPress);

    detach();
    fake.fire('contextmenu', { lngLat: { lng: 0, lat: 0 } });

    expect(onLongPress).not.toHaveBeenCalled();
    expect(fake.listenerCount('touchstart')).toBe(0);
    expect(consumeLiftClick(map)).toBe(false);
  });
});
