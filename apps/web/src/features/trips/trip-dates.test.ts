import { describe, expect, it } from 'vitest';
import { daysInRange, formatTripDates } from './trip-dates';

describe('daysInRange', () => {
  it('counts_both_ends', () => {
    expect(daysInRange('2027-03-14', '2027-03-17')).toBe(4);
  });

  it('is_one_for_a_single_day', () => {
    expect(daysInRange('2027-03-14', '2027-03-14')).toBe(1);
  });

  it('is_not_positive_when_the_end_comes_first', () => {
    expect(daysInRange('2027-03-14', '2027-03-13')).toBe(0);
  });

  it('crosses_months_and_leap_days', () => {
    expect(daysInRange('2028-02-27', '2028-03-01')).toBe(4);
  });
});

describe('formatTripDates', () => {
  it('formats_a_single_day', () => {
    expect(formatTripDates('2027-03-14', 1, 'en')).toBe('Mar 14, 2027');
  });

  it('formats_first_to_last_day_in_utc_with_plain_spaces', () => {
    // Plain spaces around the dash whatever ICU pads it with: the server and the browser must agree.
    expect(formatTripDates('2027-03-14', 4, 'en')).toBe('Mar 14 – 17, 2027');
  });

  it('formats_in_portuguese', () => {
    expect(formatTripDates('2027-03-14', 4, 'pt-BR')).toMatch(/^14.+17 de mar\.? de 2027$/);
  });

  it('treats_a_trip_without_days_as_its_start_date', () => {
    expect(formatTripDates('2027-12-31', 0, 'en')).toBe('Dec 31, 2027');
  });
});
