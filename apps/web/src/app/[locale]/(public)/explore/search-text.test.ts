import { describe, expect, it } from 'vitest';
import { searchText } from './search-text';

describe('searchText', () => {
  it('trims_the_text', () => {
    expect(searchText('  lisboa ')).toBe('lisboa');
  });

  it('reads_a_missing_or_repeated_param_as_no_search', () => {
    expect(searchText(undefined)).toBe('');
    expect(searchText(['a', 'b'])).toBe('');
  });

  it('cuts_the_text_to_the_api_limit', () => {
    expect(searchText('x'.repeat(100))).toHaveLength(80);
  });
});
