import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LngLat } from '@heremita/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { savedResponse, type SavedResponse } from '../../../test/routing/saved-responses.js';
import { FixedClock } from '../../core/clock/fixed-clock.js';
import { parseEnv } from '../../config/env.js';
import { ProviderError } from '../core/contract.js';
import { OutboundClient } from '../core/outbound.js';
import { ProviderCacheService } from '../core/provider-cache.service.js';
import { osrmAdapter, OsrmRouter } from './osrm-router.js';

const STOPS: LngLat[] = [
  { lng: -9.13663, lat: 38.70749 },
  { lng: -9.1326, lat: 38.7136 },
  { lng: -9.1306, lat: 38.7167 },
];

let server: Server;
let paths: string[];
let userAgents: (string | undefined)[];
let next: SavedResponse | { status: number; text: string };
let clock: FixedClock;

function baseUrl(): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function router(): OsrmRouter {
  const outbound = new OutboundClient({
    publicSiteUrl: 'https://heremita.example',
    clock,
    logger: { warn: () => undefined, error: () => undefined },
    sleep: (ms) => {
      clock.advance(ms);
      return Promise.resolve();
    },
    random: () => 0,
  });
  return new OsrmRouter(baseUrl(), outbound);
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ProviderError);
  return error as ProviderError;
}

beforeEach(async () => {
  paths = [];
  userAgents = [];
  next = savedResponse('osrm_foot_01_polyline');
  clock = new FixedClock('2026-11-18T10:00:00.000Z');
  server = createServer((req, res) => {
    paths.push(req.url ?? '');
    userAgents.push(req.headers['user-agent']);
    res.writeHead(next.status, { 'content-type': 'application/json' });
    res.end(next.text);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('OsrmRouter', () => {
  it('routes_through_the_profile_path_with_the_heremita_user_agent', async () => {
    const route = await router().route({ mode: 'walk', stops: STOPS });

    expect(route).toMatchObject({ provider: 'osrm-fossgis', quality: 'routed' });
    expect(paths).toEqual([
      '/routed-foot/route/v1/driving/-9.136630,38.707490;-9.132600,38.713600;-9.130600,38.716700?overview=full&geometries=polyline&steps=false&generate_hints=false&alternatives=false',
    ]);
    expect(userAgents[0]).toMatch(/^Heremita\/\S+ \(\+https:\/\/heremita\.example\/about\)$/);
  });

  it('maps_a_400_error_body_to_its_provider_error', async () => {
    next = savedResponse('osrm_foot_13_majority');

    expect((await failure(router().route({ mode: 'walk', stops: STOPS }))).kind).toBe('no_route');
  });

  it('answers_bad_response_for_a_body_that_is_not_json', async () => {
    next = { status: 200, text: '<html>maintenance</html>' };

    expect((await failure(router().route({ mode: 'walk', stops: STOPS }))).kind).toBe(
      'bad_response',
    );
  });

  it('refuses_more_than_25_stops_without_calling_upstream', async () => {
    const stops = Array.from({ length: 26 }, (_, i) => ({ lng: -9.1 + i / 1000, lat: 38.7 }));

    expect((await failure(router().route({ mode: 'walk', stops }))).kind).toBe('too_many_stops');
    expect(paths).toEqual([]);
  });

  it('refuses_a_single_stop_without_calling_upstream', async () => {
    expect((await failure(router().route({ mode: 'walk', stops: STOPS.slice(0, 1) }))).kind).toBe(
      'bad_request',
    );
    expect(paths).toEqual([]);
  });
});

describe('osrmAdapter', () => {
  it('builds_the_router_from_OSRM_URL', () => {
    const env = parseEnv({
      ...process.env,
      ROUTING_PROVIDER: 'osrm',
      OSRM_URL: 'https://routing.openstreetmap.de',
    });
    const outbound = new OutboundClient({
      publicSiteUrl: env.PUBLIC_SITE_URL,
      clock,
      logger: { warn: () => undefined, error: () => undefined },
    });

    const adapter = osrmAdapter({ env, outbound, cache: {} as ProviderCacheService });

    expect(adapter.id).toBe('osrm-fossgis');
  });
});
