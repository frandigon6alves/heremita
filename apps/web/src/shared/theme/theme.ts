import type { Theme } from '@heremita/shared';
import { THEMES } from '@heremita/shared/plain';

/** Where an anonymous viewer's theme override is kept (a per-browser convenience). */
export const THEME_STORAGE_KEY = 'hm-theme';

/**
 * Runs in <head> before first paint. A signed-in page already carries
 * `data-theme` from the account (server HTML), so the script only fills it in
 * for anonymous viewers. No attribute (or "system") follows the OS.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;if(d.hasAttribute('data-theme'))return;try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES)}.indexOf(t)>-1)d.setAttribute('data-theme',t)}catch(e){}})()`;

/**
 * Applies a theme at once and remembers it in this browser. Signed-in callers
 * also save it to the account (PATCH /me) so other devices follow.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode, quota): the attribute still applies to this page.
  }
}
