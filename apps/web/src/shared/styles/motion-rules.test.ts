import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(import.meta.dirname, '../..');

const stylesheets = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, css: readFileSync(path.join(SRC, file), 'utf8') }));

/** Declarations of `property` (and its longhands), as `file: value` lines. */
function declarations(property: string): Array<{ file: string; value: string; css: string }> {
  return stylesheets.flatMap(({ file, css }) =>
    Array.from(
      css.matchAll(new RegExp(`(?<![\\w-])${property}(?:-[\\w-]+)?:\\s*([^;]+);`, 'g')),
      ([, value = '']) => ({ file, value, css }),
    ),
  );
}

const LITERAL_TIME = /(?<![\w-])\d*\.?\d+m?s\b/;

describe('motion rules (V59)', () => {
  it('finds_the_stylesheets', () => {
    expect(stylesheets.length).toBeGreaterThan(10);
  });

  it('pressed_states_scale_through_the_token_that_reduced_motion_resets', () => {
    const literal = declarations('transform')
      .filter(({ value }) => /scale\(\s*[\d.]/.test(value))
      .map(({ file, value }) => `${file}: ${value}`);

    expect(literal).toEqual([]);
  });

  it('transitions_take_their_duration_from_the_motion_tokens', () => {
    const literal = declarations('transition')
      .filter(({ value }) => LITERAL_TIME.test(value))
      .map(({ file, value }) => `${file}: ${value}`);

    expect(literal).toEqual([]);
  });

  it('endless_animations_stop_in_their_own_reduced_motion_rule', () => {
    const unguarded = declarations('animation')
      .filter(({ value }) => LITERAL_TIME.test(value) && !value.includes('var(--duration'))
      .filter(({ css }) => !css.includes('@media (prefers-reduced-motion: reduce)'))
      .map(({ file, value }) => `${file}: ${value}`);

    expect(unguarded).toEqual([]);
  });
});
