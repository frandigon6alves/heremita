import { ratingSummarySchema } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { summariseRatings } from './rating-summary.reader.js';

describe('summariseRatings', () => {
  it('shows_only_the_count_below_six_reviews', () => {
    expect(summariseRatings([0, 0, 0, 0, 0])).toEqual({
      count: 0,
      average: null,
      distribution: null,
    });
    expect(summariseRatings([1, 0, 0, 0, 4])).toEqual({
      count: 5,
      average: null,
      distribution: null,
    });
  });

  it('adds_the_average_and_distribution_from_six_reviews', () => {
    const summary = summariseRatings([1, 0, 0, 1, 4]);

    expect(summary).toEqual({ count: 6, average: 25 / 6, distribution: [1, 0, 0, 1, 4] });
    expect(ratingSummarySchema.safeParse(summary).success).toBe(true);
  });
});
