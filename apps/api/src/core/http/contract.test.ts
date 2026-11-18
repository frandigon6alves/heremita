import { endpoint, endpoints, idSchema, type EndpointDef } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiProblem } from './api-problem.js';
import { notFoundCodeOf, parseInput, parseOutput, ResponseContractError } from './contract.js';

const TRIP_ID = '0193a000-0000-7000-8000-000000000101';
const DAY_ID = '0193a000-0000-7000-8000-000000000201';

function problemOf(run: () => unknown): ApiProblem {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiProblem) {
      return error;
    }
    throw error;
  }
  throw new Error('expected an ApiProblem');
}

describe('parseInput', () => {
  it('returns_parsed_parts_with_defaults_applied', () => {
    const input = parseInput(endpoints.listMyTrips, { query: {} });

    expect(input).toEqual({ query: { limit: 20 } });
  });

  it('cleans_free_text_in_bodies', () => {
    const input = parseInput(endpoints.createTrip, { body: { title: '  Lisboa‮  ' } });

    expect(input.body).toMatchObject({ title: 'Lisboa', dayCount: 1 });
  });

  it('answers_404_of_the_resource_for_a_malformed_path_id', () => {
    const trip = problemOf(() =>
      parseInput(endpoints.deleteDay, { params: { tripId: 'nope', dayId: DAY_ID } }),
    );
    const day = problemOf(() =>
      parseInput(endpoints.deleteDay, { params: { tripId: TRIP_ID, dayId: 'nope' } }),
    );
    const place = problemOf(() => parseInput(endpoints.getPlace, { params: { placeId: '1' } }));
    const token = problemOf(() =>
      parseInput(endpoints.getSharedPlan, { params: { shareToken: '../x' } }),
    );

    expect([trip.code, day.code, place.code, token.code]).toEqual([
      'trip_not_found',
      'not_found',
      'place_not_found',
      'trip_not_found',
    ]);
    expect(trip.getStatus()).toBe(404);
  });

  it('declares_the_404_of_every_path_parameter_in_the_contract', () => {
    const definitions: [string, EndpointDef][] = Object.entries(endpoints);
    for (const [name, def] of definitions) {
      for (const param of Object.keys(def.params?.shape ?? {})) {
        expect(def.errors, `${name}.${param}`).toContain(notFoundCodeOf(param));
      }
    }
  });

  it('points_at_each_unknown_body_key', () => {
    const problem = problemOf(() =>
      parseInput(endpoints.createTrip, { body: { title: 'Rio', ownerId: TRIP_ID, 'a/b': 1 } }),
    );

    expect(problem.code).toBe('validation_failed');
    expect(problem.extensions.errors).toEqual([
      { pointer: '/body/ownerId', detail: 'Unknown field.' },
      { pointer: '/body/a~1b', detail: 'Unknown field.' },
    ]);
  });

  it('points_at_nested_array_items_and_query_fields', () => {
    const order = problemOf(() =>
      parseInput(endpoints.putStopOrder, {
        params: { tripId: TRIP_ID, dayId: DAY_ID },
        body: { stopIds: [DAY_ID, 'x'] },
      }),
    );
    const page = problemOf(() => parseInput(endpoints.listMyTrips, { query: { limit: '51' } }));

    expect(order.extensions.errors?.map((error) => error.pointer)).toEqual(['/body/stopIds/1']);
    expect(page.extensions.errors?.map((error) => error.pointer)).toEqual(['/query/limit']);
  });

  it('reports_a_missing_body_at_the_body_root', () => {
    const problem = problemOf(() => parseInput(endpoints.createTrip, { body: undefined }));

    expect(problem.extensions.errors?.map((error) => error.pointer)).toEqual(['/body']);
  });

  it('reports_query_and_body_problems_together', () => {
    const def = endpoint({
      method: 'POST',
      path: '/probe',
      auth: 'none',
      query: z.strictObject({ n: z.coerce.number().int() }),
      body: z.strictObject({ id: idSchema }),
      status: 204,
      errors: [],
    });

    const problem = problemOf(() => parseInput(def, { query: { n: 'x' }, body: { id: 'y' } }));

    expect(problem.extensions.errors?.map((error) => error.pointer)).toEqual([
      '/query/n',
      '/body/id',
    ]);
  });
});

describe('parseOutput', () => {
  it('strips_keys_the_response_schema_does_not_list', () => {
    const output = parseOutput(endpoints.getLiveness, { status: 'ok', secret: 'x' });

    expect(output).toEqual({ status: 'ok' });
  });

  it('returns_nothing_for_204_endpoints', () => {
    expect(parseOutput(endpoints.logOut, { leaked: true })).toBeUndefined();
  });

  it('fails_with_issue_paths_but_no_values_when_the_result_breaks_the_contract', () => {
    const run = () => parseOutput(endpoints.getLiveness, { status: 'private-value' });

    expect(run).toThrow(ResponseContractError);
    expect(run).toThrow('Response of GET /health breaks its contract at /status');
    expect(run).not.toThrow(/private-value/);
  });
});
