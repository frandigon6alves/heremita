import { describe, expect, it } from 'vitest';
import { FakeGeocoder } from '../src/providers/fake/fake-geocoder.js';
import { FakeIdeaGenerator } from '../src/suggestions/fake-idea-generator.js';
import type { IdeaGenerator } from '../src/suggestions/idea-generator.js';
import type { EvalCase } from './golden-set.js';
import { renderMarkdown } from './report.js';
import { runEvals, type RunnerDeps } from './runner.js';
import { scoreCase, type CaseRun } from './scorers.js';

// Cases inside the fake gazetteer, so the offline pipeline has real answers.
const CASES: EvalCase[] = [
  {
    id: 'lisboa-anything',
    locale: 'pt-BR',
    prompt: 'Qualquer coisa',
    count: 3,
    destination: { name: 'Lisboa', countryCode: 'PT', center: { lng: -9.1393, lat: 38.7223 } },
    alreadyInTrip: [],
    expectedCategories: null,
    tags: [],
  },
  {
    id: 'paris-anything',
    locale: 'en',
    prompt: 'Anything',
    count: 2,
    destination: { name: 'Paris', countryCode: 'FR', center: { lng: 2.3522, lat: 48.8566 } },
    alreadyInTrip: [],
    expectedCategories: null,
    tags: [],
  },
];

let tick = 0;
const deps = (generator: IdeaGenerator, judge: RunnerDeps['judge'] = null): RunnerDeps => ({
  generator,
  geocoder: new FakeGeocoder(),
  judge,
  now: () => (tick += 100),
});

const OPTIONS = { cases: CASES, reps: 2, requestedModel: 'claude-opus-5-5' };

describe('runEvals', () => {
  it('passes_the_oracle_the_offline_pipeline_with_real_gazetteer_answers', async () => {
    const report = await runEvals(OPTIONS, deps(new FakeIdeaGenerator()));

    expect(report.errors).toEqual([]);
    expect(report.rows).toHaveLength(4);
    expect(report.metrics.groundedRate?.mean).toBe(1);
    expect(report.metrics.countMet?.mean).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('fails_the_null_baseline_that_suggests_nothing', async () => {
    const empty: IdeaGenerator = {
      id: 'fake',
      generate: () => Promise.resolve({ ideas: [], model: 'null', usage: null }),
    };

    const report = await runEvals(OPTIONS, deps(empty));

    expect(report.passed).toBe(false);
    expect(report.failing).toEqual(expect.arrayContaining(['groundedRate', 'countMet']));
  });

  it('scores_a_refusal_as_a_refusal_and_an_outage_as_an_error_never_as_a_zero', async () => {
    const refused = await runEvals(OPTIONS, deps(new FakeIdeaGenerator({ failWith: 'refused' })));
    const down = await runEvals(OPTIONS, deps(new FakeIdeaGenerator({ failWith: 'upstream' })));

    expect(refused.metrics.refusalRate?.mean).toBe(1);
    expect(refused.errors).toEqual([]);
    expect(refused.failing).toContain('refusalRate');
    expect(down.rows).toEqual([]);
    expect(down.errors).toHaveLength(4);
    expect(down.errors[0]).toMatchObject({ stage: 'generate', kind: 'upstream' });
    expect(down.passed).toBe(false);
  });

  it('adds_the_judge_scores_and_the_judge_cost_apart', async () => {
    const report = await runEvals(
      { ...OPTIONS, reps: 1 },
      deps(new FakeIdeaGenerator(), (_case, items) =>
        Promise.resolve({
          model: 'claude-opus-5-5',
          usage: { inputTokens: 1_000_000, outputTokens: 0 },
          verdict: {
            places: items.map((_item, index) => ({
              index: index + 1,
              fits_request: index === 0,
              reason_in_language: true,
              reason_accurate: true,
            })),
          },
        }),
      ),
    );

    // Lisboa: 1 of 3 places fit; Paris: 1 of 2.
    expect(report.metrics.fitsRequest?.mean).toBeCloseTo((1 / 3 + 1 / 2) / 2);
    expect(report.metrics.reasonInLanguage?.mean).toBe(1);
    expect(report.totals.judgeCostUsd).toBe(8);
    expect(report.totals.costUsd).toBe(0);
    expect(renderMarkdown(report, '2026-11-24T00:00:00Z')).toContain(
      'Judge: place fits the request',
    );
  });
});

describe('scoreCase', () => {
  const run = (overrides: Partial<CaseRun>): CaseRun => ({
    caseId: 'c',
    rep: 1,
    status: 'ok',
    requestedModel: 'm',
    servedModel: 'm',
    latencyMs: 1,
    usage: null,
    ideas: [],
    outcomes: [],
    items: [],
    ...overrides,
  });

  it('counts_ideas_that_repeat_the_trip_and_places_of_unexpected_categories', () => {
    const scores = scoreCase(
      { ...CASES[0]!, count: 2, alreadyInTrip: ['Torre de Belém'], expectedCategories: ['food'] },
      run({
        ideas: [
          { name: 'Torre de Belem', category: 'sight', reason: '' },
          { name: 'Time Out Market', category: 'food', reason: '' },
        ],
        outcomes: [
          { idea: 'Torre de Belem', outcome: 'kept', key: 'osm:N:1' },
          { idea: 'Time Out Market', outcome: 'no_match', key: null },
        ],
        items: [{ name: 'Torre de Belém', category: 'sight', reason: '', key: 'osm:N:1' }],
      }),
    );

    expect(scores).toEqual({
      groundedRate: 0.5,
      noMatchRate: 0.5,
      countMet: 0,
      categoryMatch: 0,
      tripRepeatRate: 0.5,
    });
  });
});
