import { describe, expect, it } from 'vitest';
import { clampIndex, insertAt } from './day-order.js';

describe('clampIndex', () => {
  it('appends_without_an_index', () => {
    expect(clampIndex(undefined, 3)).toBe(3);
  });

  it('keeps_an_index_within_the_list', () => {
    expect(clampIndex(0, 3)).toBe(0);
    expect(clampIndex(3, 3)).toBe(3);
  });

  it('clamps_an_index_past_the_end_to_the_end', () => {
    expect(clampIndex(99, 3)).toBe(3);
    expect(clampIndex(1, 0)).toBe(0);
  });
});

describe('insertAt', () => {
  it('inserts_at_the_start_middle_and_end', () => {
    expect(insertAt(['a', 'b'], 'x', 0)).toEqual(['x', 'a', 'b']);
    expect(insertAt(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
    expect(insertAt(['a', 'b'], 'x', 2)).toEqual(['a', 'b', 'x']);
  });

  it('appends_when_the_index_is_missing_or_too_large', () => {
    expect(insertAt(['a'], 'x', undefined)).toEqual(['a', 'x']);
    expect(insertAt(['a'], 'x', 7)).toEqual(['a', 'x']);
  });

  it('starts_an_empty_list', () => {
    expect(insertAt([], 'x', 4)).toEqual(['x']);
  });
});
