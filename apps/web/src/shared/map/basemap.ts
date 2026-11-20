import type { Locale } from '@heremita/shared';
import { AJAXError, type TransformStyleFunction } from 'maplibre-gl';
import { publicEnv } from '@/public-env';

export type MapTheme = 'light' | 'dark';
export type LabelLanguage = 'en' | 'es' | 'pt';
export type Basemap = 'primary' | 'fallback';

type StyleSpecification = Parameters<TransformStyleFunction>[1];
type LayerSpecification = StyleSpecification['layers'][number];

/** Prefix of every source and layer id Heremita adds to a basemap. */
const OWN_ID_PREFIX = 'h-';

const STYLE_URLS: Record<Basemap, Record<MapTheme, string>> = {
  primary: {
    light: publicEnv.NEXT_PUBLIC_MAP_STYLE_LIGHT,
    dark: publicEnv.NEXT_PUBLIC_MAP_STYLE_DARK,
  },
  fallback: {
    light: publicEnv.NEXT_PUBLIC_MAP_STYLE_FALLBACK_LIGHT,
    dark: publicEnv.NEXT_PUBLIC_MAP_STYLE_FALLBACK_DARK,
  },
};

/** OpenFreeMap and VersaTiles name the same bold font differently. */
const BOLD_FONT: Record<Basemap, string[]> = {
  primary: ['Noto Sans Bold'],
  fallback: ['noto_sans_bold'],
};

export function styleUrl(basemap: Basemap, theme: MapTheme): string {
  return STYLE_URLS[basemap][theme];
}

/** The font stack for our labels, or `null` when the style has no glyph server to draw them. */
export function labelFont(
  basemap: Basemap,
  style: StyleSpecification | undefined,
): string[] | null {
  return style?.glyphs ? BOLD_FONT[basemap] : null;
}

/** OpenMapTiles `name:<language>` keys use bare language codes. */
const LABEL_LANGUAGES: Record<Locale, LabelLanguage> = { en: 'en', es: 'es', 'pt-BR': 'pt' };

export function labelLanguage(locale: Locale): LabelLanguage {
  return LABEL_LANGUAGES[locale];
}

function showsName(layer: LayerSpecification): boolean {
  return (
    layer.type === 'symbol' && JSON.stringify(layer.layout?.['text-field'] ?? '').includes('name')
  );
}

/** Basemap labels in the UI language, falling back to the local name. */
export function localizeLabels(language: LabelLanguage): TransformStyleFunction {
  return (_previous, next) => ({
    ...next,
    layers: next.layers.map((layer) =>
      layer.type === 'symbol' && showsName(layer)
        ? {
            ...layer,
            layout: {
              ...layer.layout,
              'text-field': ['coalesce', ['get', `name:${language}`], ['get', 'name']],
            },
          }
        : layer,
    ),
  });
}

const isOwn = (id: string) => id.startsWith(OWN_ID_PREFIX);

/** Carries our sources and layers (with their latest data) over a style switch, on top. */
export const keepOurLayers: TransformStyleFunction = (previous, next) => ({
  ...next,
  sources: {
    ...next.sources,
    ...Object.fromEntries(Object.entries(previous?.sources ?? {}).filter(([id]) => isOwn(id))),
  },
  layers: [
    ...next.layers.filter((layer) => !isOwn(layer.id)),
    ...(previous?.layers ?? []).filter((layer) => isOwn(layer.id)),
  ],
});

/**
 * The transform for a style switch. The fallback basemap uses another tile
 * schema, so its labels are left as they are.
 */
export function styleTransform(basemap: Basemap, language: LabelLanguage): TransformStyleFunction {
  if (basemap === 'fallback') {
    return keepOurLayers;
  }
  const localize = localizeLabels(language);
  return (previous, next) => keepOurLayers(previous, localize(previous, next));
}

/** A failed fetch of the style document itself (not a tile or a glyph). */
export function isStyleFetchError(error: unknown): boolean {
  return error instanceof AJAXError && error.url.includes('/styles/');
}
