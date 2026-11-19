import { describe, expect, it } from 'vitest';
import { budgetFor, evaluate, firstLoadFiles, formatReport } from './bundle-budget';

describe('budgetFor', () => {
  it('gives_the_planner_its_240_kb_before_the_map_chunk', () => {
    expect(budgetFor('/[locale]/trips/[tripId]').limitKb).toBe(240);
  });

  it.each(['/[locale]', '/[locale]/t/[tripId]', '/[locale]/trips/[tripId]/settings'])(
    'holds_%s_to_the_180_kb_page_budget',
    (route) => {
      expect(budgetFor(route).limitKb).toBe(180);
    },
  );
});

describe('firstLoadFiles', () => {
  it('counts_each_chunk_once_across_the_runtime_and_every_entry', () => {
    expect(
      firstLoadFiles(['static/chunks/runtime.js', 'static/chunks/react.js'], {
        layout: ['static/chunks/react.js', 'static/chunks/zod.js'],
        page: ['static/chunks/zod.js', 'static/chunks/page.js'],
      }),
    ).toEqual([
      'static/chunks/page.js',
      'static/chunks/react.js',
      'static/chunks/runtime.js',
      'static/chunks/zod.js',
    ]);
  });
});

describe('evaluate', () => {
  it('flags_only_routes_above_their_budget_and_lists_the_largest_first', () => {
    const reports = evaluate([
      { route: '/[locale]/about', gzipBytes: 180_000 },
      { route: '/[locale]/trips/[tripId]', gzipBytes: 239_000 },
      { route: '/[locale]/t/[tripId]', gzipBytes: 180_001 },
    ]);

    expect(reports.map(({ route, over }) => [route, over])).toEqual([
      ['/[locale]/trips/[tripId]', false],
      ['/[locale]/t/[tripId]', true],
      ['/[locale]/about', false],
    ]);
  });
});

describe('formatReport', () => {
  it('prints_a_row_per_route_and_a_warning_summary', () => {
    const report = formatReport(
      evaluate([
        { route: '/[locale]/t/[tripId]', gzipBytes: 246_800 },
        { route: '/[locale]/about', gzipBytes: 120_000 },
      ]),
    );

    expect(report).toContain('/[locale]/t/[tripId]   246.8 KB    180 KB  WARNING over (page)');
    expect(report).toContain('/[locale]/about        120.0 KB    180 KB  ok (page)');
    expect(report).toContain('WARNING: 1 of 2 route(s) over their first-load JS budget');
  });

  it('says_so_when_every_route_fits', () => {
    expect(formatReport(evaluate([{ route: '/[locale]', gzipBytes: 90_000 }]))).toContain(
      'Every route is within its first-load JS budget.',
    );
  });
});
