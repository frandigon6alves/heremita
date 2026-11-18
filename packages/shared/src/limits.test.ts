import { describe, expect, it } from 'vitest';
import { updateMeBodySchema } from './me.js';
import { LIMITS } from './limits.js';
import { stopOrderBodySchema } from './plan.js';
import { putReviewBodySchema } from './reviews.js';
import { createTripBodySchema } from './trips.js';
import { endpoints } from './api/endpoints.js';

const uuid = (n: number) => `0193a000-0000-7000-8000-${n.toString().padStart(12, '0')}`;

describe('LIMITS in schemas', () => {
  it('caps_a_day_at_25_stops', () => {
    const stopIds = (count: number) => Array.from({ length: count }, (_, i) => uuid(i + 1));

    expect(LIMITS.STOPS_PER_DAY).toBe(25);
    expect(stopOrderBodySchema.safeParse({ stopIds: stopIds(25) }).success).toBe(true);
    expect(stopOrderBodySchema.safeParse({ stopIds: stopIds(26) }).success).toBe(false);
  });

  it('accepts_an_empty_day_order', () => {
    expect(stopOrderBodySchema.safeParse({ stopIds: [] }).success).toBe(true);
  });

  it('caps_a_trip_title_at_120_characters', () => {
    expect(createTripBodySchema.safeParse({ title: 'a'.repeat(120) }).success).toBe(true);
    expect(createTripBodySchema.safeParse({ title: 'a'.repeat(121) }).success).toBe(false);
  });

  it('creates_0_to_60_days_and_defaults_to_1', () => {
    expect(createTripBodySchema.parse({ title: 'Lisboa' }).dayCount).toBe(1);
    expect(createTripBodySchema.safeParse({ title: 'Lisboa', dayCount: 0 }).success).toBe(true);
    expect(createTripBodySchema.safeParse({ title: 'Lisboa', dayCount: 60 }).success).toBe(true);
    expect(createTripBodySchema.safeParse({ title: 'Lisboa', dayCount: 61 }).success).toBe(false);
  });

  it('caps_a_display_name_at_50_characters', () => {
    expect(updateMeBodySchema.safeParse({ displayName: 'a'.repeat(50) }).success).toBe(true);
    expect(updateMeBodySchema.safeParse({ displayName: 'a'.repeat(51) }).success).toBe(false);
  });

  it('bounds_a_review_body_between_10_and_2000_characters_after_cleaning', () => {
    const review = (body: string) => ({ rating: 5, body, visitedMonth: '2026-05' });

    expect(putReviewBodySchema.safeParse(review('a'.repeat(10))).success).toBe(true);
    expect(putReviewBodySchema.safeParse(review(` ${'a'.repeat(9)}\u0000 `)).success).toBe(false);
    expect(putReviewBodySchema.safeParse(review('a'.repeat(2001))).success).toBe(false);
  });

  it('defaults_and_caps_list_page_sizes', () => {
    const query = endpoints.listMyTrips.query;

    expect(query.parse({})).toEqual({ limit: LIMITS.PAGE_SIZES.trips.default });
    expect(query.parse({ limit: '50' }).limit).toBe(50);
    expect(query.safeParse({ limit: '51' }).success).toBe(false);
    expect(query.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects_a_cursor_with_characters_outside_base64url', () => {
    expect(endpoints.listMyTrips.query.safeParse({ cursor: 'a+b/c=' }).success).toBe(false);
  });
});
