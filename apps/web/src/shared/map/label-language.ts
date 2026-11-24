import type { Locale } from '@heremita/shared';

export type LabelLanguage = 'en' | 'es' | 'pt';

/** OpenMapTiles `name:<language>` keys use bare language codes. */
const LABEL_LANGUAGES: Record<Locale, LabelLanguage> = { en: 'en', es: 'es', 'pt-BR': 'pt' };

/**
 * The basemap label language of a UI locale. Apart from `basemap.ts`, which
 * imports MapLibre: a card may ask for it without loading the map chunk.
 */
export function labelLanguage(locale: Locale): LabelLanguage {
  return LABEL_LANGUAGES[locale];
}
