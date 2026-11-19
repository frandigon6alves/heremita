import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration } from './duration';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatDuration', () => {
  it.each([
    [0, 'pt-BR', '< 1 min'],
    [29, 'en', '< 1 min'],
    [30, 'en', '1 min'],
    [720, 'pt-BR', '12 min'],
    [3570, 'en', '1 hr'],
    [3900, 'pt-BR', '1 h e 5 min'],
    [3900, 'en', '1 hr, 5 min'],
    [3900, 'es', '1 h y 5 min'],
    [720, 'es', '12 min'],
    [7200, 'pt-BR', '2 h'],
  ] as const)('formats_%i_s_in_%s_as_%s', (seconds, locale, expected) => {
    expect(formatDuration(seconds, locale)).toBe(expected);
  });

  it('falls_back_to_hours_and_minutes_without_intl_duration_format', () => {
    // Intl's members are not enumerable: inherit them and shadow only DurationFormat.
    vi.stubGlobal('Intl', Object.create(Intl, { DurationFormat: { value: undefined } }));

    expect(formatDuration(3900, 'pt-BR')).toBe('1 h 5 min');
    expect(formatDuration(3900, 'en')).toBe('1 hr 5 min');
    expect(formatDuration(3900, 'es')).toBe('1 h 5 min');
    expect(formatDuration(7200, 'en')).toBe('2 hr');
    expect(formatDuration(720, 'en')).toBe('12 min');
  });
});
