import type { Locale } from '@heremita/shared';
import { DEFAULT_LOCALE, LOCALES } from '@heremita/shared/plain';
import { defineRouting } from 'next-intl/routing';

/**
 * Every URL carries its locale (`/en/...`, `/es/...`, `/pt-BR/...`). An
 * unprefixed URL is redirected by the `NEXT_LOCALE` cookie (the last locale the
 * visitor used), then the best `Accept-Language` match, then English.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
});

/** Each language named in itself, for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
};
