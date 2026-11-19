import { describe, expect, it } from 'vitest';
import { cachedFormatter } from './intl-cache';

describe('cachedFormatter', () => {
  it('reuses_the_formatter_of_the_same_locale_and_options', () => {
    const first = cachedFormatter(Intl.NumberFormat, 'en', { maximumFractionDigits: 1 });
    const again = cachedFormatter(Intl.NumberFormat, 'en', { maximumFractionDigits: 1 });

    expect(again).toBe(first);
    expect(first.format(1.25)).toBe('1.3');
  });

  it('builds_another_one_for_another_locale_options_or_constructor', () => {
    const en = cachedFormatter(Intl.NumberFormat, 'en', { maximumFractionDigits: 1 });

    expect(cachedFormatter(Intl.NumberFormat, 'es', { maximumFractionDigits: 1 })).not.toBe(en);
    expect(cachedFormatter(Intl.NumberFormat, 'en', { maximumFractionDigits: 2 })).not.toBe(en);
    expect(cachedFormatter(Intl.PluralRules, 'en', {})).not.toBe(en);
  });
});
