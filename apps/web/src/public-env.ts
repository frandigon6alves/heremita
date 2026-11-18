import { parsePublicEnv } from './env.schema';

/**
 * Environment the browser bundle may read. Each variable is named in full so
 * Next can inline it at build time; `process.env` is not an object in the browser.
 */
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_MAP_STYLE_LIGHT: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT,
  NEXT_PUBLIC_MAP_STYLE_DARK: process.env.NEXT_PUBLIC_MAP_STYLE_DARK,
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT: process.env.NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT,
  NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK: process.env.NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK,
  NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E,
});
