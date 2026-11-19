import { LIMITS } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { buildTripOwner } from './test-support';
import { detailsFromTrip, parseTripDetails, tripDetailsFieldOf } from './trip-details-model';

const trip = buildTripOwner({
  title: 'Lisboa',
  description: 'Primavera',
  destination: { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.1, lat: 38.7 } },
  startDate: '2027-03-14',
  defaultMode: 'walk',
});

describe('parseTripDetails', () => {
  it('sends_nothing_when_nothing_changed', () => {
    expect(parseTripDetails(detailsFromTrip(trip), trip)).toEqual({ ok: true, body: null });
  });

  it('sends_only_the_changed_fields', () => {
    const values = { ...detailsFromTrip(trip), title: 'Lisboa 2027', defaultMode: 'bike' as const };

    expect(parseTripDetails(values, trip)).toEqual({
      ok: true,
      body: { title: 'Lisboa 2027', defaultMode: 'bike' },
    });
  });

  it('clears_description_dates_and_destination_with_null', () => {
    const values = { ...detailsFromTrip(trip), description: '', startDate: '', destination: null };

    expect(parseTripDetails(values, trip)).toEqual({
      ok: true,
      body: { description: null, destination: null, startDate: null },
    });
  });

  it('treats_a_blank_description_as_none', () => {
    const blank = buildTripOwner({ description: null });

    expect(parseTripDetails({ ...detailsFromTrip(blank), description: '  \n ' }, blank)).toEqual({
      ok: true,
      body: null,
    });
  });

  it('compares_titles_after_cleaning', () => {
    expect(parseTripDetails({ ...detailsFromTrip(trip), title: '  Lisboa ' }, trip)).toEqual({
      ok: true,
      body: null,
    });
  });

  it('sends_a_new_destination_centre', () => {
    const destination = { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.2, lat: 38.7 } };

    expect(parseTripDetails({ ...detailsFromTrip(trip), destination }, trip)).toEqual({
      ok: true,
      body: { destination },
    });
  });

  it('rejects_an_empty_title', () => {
    expect(parseTripDetails({ ...detailsFromTrip(trip), title: ' ' }, trip)).toEqual({
      ok: false,
      issues: { title: 'too_small' },
    });
  });

  it('rejects_a_description_over_the_limit', () => {
    const description = 'd'.repeat(LIMITS.TRIP_DESCRIPTION_MAX + 1);

    expect(parseTripDetails({ ...detailsFromTrip(trip), description }, trip)).toEqual({
      ok: false,
      issues: { description: 'too_big' },
    });
  });
});

describe('tripDetailsFieldOf', () => {
  it('maps_nested_paths_to_their_field', () => {
    expect(tripDetailsFieldOf(['destination', 'center', 'lng'])).toBe('destination');
  });

  it('ignores_fields_the_form_does_not_have', () => {
    expect(tripDetailsFieldOf(['visibility'])).toBeNull();
  });
});
