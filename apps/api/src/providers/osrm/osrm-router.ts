import type { TravelMode } from '@heremita/shared';
import {
  MAX_ROUTE_STOPS,
  ProviderError,
  type RouteRequest,
  type RouteResult,
  type RoutingProvider,
} from '../core/contract.js';
import type { OutboundClient } from '../core/outbound.js';
import type { AdapterDeps } from '../core/providers.module.js';
import { OSRM_PROVIDER_ID, osrmRouteUrl, routeFromOsrmBody } from './osrm.mapper.js';

const MODES: readonly TravelMode[] = ['walk', 'bike', 'drive'];

/** FOSSGIS OSRM `/route` through the outbound client (1 request/s, one connection). */
export class OsrmRouter implements RoutingProvider {
  readonly id = OSRM_PROVIDER_ID;
  readonly capabilities = { modes: MODES, maxStops: MAX_ROUTE_STOPS };

  constructor(
    private readonly baseUrl: string,
    private readonly outbound: OutboundClient,
  ) {}

  async route({ mode, stops }: RouteRequest, signal?: AbortSignal): Promise<RouteResult> {
    if (stops.length < 2) {
      throw new ProviderError(this.id, 'bad_request', 'a route needs at least 2 stops');
    }
    if (stops.length > MAX_ROUTE_STOPS) {
      throw new ProviderError(this.id, 'too_many_stops', `more than ${MAX_ROUTE_STOPS} stops`);
    }
    const response = await this.outbound.get({
      host: 'osrm',
      url: osrmRouteUrl(this.baseUrl, mode, stops),
      signal,
    });
    return routeFromOsrmBody(mode, stops, response.body);
  }
}

/** `ProvidersModule.forRoot({ osrm: osrmAdapter })`; the env schema requires `OSRM_URL` when OSRM is selected. */
export function osrmAdapter({ env, outbound }: AdapterDeps): RoutingProvider {
  if (env.OSRM_URL === undefined) {
    throw new Error('ROUTING_PROVIDER=osrm needs OSRM_URL');
  }
  return new OsrmRouter(env.OSRM_URL, outbound);
}
