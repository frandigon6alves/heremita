import { endpoints } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { endpointPath } from './request';

describe('endpointPath', () => {
  it('prefixes_the_api_version_and_omits_an_empty_query', () => {
    expect(endpointPath(endpoints.getMe, {})).toBe('/api/v1/me');
  });

  it('encodes_each_path_param_as_one_segment', () => {
    expect(endpointPath(endpoints.getSharedPlan, { params: { shareToken: 'a/b?c' } })).toBe(
      '/api/v1/shared/a%2Fb%3Fc/plan',
    );
  });

  it('leaves_out_undefined_and_null_query_values', () => {
    expect(
      endpointPath(endpoints.listPublicTrips, {
        query: { q: 'lisboa a pé', cursor: undefined, countryCode: null, limit: 12 },
      }),
    ).toBe('/api/v1/public-trips?q=lisboa+a+p%C3%A9&limit=12');
  });

  it('throws_when_a_path_param_is_missing', () => {
    expect(() => endpointPath(endpoints.getTrip, { params: {} })).toThrow(/tripId/);
  });

  it('throws_when_a_query_value_is_not_a_scalar', () => {
    expect(() => endpointPath(endpoints.listMyTrips, { query: { cursor: ['a'] } })).toThrow(
      /cursor/,
    );
  });
});
