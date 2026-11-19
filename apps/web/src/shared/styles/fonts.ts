import { Atkinson_Hyperlegible_Next, Fraunces } from 'next/font/google';

/** Headings and trip titles only. Self-hosted at build time: no request to Google at runtime. */
export const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  display: 'swap',
  preload: false,
  variable: '--font-fraunces',
});

/** Body and UI text; the only preloaded font. */
export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-atkinson',
  // next/font has no metric overrides for this family; the stack in tokens.css is the fallback.
  adjustFontFallback: false,
});
