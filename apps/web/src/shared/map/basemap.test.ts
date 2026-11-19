import { AJAXError, type TransformStyleFunction } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import {
  isStyleFetchError,
  keepOurLayers,
  labelFont,
  labelLanguage,
  localizeLabels,
  styleTransform,
  styleUrl,
} from './basemap';

type Style = Parameters<TransformStyleFunction>[1];

const basemapStyle = (layers: Style['layers'], sources: Style['sources'] = {}): Style => ({
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' }, ...sources },
  layers,
});

const countryLabel: Style['layers'][number] = {
  id: 'label_country',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'place',
  layout: { 'text-field': '{name:latin}' },
};
const houseNumber: Style['layers'][number] = {
  id: 'housenumber',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'housenumber',
  layout: { 'text-field': '{housenumber}' },
};
const water: Style['layers'][number] = {
  id: 'water',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'water',
};
const ourRoute: Style['layers'][number] = { id: 'h-route-line', type: 'line', source: 'h-route' };
const ourSource: Style['sources'] = {
  'h-route': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
};

describe('localizeLabels', () => {
  it('labels_places_in_the_ui_language_with_the_local_name_as_fallback', () => {
    const next = localizeLabels('pt')(undefined, basemapStyle([countryLabel]));

    expect(next.layers[0]).toMatchObject({
      layout: { 'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']] },
    });
  });

  it('leaves_layers_without_names_untouched', () => {
    const style = basemapStyle([houseNumber, water]);

    expect(localizeLabels('en')(undefined, style).layers).toEqual(style.layers);
  });
});

describe('keepOurLayers', () => {
  it('carries_our_sources_and_layers_over_on_top_of_the_new_style', () => {
    const previous = basemapStyle([water, ourRoute], ourSource);

    const next = keepOurLayers(previous, basemapStyle([water, countryLabel]));

    expect(next.layers.map(({ id }) => id)).toEqual(['water', 'label_country', 'h-route-line']);
    expect(next.sources['h-route']).toEqual(ourSource['h-route']);
  });

  it('returns_the_new_style_unchanged_on_the_first_load', () => {
    const style = basemapStyle([water]);

    expect(keepOurLayers(undefined, style)).toEqual(style);
  });

  it('never_duplicates_a_layer_of_ours_the_new_style_already_has', () => {
    const previous = basemapStyle([ourRoute], ourSource);

    const next = keepOurLayers(previous, basemapStyle([ourRoute], ourSource));

    expect(next.layers.filter(({ id }) => id === 'h-route-line')).toHaveLength(1);
  });
});

describe('styleTransform', () => {
  it('localizes_labels_and_keeps_our_layers_on_the_primary_basemap', () => {
    const previous = basemapStyle([ourRoute], ourSource);

    const next = styleTransform('primary', 'en')(previous, basemapStyle([countryLabel]));

    expect(next.layers.map(({ id }) => id)).toEqual(['label_country', 'h-route-line']);
    expect(next.layers[0]).toMatchObject({
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']] },
    });
  });

  it('keeps_fallback_labels_as_they_are_because_its_schema_differs', () => {
    const previous = basemapStyle([ourRoute], ourSource);

    const next = styleTransform('fallback', 'pt')(previous, basemapStyle([countryLabel]));

    expect(next.layers[0]).toEqual(countryLabel);
    expect(next.layers.map(({ id }) => id)).toContain('h-route-line');
  });
});

describe('basemap choices', () => {
  it('maps_each_ui_locale_to_a_label_language', () => {
    expect(labelLanguage('en')).toBe('en');
    expect(labelLanguage('es')).toBe('es');
    expect(labelLanguage('pt-BR')).toBe('pt');
  });

  it('defaults_to_openfreemap_positron_and_dark_with_versatiles_fallbacks', () => {
    expect(styleUrl('primary', 'light')).toBe('https://tiles.openfreemap.org/styles/positron');
    expect(styleUrl('primary', 'dark')).toBe('https://tiles.openfreemap.org/styles/dark');
    expect(styleUrl('fallback', 'light')).toContain('tiles.versatiles.org');
    expect(styleUrl('fallback', 'dark')).toContain('tiles.versatiles.org');
  });

  it('names_the_bold_font_the_way_each_glyph_server_does', () => {
    const withGlyphs = basemapStyle([]);
    withGlyphs.glyphs = 'https://tiles.example/fonts/{fontstack}/{range}.pbf';

    expect(labelFont('primary', withGlyphs)).toEqual(['Noto Sans Bold']);
    expect(labelFont('fallback', withGlyphs)).toEqual(['noto_sans_bold']);
  });

  it('draws_no_labels_when_the_style_has_no_glyph_server', () => {
    expect(labelFont('primary', basemapStyle([]))).toBeNull();
  });
});

describe('isStyleFetchError', () => {
  it('recognises_a_failed_style_document_fetch', () => {
    const error = new AJAXError(
      404,
      'Not Found',
      'https://tiles.openfreemap.org/styles/positron',
      new Blob(),
    );

    expect(isStyleFetchError(error)).toBe(true);
  });

  it('ignores_tile_failures_and_other_errors', () => {
    const tile = new AJAXError(0, '', 'https://tiles.openfreemap.org/planet/1/2/3.pbf', new Blob());

    expect(isStyleFetchError(tile)).toBe(false);
    expect(isStyleFetchError(new Error('/styles/ broke'))).toBe(false);
  });
});
