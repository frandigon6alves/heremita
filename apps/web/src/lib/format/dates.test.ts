import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatCalendarDate, formatRelativeTime, formatYearMonth } from './dates';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatCalendarDate', () => {
  it('formats_a_trip_date_with_weekday', () => {
    expect(formatCalendarDate('2026-03-14', 'pt-BR')).toBe('sáb., 14 de mar.');
    expect(formatCalendarDate('2026-03-14', 'en')).toBe('Sat, Mar 14');
    expect(formatCalendarDate('2026-03-14', 'es')).toBe('sáb, 14 mar');
  });

  // Node reads TZ on every Date operation, so the process zone can change here.
  it.each(['America/Sao_Paulo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])(
    'keeps_the_same_day_with_the_process_in_%s',
    (zone) => {
      vi.stubEnv('TZ', zone);

      expect(
        formatCalendarDate('2026-01-01', 'en', { day: 'numeric', month: 'short', year: 'numeric' }),
      ).toBe('Jan 1, 2026');
      expect(formatCalendarDate('2026-12-31', 'pt-BR', { day: 'numeric', month: 'numeric' })).toBe(
        '31/12',
      );
    },
  );
});

describe('formatYearMonth', () => {
  it('formats_a_visit_month', () => {
    expect(formatYearMonth('2026-10', 'pt-BR')).toBe('out. de 2026');
    expect(formatYearMonth('2026-10', 'en')).toBe('Oct 2026');
    expect(formatYearMonth('2026-10', 'es')).toBe('oct 2026');
  });
});

describe('addDays', () => {
  it('crosses_month_and_year_ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-14', 0)).toBe('2026-03-14');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it.each([
    ['2026-11-18T11:59:30Z', 'en', '30 seconds ago'],
    ['2026-11-18T11:55:00Z', 'en', '5 minutes ago'],
    ['2026-11-17T12:00:00Z', 'en', 'yesterday'],
    ['2026-11-15T12:00:00Z', 'pt-BR', 'há 3 dias'],
    ['2026-08-18T12:00:00Z', 'pt-BR', 'há 3 meses'],
    ['2026-11-17T12:00:00Z', 'es', 'ayer'],
    ['2026-11-15T12:00:00Z', 'es', 'hace 3 días'],
    ['2024-11-18T12:00:00Z', 'en', '2 years ago'],
  ] as const)('formats_%s_as_%s', (timestamp, locale, expected) => {
    expect(formatRelativeTime(timestamp, now, locale)).toBe(expected);
  });
});
