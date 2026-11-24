// Grounding (V77): every idea is looked up in the geocoder and kept only when a
// real place matches it by name, near the trip, and not already in it. The
// geocoder's answer (key, name, location) is what E52 serves; the model's text
// survives only as the reason.
import { LIMITS, type LngLat, type Locale } from '@heremita/shared';
import {
  ProviderError,
  type GeocodingProvider,
  type PlaceResult,
} from '../providers/core/contract.js';
import { haversineMeters } from '../providers/core/geo.js';
import type { PlaceIdea } from './idea-generator.js';

export interface GroundedIdea {
  place: PlaceResult;
  reason: string;
}

/** What became of one idea; evals read it to tell a made-up place from one too far away. */
export type IdeaOutcome = 'kept' | 'no_match' | 'area' | 'too_far' | 'in_trip' | 'duplicate';

export interface GroundingResult {
  items: GroundedIdea[];
  /** One per idea looked up, in order. */
  outcomes: { idea: PlaceIdea; outcome: IdeaOutcome; place: PlaceResult | null }[];
  /** Ideas looked up that matched no real place nearby. */
  dropped: number;
  /** Set when the geocoder failed: lookups stopped there. */
  failure: ProviderError | null;
}

export interface GroundingInput {
  ideas: readonly PlaceIdea[];
  center: LngLat;
  /** Places to keep at most. */
  count: number;
  /** Keys of the places already in the trip. */
  excludeKeys: ReadonlySet<string>;
}

export type PlaceSearch = (name: string) => Promise<readonly PlaceResult[]>;

/** Zoom of the bias point: city scale, so a namesake in another city ranks lower. */
const BIAS_ZOOM = 12;
const SEARCH_LIMIT = 5;

/** How E52 (and its eval) looks an idea up: a submitted search biased to the trip's centre. */
export function searchNear(
  geocoder: GeocodingProvider,
  locale: Locale,
  center: LngLat,
): PlaceSearch {
  return (name) =>
    geocoder.search({
      text: name,
      locale,
      intent: 'submit',
      bias: { center, zoom: BIAS_ZOOM },
      limit: SEARCH_LIMIT,
    });
}

/** Words shorter than this ("de", "da", "la") say nothing about which place it is. */
const MIN_WORD = 3;

function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD);
}

/**
 * Whether a geocoder hit is the place the idea names: more than half of the
 * idea's meaningful words appear in the hit's name ("Torre de Belém" needs both
 * words, so "Pastéis de Belém" is not it). Photon matches loosely ("Museu
 * Imaginário" finds some "Museu"), so a hit alone proves nothing.
 */
export function namesMatch(idea: string, hit: string): boolean {
  const ideaWords = words(idea);
  if (ideaWords.length === 0) {
    return false;
  }
  const hitWords = new Set(words(hit));
  const shared = ideaWords.filter((word) => hitWords.has(word)).length;
  return shared * 2 > ideaWords.length;
}

/** Why no hit of the idea's name could be kept, checking the rules in order. */
function rejection(
  named: readonly PlaceResult[],
  center: LngLat,
  radiusMeters: number,
  excludeKeys: ReadonlySet<string>,
): Exclude<IdeaOutcome, 'kept' | 'duplicate'> {
  if (named.length === 0) {
    return 'no_match';
  }
  const places = named.filter((hit) => hit.kind !== 'area');
  if (places.length === 0) {
    return 'area';
  }
  const near = places.filter((hit) => haversineMeters(center, hit.location) <= radiusMeters);
  if (near.length === 0) {
    return 'too_far';
  }
  return near.every((hit) => excludeKeys.has(hit.key)) ? 'in_trip' : 'no_match';
}

/** Looks the ideas up one after another (the geocoder is throttled) until `count` are kept. */
export async function groundIdeas(
  input: GroundingInput,
  search: PlaceSearch,
): Promise<GroundingResult> {
  const radiusMeters = LIMITS.SUGGEST_RADIUS_KM * 1000;
  const kept = new Set<string>();
  const items: GroundedIdea[] = [];
  const outcomes: GroundingResult['outcomes'] = [];
  let dropped = 0;

  for (const idea of input.ideas) {
    if (items.length === input.count) {
      break;
    }
    let hits: readonly PlaceResult[];
    try {
      hits = await search(idea.name);
    } catch (error) {
      if (error instanceof ProviderError) {
        return { items, outcomes, dropped, failure: error };
      }
      throw error;
    }
    const named = hits.filter((hit) => namesMatch(idea.name, hit.name));
    const eligible = named.filter(
      (hit) =>
        hit.kind !== 'area' &&
        !input.excludeKeys.has(hit.key) &&
        haversineMeters(input.center, hit.location) <= radiusMeters,
    );
    const match = eligible.find((hit) => !kept.has(hit.key));
    if (match) {
      kept.add(match.key);
      items.push({ place: match, reason: idea.reason });
      outcomes.push({ idea, outcome: 'kept', place: match });
      continue;
    }
    dropped += 1;
    outcomes.push({
      idea,
      outcome:
        eligible.length > 0
          ? 'duplicate'
          : rejection(named, input.center, radiusMeters, input.excludeKeys),
      place: null,
    });
  }
  return { items, outcomes, dropped, failure: null };
}
