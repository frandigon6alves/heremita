import { endpoints } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { routePath } from './endpoint.decorator.js';

describe('routePath', () => {
  it('turns_openapi_parameters_into_express_ones', () => {
    expect(routePath(endpoints.putStopOrder.path)).toBe('trips/:tripId/days/:dayId/stop-order');
  });

  it('keeps_paths_without_parameters', () => {
    expect(routePath(endpoints.listPublicTrips.path)).toBe('public-trips');
  });
});
