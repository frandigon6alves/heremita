import { describe, expect, it } from 'vitest';
import { cleanText, textSchema } from './text.js';

describe('cleanText', () => {
  it('strips_c0_and_c1_control_characters_but_keeps_line_feeds', () => {
    const result = cleanText('a\u0000b\u0007c\td\r\ne\u0085f\u009Fg\u007Fh');

    expect(result).toBe('abcd\nefgh');
  });

  it('strips_bidi_overrides_and_isolates', () => {
    const result = cleanText('Ana‮gnp.exe‬ ⁦x⁩');

    expect(result).toBe('Anagnp.exe x');
  });

  it('collapses_more_than_two_blank_lines_into_two', () => {
    const result = cleanText('one\n\n\n\n\n\ntwo\n \n\t\n  \n\nthree');

    expect(result).toBe('one\n\n\ntwo\n\n\nthree');
  });

  it('keeps_up_to_two_blank_lines', () => {
    const result = cleanText('one\n\ntwo\n\n\nthree');

    expect(result).toBe('one\n\ntwo\n\n\nthree');
  });

  it('normalises_to_nfc', () => {
    const decomposed = 'São Paulo';

    const result = cleanText(decomposed);

    expect(result).toBe('São Paulo');
  });

  it('trims_surrounding_whitespace', () => {
    expect(cleanText('  \n Lisboa \n ')).toBe('Lisboa');
  });

  it('returns_empty_for_text_made_only_of_controls', () => {
    expect(cleanText('‮\u0000 \u0007')).toBe('');
  });
});

describe('textSchema', () => {
  it('checks_length_after_cleaning', () => {
    const schema = textSchema(1, 5);

    expect(schema.safeParse('  abcde  ').success).toBe(true);
    expect(schema.safeParse('‮\u0000 ').success).toBe(false);
    expect(schema.safeParse('abcdef').success).toBe(false);
  });

  it('returns_the_cleaned_text', () => {
    expect(textSchema(0, 10).parse(' a\u0000b ')).toBe('ab');
  });

  it('rejects_non_strings', () => {
    expect(textSchema(0, 10).safeParse(42).success).toBe(false);
  });
});
