import { LIMITS } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { excerptOf } from './report-item.mapper.js';

describe('excerptOf', () => {
  it('keeps_short_text_whole', () => {
    expect(excerptOf('Porto a pé')).toBe('Porto a pé');
  });

  it('cuts_at_the_excerpt_maximum', () => {
    expect(excerptOf('x'.repeat(LIMITS.REPORT_EXCERPT_MAX + 1))).toHaveLength(
      LIMITS.REPORT_EXCERPT_MAX,
    );
  });

  it('never_ends_inside_a_surrogate_pair', () => {
    const text = `${'x'.repeat(LIMITS.REPORT_EXCERPT_MAX - 1)}🗺️`;

    expect(excerptOf(text)).toBe('x'.repeat(LIMITS.REPORT_EXCERPT_MAX - 1));
  });
});
