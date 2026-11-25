import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { HeremitaClient } from './api-client.js';
import { createServer } from './server.js';

const SITE = 'https://heremita.example';
const TRIP_ID = '0193a000-0000-7000-8000-000300000009';
const DAY_1 = '0193a000-0000-7000-8000-000400000001';
const DAY_2 = '0193a000-0000-7000-8000-000400000002';
const PLACE_ID = '0193a000-0000-7000-8000-000200000001';

interface Recorded {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: unknown;
}

type Route = (request: Recorded) => Response | undefined;

/** A fake API: the first route that answers wins; every request is recorded. */
function fakeApi(routes: Route[]) {
  const requests: Recorded[] = [];
  const fetcher = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const request: Recorded = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    for (const route of routes) {
      const response = route(request);
      if (response) {
        return Promise.resolve(response);
      }
    }
    return Promise.resolve(
      Response.json({ code: 'not_found', detail: 'No route' }, { status: 404 }),
    );
  };
  return { fetcher, requests };
}

const on =
  (method: string, path: string, answer: (request: Recorded) => Response): Route =>
  (request) =>
    request.method === method && request.path === `/api/v1${path}` ? answer(request) : undefined;

const login = on('POST', '/sessions', () =>
  Response.json(
    {},
    { status: 201, headers: { 'Set-Cookie': '__Host-hm_session=abc; Path=/; HttpOnly; Secure' } },
  ),
);

const PLAN = {
  viewerRole: 'owner',
  trip: { id: TRIP_ID, title: 'Paris on foot', destination: { name: 'Paris' } },
  planVersion: 3,
  places: [
    {
      id: 'tp-1',
      place: {
        id: PLACE_ID,
        source: 'osm',
        key: 'osm:W:1',
        name: 'Panthéon',
        label: null,
        category: 'sight',
        location: { lng: 2.346, lat: 48.846 },
        countryCode: 'FR',
      },
    },
    {
      id: 'tp-2',
      place: {
        id: 'p2',
        source: 'custom',
        key: null,
        name: 'Our hotel',
        label: null,
        category: 'other',
        location: { lng: 2.35, lat: 48.85 },
        countryCode: null,
      },
    },
  ],
  days: [
    { id: DAY_1, number: 1, date: '2027-05-14', mode: 'walk', stops: [{ tripPlaceId: 'tp-1' }] },
    { id: DAY_2, number: 2, date: '2027-05-15', mode: 'walk', stops: [] },
  ],
  routes: [],
};

let client: Client | null = null;

async function connect(api: HeremitaClient): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

afterEach(async () => {
  await client?.close();
  client = null;
});

function text(result: unknown): string {
  const content = (result as CallToolResult).content[0];
  return content?.type === 'text' ? content.text : '';
}

const WITH_ACCOUNT = { email: 'ana@example.com', password: 'correct horse battery' };

describe('heremita MCP server', () => {
  it('offers_only_the_public_tools_without_an_account', async () => {
    const { fetcher } = fakeApi([]);
    const mcp = await connect(new HeremitaClient({ baseUrl: SITE, fetch: fetcher }));

    const { tools } = await mcp.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_place',
      'get_trip_plan',
      'search_public_trips',
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('adds_the_planning_tools_with_an_account', async () => {
    const { fetcher } = fakeApi([]);
    const mcp = await connect(
      new HeremitaClient({ baseUrl: SITE, fetch: fetcher, credentials: WITH_ACCOUNT }),
    );

    const { tools } = await mcp.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['create_trip', 'search_places', 'suggest_places', 'add_place']),
    );
    expect(tools.find((tool) => tool.name === 'add_place')?.annotations?.readOnlyHint).toBe(false);
  });

  it('searches_public_trips_and_links_each_one', async () => {
    const { fetcher, requests } = fakeApi([
      on('GET', '/public-trips', () =>
        Response.json({
          items: [
            {
              id: TRIP_ID,
              title: 'Paris on foot',
              destinationName: 'Paris',
              countryCode: 'FR',
              dayCount: 3,
              placeCount: 13,
              defaultMode: 'walk',
              copyCount: 0,
              author: { displayName: 'Elena' },
              previewPoints: [],
              publishedAt: '2026-11-18T10:00:00.000Z',
            },
          ],
          nextCursor: null,
        }),
      ),
    ]);
    const mcp = await connect(new HeremitaClient({ baseUrl: SITE, fetch: fetcher }));

    const result = await mcp.callTool({
      name: 'search_public_trips',
      arguments: { query: 'paris' },
    });

    expect(requests[0]?.search).toBe('?q=paris&limit=30');
    expect(JSON.parse(text(result))).toEqual([
      expect.objectContaining({ tripId: TRIP_ID, places: 13, url: `${SITE}/en/t/${TRIP_ID}` }),
    ]);
  });

  it('outlines_a_plan_as_days_of_places_and_ideas', async () => {
    const { fetcher } = fakeApi([on('GET', `/trips/${TRIP_ID}/plan`, () => Response.json(PLAN))]);
    const mcp = await connect(new HeremitaClient({ baseUrl: SITE, fetch: fetcher }));

    const outline = JSON.parse(
      text(await mcp.callTool({ name: 'get_trip_plan', arguments: { tripId: TRIP_ID } })),
    ) as { days: unknown[]; ideas: unknown[] };

    expect(outline.days[0]).toEqual({
      number: 1,
      date: '2027-05-14',
      mode: 'walk',
      places: [
        {
          name: 'Panthéon',
          category: 'sight',
          placeId: PLACE_ID,
          location: { lat: 48.846, lng: 2.346 },
        },
      ],
    });
    expect(outline.ideas).toEqual([expect.objectContaining({ name: 'Our hotel', placeId: null })]);
  });

  it('signs_in_once_then_sends_the_session_and_the_origin_on_writes', async () => {
    const { fetcher, requests } = fakeApi([
      login,
      on('GET', `/trips/${TRIP_ID}/plan`, () => Response.json(PLAN)),
      on('POST', `/trips/${TRIP_ID}/places`, () =>
        Response.json(
          { tripPlace: { place: { name: 'Sainte-Chapelle' } }, stopId: 's', planVersion: 4 },
          { status: 201 },
        ),
      ),
    ]);
    const mcp = await connect(
      new HeremitaClient({ baseUrl: SITE, fetch: fetcher, credentials: WITH_ACCOUNT }),
    );

    const result = await mcp.callTool({
      name: 'add_place',
      arguments: { tripId: TRIP_ID, key: 'osm:W:1234', day: 2 },
    });

    expect(JSON.parse(text(result))).toEqual({ added: 'Sainte-Chapelle', to: 'day 2' });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /api/v1/sessions',
      `GET /api/v1/trips/${TRIP_ID}/plan`,
      `POST /api/v1/trips/${TRIP_ID}/places`,
    ]);
    const write = requests[2];
    expect(write?.headers).toMatchObject({ cookie: '__Host-hm_session=abc', origin: SITE });
    expect(write?.body).toEqual({
      place: { type: 'osm', key: 'osm:W:1234' },
      note: null,
      schedule: { dayId: DAY_2 },
    });
  });

  it('signs_in_again_once_when_the_session_expired', async () => {
    let plans = 0;
    const { fetcher, requests } = fakeApi([
      login,
      on('GET', '/trips', () => {
        plans += 1;
        return plans === 1
          ? Response.json({ code: 'unauthenticated' }, { status: 401 })
          : Response.json({ items: [], nextCursor: null });
      }),
    ]);
    const mcp = await connect(
      new HeremitaClient({ baseUrl: SITE, fetch: fetcher, credentials: WITH_ACCOUNT }),
    );

    const result = await mcp.callTool({ name: 'list_my_trips', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(requests.filter((request) => request.path === '/api/v1/sessions')).toHaveLength(2);
  });

  it('turns_an_api_refusal_into_a_tool_error_the_assistant_can_explain', async () => {
    const { fetcher } = fakeApi([
      login,
      on('POST', `/trips/${TRIP_ID}/suggestions`, () =>
        Response.json(
          { code: 'ai_unavailable', detail: 'AI suggestions are turned off on this server.' },
          { status: 503 },
        ),
      ),
    ]);
    const mcp = await connect(
      new HeremitaClient({ baseUrl: SITE, fetch: fetcher, credentials: WITH_ACCOUNT }),
    );

    const result = await mcp.callTool({
      name: 'suggest_places',
      arguments: { tripId: TRIP_ID, request: 'Quiet museums' },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      'Heremita answered 503 ai_unavailable: AI suggestions are turned off on this server.',
    );
  });

  it('refuses_a_day_the_trip_does_not_have_without_writing', async () => {
    const { fetcher, requests } = fakeApi([
      login,
      on('GET', `/trips/${TRIP_ID}/plan`, () => Response.json(PLAN)),
    ]);
    const mcp = await connect(
      new HeremitaClient({ baseUrl: SITE, fetch: fetcher, credentials: WITH_ACCOUNT }),
    );

    const result = await mcp.callTool({
      name: 'add_place',
      arguments: { tripId: TRIP_ID, key: 'osm:W:1234', day: 5 },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('there is no day 5');
    expect(
      requests.some((request) => request.method === 'POST' && request.path.endsWith('/places')),
    ).toBe(false);
  });
});
