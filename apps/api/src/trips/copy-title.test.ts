import { LIMITS } from '@heremita/shared';
import { describe, expect, it } from 'vitest';
import { copyTitle } from './copy-title.js';

describe('copyTitle', () => {
  it('prefixes_the_title_in_the_copier_language', () => {
    expect(copyTitle('Lisboa em 3 dias', 'en')).toBe('Copy of Lisboa em 3 dias');
    expect(copyTitle('Lisboa em 3 dias', 'es')).toBe('Copia de Lisboa em 3 dias');
    expect(copyTitle('Lisboa em 3 dias', 'pt-BR')).toBe('Cópia de Lisboa em 3 dias');
  });

  it('cuts_a_long_title_to_the_limit', () => {
    const title = copyTitle('a'.repeat(LIMITS.TRIP_TITLE_MAX), 'en');

    expect(title).toHaveLength(LIMITS.TRIP_TITLE_MAX);
    expect(title.startsWith('Copy of a')).toBe(true);
  });

  it('never_splits_a_character_made_of_two_code_units', () => {
    const title = copyTitle('🗺'.repeat(LIMITS.TRIP_TITLE_MAX), 'en');

    expect(Array.from(title)).toHaveLength(LIMITS.TRIP_TITLE_MAX);
    expect(title.endsWith('🗺')).toBe(true);
  });

  it('drops_a_space_left_at_the_cut', () => {
    const sourceTitle = `${'b'.repeat(LIMITS.TRIP_TITLE_MAX - 'Copy of '.length - 1)} tail`;

    expect(copyTitle(sourceTitle, 'en').endsWith('b')).toBe(true);
  });
});
