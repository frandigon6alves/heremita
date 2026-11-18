import type { LngLat, TravelMode } from '@heremita/shared';
import {
  MAX_ROUTE_STOPS,
  OSM_ATTRIBUTION,
  ProviderError,
  type RouteLeg,
  type RouteRequest,
  type RouteResult,
  type RoutingProvider,
  type SnappedStop,
} from '../core/contract.js';
import { estimateDurationSeconds, estimateLeg, routeQuality, sumLegs } from '../core/estimates.js';
import { encodePolyline, haversineMeters } from '../core/geo.js';
import type { FakeProviderOptions } from './fake-geocoder.js';

/** Differs from the 1.4 of estimates on purpose: a test can tell a fake-routed leg from an estimate. */
export const FAKE_DETOUR_FACTOR = 1.3;
/** Stops north of this latitude count as "snapped too far" (the unroutable-stop path). */
export const FAKE_UNROUTABLE_ABOVE_LAT = 85;

const MODES: readonly TravelMode[] = ['walk', 'bike', 'drive'];

function snap(stop: LngLat): SnappedStop {
  if (stop.lat <= FAKE_UNROUTABLE_ABOVE_LAT) {
    return { location: stop, offNetworkMeters: 0, routable: true };
  }
  const location = { lng: stop.lng, lat: FAKE_UNROUTABLE_ABOVE_LAT };
  return { location, offNetworkMeters: Math.round(haversineMeters(stop, location)), routable: false };
}

/**
 * Deterministic router for tests and e2e: straight 2-point legs, haversine ×
 * 1.3 at the estimate speeds, `estimated: false`. Never reads the clock, never random.
 */
export class FakeRouter implements RoutingProvider {
  readonly id = 'fake';
  readonly capabilities = { modes: MODES, maxStops: MAX_ROUTE_STOPS };

  constructor(private readonly options: FakeProviderOptions = {}) {}

  async route({ mode, stops }: RouteRequest): Promise<RouteResult> {
    if (this.options.failWith) {
      throw new ProviderError(this.id, this.options.failWith, `fake router: ${this.options.failWith}`);
    }
    if (stops.length > MAX_ROUTE_STOPS) {
      throw new ProviderError(this.id, 'too_many_stops', `more than ${MAX_ROUTE_STOPS} stops`);
    }
    if (stops.length < 2) {
      throw new ProviderError(this.id, 'bad_request', 'a route needs at least 2 stops');
    }
    const snapped = stops.map(snap);
    const legs = stops.slice(1).map((to, i): RouteLeg => {
      const from = stops[i]!;
      if (!snapped[i]!.routable || !snapped[i + 1]!.routable) {
        return estimateLeg(mode, from, to);
      }
      const distanceMeters = Math.round(haversineMeters(from, to) * FAKE_DETOUR_FACTOR);
      return {
        distanceMeters,
        durationSeconds: estimateDurationSeconds(mode, distanceMeters),
        polyline: encodePolyline([from, to]),
        estimated: false,
      };
    });
    return {
      provider: 'fake',
      mode,
      quality: routeQuality(legs),
      ...sumLegs(legs),
      legs,
      snapped,
      attribution: OSM_ATTRIBUTION,
    };
  }
}
