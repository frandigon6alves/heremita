import { localeSchema, type Locale } from '@heremita/shared';
import { defineRouting } from 'next-intl/routing';

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/**
 * Every URL carries its locale (`/pt-BR/...`, `/en/...`). An unprefixed URL is
 * redirected by the `NEXT_LOCALE` cookie, then `Accept-Language`, then pt-BR.
 */
export const routing = defineRouting({
  locales: localeSchema.options,
  defaultLocale: DEFAULT_LOCALE,
});

/** Each language named in itself, for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português (Brasil)',
  en: 'English',
};
