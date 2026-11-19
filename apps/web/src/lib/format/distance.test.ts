import { describe, expect, it } from 'vitest';
import { formatDistance } from './distance';

describe('formatDistance', () => {
  it.each([
    [0, 'pt-BR', '0 m'],
    [9, 'pt-BR', '10 m'],
    [454, 'en', '450 m'],
    [994, 'en', '990 m'],
    [999, 'pt-BR', '1 km'],
    [1000, 'en', '1 km'],
    [3249, 'pt-BR', '3,2 km'],
    [3249, 'en', '3.2 km'],
    [3249, 'es', '3,2 km'],
    [454, 'es', '450 m'],
    [12_000, 'pt-BR', '12 km'],
  ] as const)('formats_%i_m_in_%s_as_%s', (meters, locale, expected) => {
    expect(formatDistance(meters, locale)).toBe(expected);
  });
});
