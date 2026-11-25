import { describe, expect, it } from 'vitest';
import { LIMITS } from './limits.js';
import { suggestPlacesBodySchema } from './suggestions.js';

describe('suggestPlacesBodySchema', () => {
  it('cleans_the_prompt_and_defaults_the_count', () => {
    const body = suggestPlacesBodySchema.parse({ prompt: '  street food‮ ', locale: 'es' });

    expect(body).toEqual({
      prompt: 'street food',
      locale: 'es',
      count: LIMITS.SUGGEST_COUNT.default,
    });
  });

  it.each([
    ['a prompt shorter than 3 characters', { prompt: 'ab', locale: 'en' }, ['prompt']],
    [
      'a prompt over the maximum',
      { prompt: 'x'.repeat(LIMITS.SUGGEST_PROMPT_MAX + 1), locale: 'en' },
      ['prompt'],
    ],
    ['a count over the maximum', { prompt: 'museums', locale: 'en', count: 9 }, ['count']],
    ['a count of zero', { prompt: 'museums', locale: 'en', count: 0 }, ['count']],
    ['an unknown locale', { prompt: 'museums', locale: 'fr' }, ['locale']],
    ['an unknown key', { prompt: 'museums', locale: 'en', model: 'x' }, []],
  ])('rejects_%s', (_label, input, path) => {
    const result = suggestPlacesBodySchema.safeParse(input);

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([path]);
  });
});
