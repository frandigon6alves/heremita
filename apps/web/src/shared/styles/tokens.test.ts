import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

/** Custom properties declared in the first rule whose selector list starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`No rule for ${selector}`);
  }
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return new Map(
    Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), ([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  );
}

function hex(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${name} is not a 6-digit hex colour: ${value}`);
  }
  return value;
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(colour: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(colour.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;

/** [foreground, background, minimum]: text pairs need 4.5:1, controls and focus rings 3:1 (V59). */
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ['--color-text', '--color-bg', TEXT],
  ['--color-text', '--color-surface', TEXT],
  ['--color-text', '--color-surface-raised', TEXT],
  ['--color-text', '--color-primary-soft', TEXT],
  ['--color-text', '--color-accent-soft', TEXT],
  ['--color-text-muted', '--color-bg', TEXT],
  ['--color-text-muted', '--color-surface', TEXT],
  ['--color-text-muted', '--color-surface-raised', TEXT],
  ['--color-primary', '--color-bg', TEXT],
  ['--color-primary', '--color-surface', TEXT],
  ['--color-primary', '--color-primary-soft', TEXT],
  ['--color-accent', '--color-surface', TEXT],
  ['--color-on-primary', '--color-primary', TEXT],
  ['--color-on-accent', '--color-accent', TEXT],
  ['--color-danger', '--color-surface', TEXT],
  ['--color-success', '--color-surface', TEXT],
  ['--color-warning', '--color-surface', TEXT],
  ['--color-surface', '--color-danger', TEXT],
  ['--color-surface', '--color-warning', TEXT],
  ['--color-border-control', '--color-surface', NON_TEXT],
  ['--color-border-control', '--color-bg', NON_TEXT],
  ['--color-focus', '--color-surface', NON_TEXT],
  ['--color-focus', '--color-bg', NON_TEXT],
];

const themes = {
  light: block(":root,\n[data-theme='light']"),
  dark: block("[data-theme='dark']"),
};

describe('colour tokens', () => {
  for (const [theme, tokens] of Object.entries(themes)) {
    it.each(PAIRS)(`${theme}: %s on %s reaches %d:1`, (foreground, background, minimum) => {
      expect(contrast(hex(tokens, foreground), hex(tokens, background))).toBeGreaterThanOrEqual(
        minimum,
      );
    });
  }

  it('dark_follows_the_os_with_the_same_values_as_the_dark_override', () => {
    expect(block(':root:not([data-theme])')).toEqual(themes.dark);
  });

  it('defines_the_same_tokens_in_both_themes', () => {
    expect([...themes.dark.keys()].sort()).toEqual([...themes.light.keys()].sort());
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('day %d carries a white number at 4.5:1', (day) => {
    expect(
      contrast(hex(block(':root {\n  /* Day'), `--day-${day}`), '#ffffff'),
    ).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('motion tokens', () => {
  it('drop_every_duration_to_zero_under_reduced_motion', () => {
    const tokens = block('@media (prefers-reduced-motion: reduce)');

    expect(tokens.get('--duration-fast')).toBe('0ms');
    expect(tokens.get('--duration-base')).toBe('0ms');
    expect(tokens.get('--duration-slow')).toBe('0ms');
  });
});
