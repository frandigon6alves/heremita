import type { Theme } from '@heremita/shared';
import { THEMES } from '@heremita/shared/plain';

/** Where an anonymous viewer's theme override is kept (a per-browser convenience). */
export const THEME_STORAGE_KEY = 'hm-theme';

/** The page background of each theme (`--color-bg`), for the browser's own chrome around the page. */
export const THEME_COLORS = { light: '#f5efe3', dark: '#0f1619' } as const;

/**
 * Runs in <head> before first paint. A signed-in page already carries
 * `data-theme` from the account (server HTML), so the script only fills it in
 * for anonymous viewers. No attribute (or "system") follows the OS.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;if(d.hasAttribute('data-theme'))return;try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES)}.indexOf(t)>-1)d.setAttribute('data-theme',t)}catch(e){}})()`;

/**
 * The `theme-color` metas follow the chosen theme: an override paints the
 * browser chrome in that theme's background; "system" gives each meta its
 * own colour back (the `prefers-color-scheme` pair the layout renders).
 */
function syncThemeColor(theme: Theme): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLORS[theme === 'system' ? own : theme];
  }
}

/**
 * Applies a theme at once and remembers it in this browser. Signed-in callers
 * also save it to the account (PATCH /me) so other devices follow.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  syncThemeColor(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode, quota): the attribute still applies to this page.
  }
}
