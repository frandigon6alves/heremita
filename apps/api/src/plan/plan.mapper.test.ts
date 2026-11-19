import { describe, expect, it } from 'vitest';
import { dayDate, toPlaceSummary } from './plan.mapper.js';

describe('dayDate', () => {
  it('is_null_without_a_start_date', () => {
    expect(dayDate(null, 0)).toBeNull();
  });

  it('adds_the_day_position_to_the_start_date_across_month_and_year_ends', () => {
    const start = new Date('2026-12-30T00:00:00.000Z');

    expect(dayDate(start, 0)).toBe('2026-12-30');
    expect(dayDate(start, 2)).toBe('2027-01-01');
  });
});

describe('toPlaceSummary', () => {
  const base = {
    id: '0190d3a4-0000-7000-8000-000000000001',
    name: 'Torre de Belém',
    label: null,
    category: 'sight',
    lng: -9.2159,
    lat: 38.6916,
    countryCode: 'PT',
  } as const;

  it('builds_the_key_of_an_osm_place', () => {
    const summary = toPlaceSummary({ ...base, source: 'osm', osmType: 'W', osmId: 24341353n });

    expect(summary.key).toBe('osm:W:24341353');
    expect(summary.location).toEqual({ lng: -9.2159, lat: 38.6916 });
  });

  it('gives_a_custom_place_no_key', () => {
    expect(
      toPlaceSummary({ ...base, source: 'custom', osmType: null, osmId: null }).key,
    ).toBeNull();
  });
});
