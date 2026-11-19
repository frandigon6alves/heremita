import { readdirSync, readFileSync } from 'node:fs';
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
  ['--color-on-primary', '--color-primary-hover', TEXT],
  ['--color-surface', '--color-danger-hover', TEXT],
  ['--color-primary-hover', '--color-surface', NON_TEXT],
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
  // Text that inherits its background from the surface around it.
  ['--color-text', '--color-bg', TEXT],
  ['--color-bg', '--color-text', TEXT],
  ['--color-text-muted', '--color-primary-soft', TEXT],
  ['--color-text-muted', '--color-accent-soft', TEXT],
  ['--color-primary', '--color-surface-raised', TEXT],
  ['--color-primary', '--color-accent-soft', TEXT],
  ['--color-accent', '--color-bg', TEXT],
  ['--color-danger', '--color-bg', TEXT],
  ['--color-danger', '--color-surface-raised', TEXT],
  ['--color-success', '--color-bg', TEXT],
  ['--color-warning', '--color-bg', TEXT],
  ['--color-accent', '--color-accent-soft', NON_TEXT],
  ['--color-border-control', '--color-surface-raised', NON_TEXT],
  ['--color-focus', '--color-surface-raised', NON_TEXT],
];

/** Every stylesheet of the app, as `[path, text]`. */
const stylesheets = readdirSync(path.join(import.meta.dirname, '../..'), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.css'))
  .map((file) => [file, readFileSync(path.join(import.meta.dirname, '../..', file), 'utf8')]);

/**
 * `[file, selector, foreground, background]` of every rule that sets both a
 * text colour token and a background token: the pairs a component paints.
 */
function paintedPairs(): Array<[string, string, string, string]> {
  return stylesheets.flatMap(([file = '', text = '']) =>
    Array.from(text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)).flatMap(
      ([, selector = '', body = '']) => {
        const foreground = /(?:^|[;\s])color:\s*var\((--color-[\w-]+)\)/.exec(body)?.[1];
        const background = /background(?:-color)?:\s*var\((--color-[\w-]+)\)/.exec(body)?.[1];
        return foreground && background
          ? [[file, selector.trim(), foreground, background] as [string, string, string, string]]
          : [];
      },
    ),
  );
}

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

  it('finds_the_painted_pairs', () => {
    expect(paintedPairs().length).toBeGreaterThan(10);
  });

  for (const [theme, tokens] of Object.entries(themes)) {
    it(`${theme}: every colour a rule paints on its own background is readable`, () => {
      const unreadable = paintedPairs().filter(([, selector, foreground, background]) => {
        // An icon (or a swatch) needs 3:1, text 4.5:1 (V59).
        const minimum = /icon|swatch/i.test(selector) ? NON_TEXT : TEXT;
        return contrast(hex(tokens, foreground), hex(tokens, background)) < minimum;
      });
      expect(unreadable).toEqual([]);
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

/** `css` split into what sits inside `@media (hover: hover)` blocks and the rest. */
function splitHoverMedia(css: string): { inside: string; outside: string } {
  let inside = '';
  let outside = css;
  for (let start = outside.indexOf('@media (hover: hover)'); start !== -1;) {
    let depth = 0;
    let end = outside.indexOf('{', start);
    do {
      if (outside[end] === '{') depth += 1;
      if (outside[end] === '}') depth -= 1;
      end += 1;
    } while (depth > 0 && end < outside.length);
    inside += outside.slice(start, end);
    outside = outside.slice(0, start) + outside.slice(end);
    start = outside.indexOf('@media (hover: hover)');
  }
  return { inside, outside };
}

describe('hover states', () => {
  it('sit_behind_hover_hover_so_a_tap_never_leaves_one_stuck', () => {
    const stray = stylesheets
      .filter(([, text = '']) => splitHoverMedia(text).outside.includes(':hover'))
      .map(([file]) => file);

    expect(stray).toEqual([]);
  });

  it.each([
    ['shared/components/button/button.module.css', ['.primary', '.secondary', '.ghost', '.danger']],
    ['shared/components/chip-row/chip-row.module.css', ['.chip']],
    ['shared/components/segmented-control/segmented-control.module.css', ['.segment']],
    ['shared/components/rating-input/rating-input.module.css', ['.star']],
    ['app/[locale]/_components/site-chrome.module.css', ['.navLink', '.navPrimary', '.link']],
  ])('%s gives %j a hover state', (file, selectors) => {
    const [, text = ''] = stylesheets.find(([name]) => name === file) ?? [];
    const { inside } = splitHoverMedia(text);

    expect(selectors.filter((selector) => !inside.includes(`${selector}:hover`))).toEqual([]);
  });
});
