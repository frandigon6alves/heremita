import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, THEME_SCRIPT, THEME_STORAGE_KEY } from './theme';

function runThemeScript(): void {
  // The same string the root layout inlines in <head>.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs our own constant script, as the browser does
  (new Function(THEME_SCRIPT) as () => void)();
}

describe('theme script', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies_the_stored_override_for_an_anonymous_viewer', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    runThemeScript();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps_the_server_theme_of_a_signed_in_viewer', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    runThemeScript();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores_an_unknown_stored_value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');

    runThemeScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('leaves_the_os_preference_in_charge_without_an_override', () => {
    runThemeScript();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('apply_theme_swaps_the_attribute_and_remembers_it', () => {
    applyTheme('system');

    expect(document.documentElement.dataset.theme).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('applyTheme', () => {
  function themeColorMetas(): HTMLMetaElement[] {
    return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  }

  beforeEach(() => {
    // The pair the layout renders for "system".
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5efe3">' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1619">';
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('paints_the_browser_chrome_in_the_chosen_theme_and_remembers_it', () => {
    applyTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(themeColorMetas().map((meta) => meta.content)).toEqual(['#0f1619', '#0f1619']);
  });

  it('gives_each_theme_color_meta_its_own_colour_back_for_system', () => {
    applyTheme('light');
    applyTheme('system');

    expect(themeColorMetas().map((meta) => meta.content)).toEqual(['#f5efe3', '#0f1619']);
  });
});
