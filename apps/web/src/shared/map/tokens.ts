export type CssToken = `--${string}`;

/** A design token's current value; it follows `<html data-theme>`, so read it again on theme change. */
export function readToken(token: CssToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
