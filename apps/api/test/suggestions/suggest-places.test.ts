import { endpoints, LIMITS, type PlaceSuggestions } from '@heremita/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderErrorKind } from '../../src/providers/core/contract.js';
import { haversineMeters } from '../../src/providers/core/geo.js';
import { FakeGeocoder } from '../../src/providers/fake/fake-geocoder.js';
import { GAZETTEER } from '../../src/providers/fake/gazetteer.js';
import { FakeIdeaGenerator } from '../../src/suggestions/fake-idea-generator.js';
import type { IdeaGenerator, IdeaRequest } from '../../src/suggestions/idea-generator.js';
import { buildTestApp, type TestApp } from '../support/app.js';
import { expectProblem } from '../support/assertions.js';
import { createTrip, createUser, getPlan, type TestAgent } from '../support/factories.js';
import { callOk, sendRaw } from '../support/http.js';

const GAZETTEER_KEYS = new Set<string>(GAZETTEER.map((place) => place.key));
const PARIS = { lng: 2.3522, lat: 48.8566 };

/** The fake generator, remembering what it was asked; its failure can be switched on. */
class RecordingGenerator implements IdeaGenerator {
  readonly id = 'fake';
  requests: IdeaRequest[] = [];
  failWith: 'refused' | 'upstream' | null = null;

  generate(request: IdeaRequest) {
    this.requests.push(request);
    return new FakeIdeaGenerator(this.failWith ? { failWith: this.failWith } : {}).generate(
      request,
    );
  }
}

/** The fake geocoder whose failure can be switched on. */
class SwitchableGeocoder extends FakeGeocoder {
  failing: ProviderErrorKind | null = null;

  override search(...args: Parameters<FakeGeocoder['search']>) {
    return this.failing
      ? new FakeGeocoder({ failWith: this.failing }).search(...args)
      : super.search(...args);
  }
}

let t: TestApp;
let generator: RecordingGenerator;
let geocoder: SwitchableGeocoder;
let owner: TestAgent;

beforeAll(async () => {
  generator = new RecordingGenerator();
  geocoder = new SwitchableGeocoder();
  t = await buildTestApp({ ideaGenerator: generator, geocoding: geocoder });
  owner = (await createUser(t)).agent;
});

afterAll(async () => {
  await t.close();
});

function suggest(agent: TestAgent, tripId: string, body: Record<string, unknown>) {
  return sendRaw(agent, endpoints.suggestPlaces, {
    params: { tripId },
    body: { prompt: 'Museums and viewpoints', locale: 'en', ...body },
  });
}

async function rowCounts() {
  const [tripPlaces, stops, days] = await Promise.all([
    t.prisma.tripPlace.count(),
    t.prisma.stop.count(),
    t.prisma.day.count(),
  ]);
  return { tripPlaces, stops, days };
}

describe('suggestPlaces (E52)', () => {
  it('answers_grounded_places_near_the_trip_that_are_not_in_it_and_writes_nothing', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 2 });
    const inTrip = new Set(plan.places.map((entry) => entry.place.key));
    const before = await rowCounts();

    const response = await suggest(owner, plan.trip.id, { count: 3 });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as PlaceSuggestions;
    expect(body.items).toHaveLength(3);
    for (const { place, reason } of body.items) {
      expect(GAZETTEER_KEYS.has(place.key)).toBe(true);
      expect(inTrip.has(place.key)).toBe(false);
      expect(reason).toBe('Sample suggestion from the offline gazetteer.');
    }
    expect(new Set(body.items.map((item) => item.place.key)).size).toBe(3);
    expect(await rowCounts()).toEqual(before);
  });

  it('asks_the_generator_for_extra_ideas_with_the_trip_as_context', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 1 });
    generator.requests = [];

    await callOk(owner, 'suggestPlaces', {
      params: { tripId: plan.trip.id },
      body: { prompt: '  Street food  ', locale: 'es', count: 2 },
    });

    expect(generator.requests).toEqual([
      expect.objectContaining({
        prompt: 'Street food',
        locale: 'es',
        count: 4,
        alreadyInTrip: plan.places.map((entry) => entry.place.name),
      }),
    ]);
  });

  it('drops_an_idea_no_real_place_matches_and_counts_it', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 1 });

    const body = await callOk(owner, 'suggestPlaces', {
      params: { tripId: plan.trip.id },
      body: { prompt: 'Everything', locale: 'en', count: LIMITS.SUGGEST_COUNT.max },
    });

    // The fake's last idea is a made-up museum: grounding must never serve it.
    expect(body.dropped).toBeGreaterThanOrEqual(1);
    expect(body.items.every((item) => GAZETTEER_KEYS.has(item.place.key))).toBe(true);
  });

  it('looks_around_the_destination_of_a_trip_without_places', async () => {
    const trip = await callOk(owner, 'createTrip', {
      body: {
        title: 'Paris',
        destination: { name: 'Paris', countryCode: 'FR', center: PARIS },
      },
    });

    const body = await callOk(owner, 'suggestPlaces', {
      params: { tripId: trip.id },
      body: { prompt: 'Art', locale: 'en', count: 2 },
    });

    expect(body.items).toHaveLength(2);
    for (const { place } of body.items) {
      expect(haversineMeters(PARIS, place.location)).toBeLessThanOrEqual(
        LIMITS.SUGGEST_RADIUS_KM * 1000,
      );
    }
  });

  it('answers_422_for_a_trip_with_neither_destination_nor_places', async () => {
    const trip = await callOk(owner, 'createTrip', { body: { title: 'Somewhere' } });

    expectProblem(await suggest(owner, trip.id, {}), 422, 'destination_required');
  });

  it('answers_503_ai_unavailable_when_the_generator_fails', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 1 });
    generator.failWith = 'refused';
    try {
      expectProblem(await suggest(owner, plan.trip.id, {}), 503, 'ai_unavailable');
    } finally {
      generator.failWith = null;
    }
  });

  it('answers_503_geocoding_unavailable_when_no_idea_could_be_looked_up', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 1 });
    geocoder.failing = 'unavailable';
    try {
      expectProblem(await suggest(owner, plan.trip.id, {}), 503, 'geocoding_unavailable');
    } finally {
      geocoder.failing = null;
    }
  });

  it('never_serves_a_place_of_the_trip_even_when_the_generator_names_it', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 3 });
    const inTrip = plan.places.map((entry) => entry.place);
    const named: IdeaGenerator = {
      id: 'fake',
      generate: () =>
        Promise.resolve({
          ideas: inTrip.map((place) => ({
            name: place.name,
            category: place.category,
            reason: 'x',
          })),
          model: 'fake',
          usage: null,
        }),
    };
    const app = await buildTestApp({ ideaGenerator: named });
    try {
      const agent = (await createUser(app)).agent;
      const copy = await createTrip(agent, { days: 1, stopsPerDay: 3 });

      const body = await callOk(agent, 'suggestPlaces', {
        params: { tripId: copy.trip.id },
        body: { prompt: 'Anything', locale: 'en' },
      });

      expect(body).toEqual({ items: [], dropped: 3 });
    } finally {
      await app.close();
    }
  });

  it('keeps_the_plan_version_unchanged', async () => {
    const plan = await createTrip(owner, { days: 1, stopsPerDay: 1 });

    await callOk(owner, 'suggestPlaces', {
      params: { tripId: plan.trip.id },
      body: { prompt: 'Cafés', locale: 'pt-BR' },
    });

    expect((await getPlan(owner, plan.trip.id)).planVersion).toBe(plan.planVersion);
  });
});

describe('suggestPlaces (E52) with AI off', () => {
  it('answers_503_ai_unavailable', async () => {
    const app = await buildTestApp({ ideaGenerator: null });
    try {
      const agent = (await createUser(app)).agent;
      const plan = await createTrip(agent, { days: 1, stopsPerDay: 1 });

      expectProblem(await suggest(agent, plan.trip.id, {}), 503, 'ai_unavailable');
    } finally {
      await app.close();
    }
  });
});

describe('suggestPlaces (E52) daily budget', () => {
  it('answers_429_until_the_next_utc_day_once_the_budget_is_spent', async () => {
    const app = await buildTestApp({ env: { AI_DAILY_LIMIT: '1' } });
    try {
      const agent = (await createUser(app)).agent;
      const plan = await createTrip(agent, { days: 1, stopsPerDay: 1 });
      await callOk(agent, 'suggestPlaces', {
        params: { tripId: plan.trip.id },
        body: { prompt: 'Parks', locale: 'en' },
      });

      const spent = await suggest(agent, plan.trip.id, {});

      expectProblem(spent, 429, 'ai_quota_exhausted');
      // The test clock starts at 10:00 UTC: 14 hours to midnight.
      expect(spent.headers['retry-after']).toBe(String(14 * 60 * 60));

      app.clock.set('2026-11-19T00:00:00.000Z');
      expect((await suggest(agent, plan.trip.id, {})).status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
