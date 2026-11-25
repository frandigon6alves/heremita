// Contract between E52 and whatever writes its place ideas (Claude, or the fake).
// An idea is only a name and a reason: it becomes a place only if the geocoder
// finds a real one for it (grounding.ts), so model text never reaches the plan.
import {
  placeCategorySchema,
  type LngLat,
  type Locale,
  type PlaceCategory,
} from '@heremita/shared';
import { z } from 'zod';

export interface IdeaRequest {
  /** The owner's words, cleaned by the body schema. Data for the model, never instructions. */
  prompt: string;
  locale: Locale;
  /** Ideas to ask for: more than the answer keeps, since some never match a real place. */
  count: number;
  destination: { name: string | null; countryCode: string | null; center: LngLat };
  /** Names of the places already in the trip, so they are not suggested again. */
  alreadyInTrip: readonly string[];
}

export const placeIdeaSchema = z.object({
  name: z.string().describe('The place as it is named on the map, in the local language.'),
  category: placeCategorySchema.describe('What kind of place it is.'),
  reason: z
    .string()
    .describe('One short sentence, at most 140 characters, on why it fits the request.'),
});
export type PlaceIdea = { name: string; category: PlaceCategory; reason: string };

export interface IdeaBatch {
  ideas: PlaceIdea[];
  /** Model that answered (a fallback model when the first one declined). */
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type IdeaFailureKind = 'refused' | 'invalid_output' | 'timeout' | 'upstream';

/** The generator could not produce ideas; E52 answers 503 `ai_unavailable`. */
export class IdeaGeneratorError extends Error {
  override readonly name = 'IdeaGeneratorError';

  constructor(
    readonly kind: IdeaFailureKind,
    message: string,
  ) {
    super(message);
  }
}

export type IdeaGeneratorId = 'claude' | 'fake';

export interface IdeaGenerator {
  readonly id: IdeaGeneratorId;
  generate(request: IdeaRequest, signal?: AbortSignal): Promise<IdeaBatch>;
}

/** Injection token; the value is `null` when `AI_PROVIDER=off`. */
export const IDEA_GENERATOR = Symbol('IDEA_GENERATOR');

/** Ideas asked for beyond the places wanted: some never match a real place and are dropped. */
export const EXTRA_IDEAS = 2;

/** Longest reason kept: the model is asked for 140 characters, the UI shows two lines. */
export const REASON_MAX = 200;

/** Trims what a generator returned into the shape E52 relies on. */
export function tidyIdeas(ideas: readonly PlaceIdea[], count: number): PlaceIdea[] {
  const seen = new Set<string>();
  const tidy: PlaceIdea[] = [];
  for (const idea of ideas) {
    const name = idea.name.trim();
    const folded = name.toLowerCase();
    if (name === '' || seen.has(folded)) {
      continue;
    }
    seen.add(folded);
    const reason = idea.reason.trim();
    tidy.push({
      name,
      category: idea.category,
      reason: reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX - 1).trimEnd()}…` : reason,
    });
    if (tidy.length === count) {
      break;
    }
  }
  return tidy;
}
