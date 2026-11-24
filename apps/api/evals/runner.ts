// The eval loop, without I/O: generate → ground → score → judge, for every
// (case, rep). It drives the same generator, prompt and grounding as E52, so a
// score measures what ships. run.ts wires real or fake dependencies to it.
import type { LngLat } from '@heremita/shared';
import type { GeocodingProvider } from '../src/providers/core/contract.js';
import { groundIdeas, searchNear } from '../src/suggestions/grounding.js';
import {
  EXTRA_IDEAS,
  IdeaGeneratorError,
  type IdeaBatch,
  type IdeaGenerator,
} from '../src/suggestions/idea-generator.js';
import { GOLDEN_SET_VERSION, type EvalCase } from './golden-set.js';
import { judgeScores, type JudgeResult } from './judge.js';
import {
  costUsd,
  passes,
  scoreCase,
  stat,
  THRESHOLDS,
  type CaseRun,
  type CaseScores,
  type GroundedRow,
  type MetricName,
  type Stat,
} from './scorers.js';

export interface RunnerDeps {
  generator: IdeaGenerator;
  geocoder: GeocodingProvider;
  judge: ((evalCase: EvalCase, items: readonly GroundedRow[]) => Promise<JudgeResult>) | null;
  /** Milliseconds, for latency. */
  now: () => number;
}

export interface RunOptions {
  cases: readonly EvalCase[];
  reps: number;
  /** The model E52 is configured with (what `servedModel` is compared to). */
  requestedModel: string;
}

export interface EvalRow {
  run: CaseRun;
  scores: CaseScores | null;
  judge: {
    model: string;
    usage: JudgeResult['usage'];
    verdict: JudgeResult['verdict'];
    scores: ReturnType<typeof judgeScores>;
  } | null;
  costUsd: number | null;
  judgeCostUsd: number | null;
}

/** An attempt that produced nothing to score: kept apart, never averaged in as a zero. */
export interface EvalError {
  caseId: string;
  rep: number;
  stage: 'generate' | 'ground' | 'judge';
  kind: string;
  message: string;
}

export interface EvalReport {
  goldenSetVersion: string;
  generator: string;
  requestedModel: string;
  rows: EvalRow[];
  errors: EvalError[];
  metrics: Partial<Record<MetricName, Stat>>;
  failing: MetricName[];
  passed: boolean;
  outcomes: Record<string, number>;
  latencyMs: { p50: number; p95: number } | null;
  totals: { costUsd: number; judgeCostUsd: number; inputTokens: number; outputTokens: number };
  servedByOtherModel: number;
}

/** More than this share of attempts erroring fails the run: the numbers would not mean much. */
const MAX_ERROR_RATE = 0.1;

function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

async function runOne(
  evalCase: EvalCase,
  rep: number,
  options: RunOptions,
  deps: RunnerDeps,
): Promise<EvalRow | EvalError> {
  const center: LngLat = evalCase.destination.center;
  const base = {
    caseId: evalCase.id,
    rep,
    requestedModel: options.requestedModel,
  };
  const startedAt = deps.now();
  let batch: IdeaBatch;
  try {
    batch = await deps.generator.generate({
      prompt: evalCase.prompt,
      locale: evalCase.locale,
      count: evalCase.count + EXTRA_IDEAS,
      destination: { ...evalCase.destination },
      alreadyInTrip: evalCase.alreadyInTrip,
    });
  } catch (error) {
    if (error instanceof IdeaGeneratorError && error.kind === 'refused') {
      return {
        run: {
          ...base,
          status: 'refused',
          servedModel: null,
          latencyMs: deps.now() - startedAt,
          usage: null,
          ideas: [],
          outcomes: [],
          items: [],
        },
        scores: null,
        judge: null,
        costUsd: null,
        judgeCostUsd: null,
      };
    }
    return {
      caseId: evalCase.id,
      rep,
      stage: 'generate',
      kind: error instanceof IdeaGeneratorError ? error.kind : 'crash',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const latencyMs = deps.now() - startedAt;

  const grounded = await groundIdeas(
    { ideas: batch.ideas, center, count: evalCase.count, excludeKeys: new Set() },
    searchNear(deps.geocoder, evalCase.locale, center),
  );
  if (grounded.failure) {
    return {
      caseId: evalCase.id,
      rep,
      stage: 'ground',
      kind: grounded.failure.kind,
      message: grounded.failure.message,
    };
  }

  const run: CaseRun = {
    ...base,
    status: 'ok',
    servedModel: batch.model,
    latencyMs,
    usage: batch.usage,
    ideas: batch.ideas,
    outcomes: grounded.outcomes.map(({ idea, outcome, place }) => ({
      idea: idea.name,
      outcome,
      key: place?.key ?? null,
    })),
    items: grounded.items.map(({ place, reason }) => ({
      name: place.name,
      category: place.category,
      reason,
      key: place.key,
    })),
  };
  const row: EvalRow = {
    run,
    scores: scoreCase(evalCase, run),
    judge: null,
    costUsd: costUsd(batch.model, batch.usage),
    judgeCostUsd: null,
  };
  if (deps.judge && run.items.length > 0) {
    try {
      const result = await deps.judge(evalCase, run.items);
      row.judge = { ...result, scores: judgeScores(result.verdict, run.items.length) };
      row.judgeCostUsd = costUsd(result.model, result.usage);
    } catch (error) {
      return {
        caseId: evalCase.id,
        rep,
        stage: 'judge',
        kind: 'judge_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return row;
}

export async function runEvals(options: RunOptions, deps: RunnerDeps): Promise<EvalReport> {
  const rows: EvalRow[] = [];
  const errors: EvalError[] = [];
  // One at a time: the geocoder is throttled, and order stays deterministic.
  for (const evalCase of options.cases) {
    for (let rep = 1; rep <= options.reps; rep += 1) {
      const result = await runOne(evalCase, rep, options, deps);
      if ('stage' in result) {
        errors.push(result);
      } else {
        rows.push(result);
      }
    }
  }

  const scored = rows.filter((row) => row.scores !== null);
  const pick = (read: (scores: CaseScores) => number | null) =>
    scored.flatMap((row) => {
      const value = row.scores && read(row.scores);
      return value === null || value === undefined ? [] : [value];
    });
  const pickJudge = (read: (scores: NonNullable<ReturnType<typeof judgeScores>>) => number) =>
    rows.flatMap((row) => (row.judge?.scores ? [read(row.judge.scores)] : []));

  const metrics: Partial<Record<MetricName, Stat>> = {
    groundedRate: stat(pick((s) => s.groundedRate)),
    noMatchRate: stat(pick((s) => s.noMatchRate)),
    countMet: stat(pick((s) => s.countMet)),
    categoryMatch: stat(pick((s) => s.categoryMatch)),
    tripRepeatRate: stat(pick((s) => s.tripRepeatRate)),
    refusalRate: stat(rows.map((row) => (row.run.status === 'refused' ? 1 : 0))),
  };
  if (deps.judge) {
    metrics.fitsRequest = stat(pickJudge((s) => s.fitsRequest));
    metrics.reasonInLanguage = stat(pickJudge((s) => s.reasonInLanguage));
    metrics.reasonAccurate = stat(pickJudge((s) => s.reasonAccurate));
  }

  const failing = (Object.keys(THRESHOLDS) as MetricName[]).filter((name) => {
    const value = metrics[name];
    return value !== undefined && value.n > 0 && !passes(name, value.mean);
  });
  const attempts = rows.length + errors.length;
  const tooManyErrors = attempts === 0 || errors.length / attempts > MAX_ERROR_RATE;

  const outcomes: Record<string, number> = {};
  for (const row of rows) {
    for (const { outcome } of row.run.outcomes) {
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
  }
  const latencies = rows
    .filter((row) => row.run.status === 'ok')
    .map((row) => row.run.latencyMs)
    .sort((a, b) => a - b);

  return {
    goldenSetVersion: GOLDEN_SET_VERSION,
    generator: deps.generator.id,
    requestedModel: options.requestedModel,
    rows,
    errors,
    metrics,
    failing,
    passed: failing.length === 0 && !tooManyErrors,
    outcomes,
    latencyMs:
      latencies.length > 0
        ? { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) }
        : null,
    totals: {
      costUsd: rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
      judgeCostUsd: rows.reduce((sum, row) => sum + (row.judgeCostUsd ?? 0), 0),
      inputTokens: rows.reduce((sum, row) => sum + (row.run.usage?.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((sum, row) => sum + (row.run.usage?.outputTokens ?? 0), 0),
    },
    servedByOtherModel: rows.filter(
      (row) =>
        row.run.servedModel !== null &&
        deps.generator.id === 'claude' &&
        row.run.servedModel !== options.requestedModel,
    ).length,
  };
}
