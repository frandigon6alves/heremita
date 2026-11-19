import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  isStyleFetchError,
  keepOurLayers,
  labelFont,
  styleTransform,
  styleUrl,
  type Basemap,
  type LabelLanguage,
  type MapTheme,
} from './basemap';

export interface BasemapState {
  theme: MapTheme;
  fonts: string[] | null;
  styleRevision: number;
}

export interface BasemapController {
  /** Switches theme and label language, keeping our layers, their data and feature-state. */
  show(theme: MapTheme, language: LabelLanguage): void;
}

/**
 * Owns the basemap of one map: the style switch on theme/language changes
 * and the one-time move to the fallback basemap when the style document
 * cannot be fetched. `onChange` runs once the map has loaded and after every
 * later style change.
 */
export function attachBasemap(
  map: MapLibreMap,
  initial: { theme: MapTheme; language: LabelLanguage },
  onChange: (state: BasemapState) => void,
): BasemapController {
  let basemap: Basemap = 'primary';
  let { theme, language } = initial;
  let loaded = false;
  let styleRevision = 0;

  const report = () => {
    if (loaded) {
      onChange({ theme, fonts: labelFont(basemap, map.getStyle()), styleRevision });
    }
  };

  map.once('load', () => {
    loaded = true;
    report();
  });
  map.on('style.load', () => {
    if (loaded) {
      styleRevision += 1;
      report();
    }
  });
  map.on('error', ({ error }) => {
    if (basemap === 'fallback' || !isStyleFetchError(error)) {
      return;
    }
    basemap = 'fallback';
    const url = styleUrl(basemap, theme);
    if (loaded) {
      map.setStyle(url, { transformStyle: keepOurLayers });
    } else {
      // Nothing of ours is on the map yet, and a transform would wait for the
      // failed style to finish loading, which never happens.
      map.setStyle(url, { diff: false, transformStyle: undefined });
    }
  });

  return {
    show(nextTheme, nextLanguage) {
      if (nextTheme === theme && nextLanguage === language) {
        return;
      }
      theme = nextTheme;
      language = nextLanguage;
      map.setStyle(styleUrl(basemap, theme), { transformStyle: styleTransform(basemap, language) });
      report();
    },
  };
}
