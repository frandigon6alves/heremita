import { describe, expect, it } from 'vitest';
import { WarningRecorder } from '../../test/places/provider-doubles.js';
import {
  ProviderError,
  type PlaceResult,
  type ProviderErrorKind,
  type SearchQuery,
} from '../providers/core/contract.js';
import { FakeGeocoder } from '../providers/fake/fake-geocoder.js';
import {
  mergeResults,
  needsFallback,
  searchWithFallback,
  type PlaceSearcher,
} from './search-fallback.js';

/** Stands in for Nominatim: answers fixed places (or fails) and counts its calls. */
class FallbackDouble implements PlaceSearcher {
  readonly id = 'nominatim';
  calls = 0;

  constructor(
    private readonly places: PlaceResult[],
    private readonly failWith?: ProviderErrorKind,
  ) {}

  search(): Promise<PlaceResult[]> {
    this.calls += 1;
    if (this.failWith) {
      return Promise.reject(new ProviderError(this.id, this.failWith, 'down'));
    }
    return Promise.resolve(this.places);
  }
}

const gazetteer = new FakeGeocoder();

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return { text: 'Torre Eiffel', locale: 'pt-BR', intent: 'submit', limit: 6, ...overrides };
}

async function placesFor(text: string): Promise<PlaceResult[]> {
  return gazetteer.search(query({ text, intent: 'autocomplete' }));
}

describe('needsFallback', () => {
  it('asks_when_no_result_name_contains_the_text_of_a_submit', async () => {
    expect(needsFallback(query({ text: 'Munique' }), await placesFor('Lisboa'))).toBe(true);
  });

  it('ignores_case_and_accents_when_matching_names', async () => {
    expect(needsFallback(query({ text: 'TORRE de belem' }), await placesFor('Belém'))).toBe(false);
  });

  it('never_asks_for_autocomplete', () => {
    expect(needsFallback(query({ intent: 'autocomplete' }), [])).toBe(false);
  });

  it('never_asks_for_category_browsing_without_text', () => {
    expect(needsFallback(query({ text: '', categories: ['culture'] }), [])).toBe(false);
  });
});

describe('mergeResults', () => {
  it('puts_fallback_hits_first_drops_repeats_and_caps_at_limit', async () => {
    const [a, b, c] = await gazetteer.search(query({ text: '', categories: ['sight'] }));
    if (!a || !b || !c) {
      throw new Error('gazetteer changed');
    }

    expect(mergeResults([c, a], [a, b], 2)).toEqual([c, a]);
    expect(mergeResults([c], [a, c, b], 6)).toEqual([c, a, b]);
  });
});

describe('searchWithFallback', () => {
  it('keeps_primary_results_that_match_without_calling_the_fallback', async () => {
    const fallback = new FallbackDouble([]);

    const places = await searchWithFallback(gazetteer, fallback, query({ text: 'Belém' }));

    expect(places.length).toBeGreaterThan(0);
    expect(fallback.calls).toBe(0);
  });

  it('adds_fallback_hits_when_the_primary_misses_the_text', async () => {
    const [eiffel] = await placesFor('Eiffel');
    if (!eiffel) {
      throw new Error('gazetteer changed');
    }
    const fallback = new FallbackDouble([eiffel]);

    const places = await searchWithFallback(
      gazetteer,
      fallback,
      query({ text: 'Torre Eiffelzinha' }),
    );

    expect(fallback.calls).toBe(1);
    expect(places).toEqual([eiffel]);
  });

  it('keeps_the_primary_results_when_the_fallback_fails', async () => {
    const fallback = new FallbackDouble([], 'unavailable');
    const logger = new WarningRecorder();

    const places = await searchWithFallback(
      gazetteer,
      fallback,
      query({ text: 'Munique' }),
      logger,
    );

    expect(places).toEqual([]);
    expect(logger.warnings).toEqual([
      'Search fallback nominatim failed (unavailable); primary results kept',
    ]);
  });

  it('does_nothing_more_without_a_fallback', async () => {
    await expect(searchWithFallback(gazetteer, null, query({ text: 'Munique' }))).resolves.toEqual(
      [],
    );
  });

  it('lets_a_primary_failure_through', async () => {
    const failing = new FakeGeocoder({ failWith: 'timeout' });

    await expect(
      searchWithFallback(failing, new FallbackDouble([]), query({ text: 'Munique' })),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});
