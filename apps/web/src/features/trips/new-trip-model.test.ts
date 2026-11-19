import { LIMITS } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { chosenDayCount, newTripFieldOf, parseNewTrip, type NewTripValues } from './new-trip-model';

function values(overrides: Partial<NewTripValues> = {}): NewTripValues {
  return {
    title: 'Lisboa em março',
    destination: null,
    dates: 'none',
    startDate: '',
    endDate: '',
    dayCount: 1,
    ...overrides,
  };
}

describe('parseNewTrip', () => {
  it('builds_an_undated_trip_with_its_day_count', () => {
    expect(parseNewTrip(values({ dayCount: 4 }))).toEqual({
      ok: true,
      body: {
        title: 'Lisboa em março',
        destination: null,
        startDate: null,
        dayCount: 4,
        defaultMode: 'walk',
      },
    });
  });

  it('builds_a_dated_trip_from_its_range', () => {
    const parsed = parseNewTrip(
      values({ dates: 'range', startDate: '2027-03-14', endDate: '2027-03-17', dayCount: 9 }),
    );

    expect(parsed).toMatchObject({ ok: true, body: { startDate: '2027-03-14', dayCount: 4 } });
  });

  it('cleans_the_title_and_keeps_the_destination', () => {
    const destination = { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.1, lat: 38.7 } };
    const parsed = parseNewTrip(values({ title: '  Lisboa‮  ', destination }));

    expect(parsed).toMatchObject({ ok: true, body: { title: 'Lisboa', destination } });
  });

  it('requires_a_title', () => {
    expect(parseNewTrip(values({ title: '   ' }))).toEqual({
      ok: false,
      issues: { title: 'too_small' },
    });
  });

  it('rejects_a_title_over_the_limit', () => {
    const parsed = parseNewTrip(values({ title: 'a'.repeat(LIMITS.TRIP_TITLE_MAX + 1) }));

    expect(parsed).toEqual({ ok: false, issues: { title: 'too_big' } });
  });

  it('rejects_a_destination_name_over_the_limit', () => {
    const name = 'b'.repeat(LIMITS.DESTINATION_NAME_MAX + 1);
    const parsed = parseNewTrip(values({ destination: { name, countryCode: null, center: null } }));

    expect(parsed).toEqual({ ok: false, issues: { destination: 'too_big' } });
  });

  it.each([0, LIMITS.DAYS_PER_TRIP + 1, Number.NaN, 1.5])('rejects_%s_days', (dayCount) => {
    expect(parseNewTrip(values({ dayCount }))).toEqual({
      ok: false,
      issues: { dayCount: 'invalid' },
    });
  });

  it.each([1, LIMITS.DAYS_PER_TRIP])('accepts_%s_days', (dayCount) => {
    expect(parseNewTrip(values({ dayCount })).ok).toBe(true);
  });

  it('requires_both_dates_when_dated', () => {
    expect(parseNewTrip(values({ dates: 'range' }))).toEqual({
      ok: false,
      issues: { startDate: 'required', endDate: 'required' },
    });
  });

  it('rejects_an_end_before_the_start', () => {
    const parsed = parseNewTrip(
      values({ dates: 'range', startDate: '2027-03-14', endDate: '2027-03-13' }),
    );

    expect(parsed).toEqual({ ok: false, issues: { endDate: 'before_start' } });
  });

  it('rejects_a_range_longer_than_the_day_limit', () => {
    const parsed = parseNewTrip(
      values({ dates: 'range', startDate: '2027-01-01', endDate: '2027-03-02' }),
    );

    expect(parsed).toEqual({ ok: false, issues: { endDate: 'too_big' } });
  });

  it('accepts_a_range_of_exactly_the_day_limit', () => {
    const parsed = parseNewTrip(
      values({ dates: 'range', startDate: '2027-01-01', endDate: '2027-03-01' }),
    );

    expect(parsed).toMatchObject({ ok: true, body: { dayCount: LIMITS.DAYS_PER_TRIP } });
  });
});

describe('chosenDayCount', () => {
  it('is_unknown_until_both_dates_are_set', () => {
    expect(chosenDayCount(values({ dates: 'range', startDate: '2027-03-14' }))).toBeNull();
  });

  it('follows_the_number_field_without_dates', () => {
    expect(chosenDayCount(values({ dayCount: 5 }))).toBe(5);
  });
});

describe('newTripFieldOf', () => {
  it('maps_nested_destination_paths_to_the_destination_field', () => {
    expect(newTripFieldOf(['destination', 'name'], 'none')).toBe('destination');
  });

  it('maps_the_day_count_to_the_end_date_when_dated', () => {
    expect(newTripFieldOf(['dayCount'], 'range')).toBe('endDate');
    expect(newTripFieldOf(['dayCount'], 'none')).toBe('dayCount');
  });

  it('ignores_unknown_paths', () => {
    expect(newTripFieldOf(['defaultMode'], 'none')).toBeNull();
  });
});
