import { describe, expect, it } from 'vitest';
import { idSchema } from './common.js';

describe('idSchema', () => {
  it('reads_an_upper_case_uuid_as_the_same_lower_case_id', () => {
    expect(idSchema.parse('0193A000-0000-7000-8000-00000000ABCD')).toBe(
      '0193a000-0000-7000-8000-00000000abcd',
    );
  });

  it('rejects_a_string_that_is_not_a_uuid', () => {
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});
