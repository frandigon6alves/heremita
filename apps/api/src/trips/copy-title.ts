import { LIMITS, type Locale } from '@heremita/shared';

const COPY_TITLE_PREFIX: Record<Locale, string> = {
  en: 'Copy of',
  es: 'Copia de',
  'pt-BR': 'Cópia de',
};

/** `"Copy of <title>"` in the copier's language, cut to the title limit by code point. */
export function copyTitle(sourceTitle: string, locale: Locale): string {
  const title = `${COPY_TITLE_PREFIX[locale]} ${sourceTitle}`;
  return Array.from(title).slice(0, LIMITS.TRIP_TITLE_MAX).join('').trimEnd();
}
