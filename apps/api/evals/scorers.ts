// Deterministic scores of one (case, rep): what the geocoder confirmed, not what
// the model claims. The LLM judge (judge.ts) adds the properties a check cannot see.
import type { IdeaOutcome } from '../src/suggestions/grounding.js';
import type { PlaceIdea } from '../src/suggestions/idea-generator.js';
import { namesMatch } from '../src/suggestions/grounding.js';
import type { EvalCase } from './golden-set.js';

export interface GroundedRow {
  name: string;
  category: string;
  reason: string;
  key: string;
}

/** A (case, rep) that produced an answer: scored. Infra failures never get here (errors.jsonl). */
export interface CaseRun {
  caseId: string;
  rep: number;
  status: 'ok' | 'refused';
  requestedModel: string;
  servedModel: string | null;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
  ideas: PlaceIdea[];
  outcomes: { idea: string; outcome: IdeaOutcome; key: string | null }[];
  items: GroundedRow[];
}

export interface CaseScores {
  /** Ideas the geocoder confirmed as a real place nearby, over ideas looked up. */
  groundedRate: number;
  /** Ideas no real place with that name matched at all: the hallucination proxy. */
  noMatchRate: number;
  /** 1 when at least `count` places came back. */
  countMet: number;
  /** Kept places whose category is one the case expects; `null` when any fits. */
  categoryMatch: number | null;
  /** Ideas naming a place the trip already holds: the model ignored the context. */
  tripRepeatRate: number;
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export function scoreCase(evalCase: EvalCase, run: CaseRun): CaseScores {
  const looked = run.outcomes.length;
  const kept = run.outcomes.filter((entry) => entry.outcome === 'kept').length;
  const noMatch = run.outcomes.filter((entry) => entry.outcome === 'no_match').length;
  const repeats = run.ideas.filter((idea) =>
    evalCase.alreadyInTrip.some((name) => namesMatch(name, idea.name)),
  ).length;
  const expected = evalCase.expectedCategories;
  return {
    groundedRate: ratio(kept, looked),
    noMatchRate: ratio(noMatch, looked),
    countMet: run.items.length >= evalCase.count ? 1 : 0,
    categoryMatch:
      expected === null
        ? null
        : ratio(
            run.items.filter((item) => (expected as string[]).includes(item.category)).length,
            run.items.length,
          ),
    tripRepeatRate: ratio(repeats, run.ideas.length),
  };
}

export interface Stat {
  mean: number;
  /** Half-width of a normal 95% interval over the rows (0 for one row). */
  ci95: number;
  n: number;
}

export function stat(values: readonly number[]): Stat {
  const n = values.length;
  if (n === 0) {
    return { mean: Number.NaN, ci95: 0, n };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n === 1) {
    return { mean, ci95: 0, n };
  }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  return { mean, ci95: (1.96 * Math.sqrt(variance)) / Math.sqrt(n), n };
}

/** US$ per million tokens, input / output (Anthropic list prices, 2026-11). */
export const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/** Cost of a call from its recorded tokens and the model that served it; `null` when unpriced. */
export function costUsd(
  model: string | null,
  usage: { inputTokens: number; outputTokens: number } | null,
): number | null {
  const price = model === null ? undefined : PRICES[model];
  if (!price || !usage) {
    return null;
  }
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** The bar a run must clear (exit code 1 otherwise). */
export const THRESHOLDS = {
  groundedRate: { min: 0.7 },
  noMatchRate: { max: 0.2 },
  countMet: { min: 0.8 },
  categoryMatch: { min: 0.7 },
  tripRepeatRate: { max: 0.05 },
  refusalRate: { max: 0 },
  fitsRequest: { min: 0.85 },
  reasonInLanguage: { min: 0.95 },
  reasonAccurate: { min: 0.85 },
} as const;

export type MetricName = keyof typeof THRESHOLDS;

export function passes(metric: MetricName, value: number): boolean {
  const bar: { min?: number; max?: number } = THRESHOLDS[metric];
  return (bar.min === undefined || value >= bar.min) && (bar.max === undefined || value <= bar.max);
}
