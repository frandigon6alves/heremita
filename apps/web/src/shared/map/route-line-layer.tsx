'use client';

import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useEffectEvent } from 'react';
import type { LngLat } from './geo';
import { isMapAlive, useMap } from './map-context';
import { PINS_HIT_LAYER } from './pins-layer';
import type { ExpressionSpecification } from './style-types';
import { readToken, type CssToken } from './tokens';

export interface MapRouteLine {
  id: string;
  points: readonly LngLat[];
  /** Line colour, e.g. `--day-2`. */
  colorToken: CssToken;
  /** A straight-line estimate, not a routed leg: drawn dashed. */
  estimated: boolean;
}

interface RouteLineLayerProps {
  lines: readonly MapRouteLine[];
  /** Other days in "all", or a route being refetched: drawn at 60 % opacity. */
  dimmed?: boolean;
}

const SOURCE = 'h-route';
const CASING_LAYER = 'h-route-casing';
const LINE_LAYER = 'h-route-line';
const ESTIMATED_LAYER = 'h-route-estimated';
const DIMMED_OPACITY = 0.6;
const ESTIMATE_DASHES = [1, 1.5];

const isEstimated: ExpressionSpecification = ['boolean', ['get', 'estimated'], false];

function toFeatureCollection(
  lines: readonly MapRouteLine[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((line) => line.points.length > 1)
      .map((line) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line.points.map(([lng, lat]) => [lng, lat]) },
        properties: { id: line.id, color: readToken(line.colorToken), estimated: line.estimated },
      })),
  };
}

/**
 * Route lines under the pins: a casing in the background colour, solid
 * routed legs, dashed estimated legs (the list also says "estimate", V59).
 */
export function RouteLineLayer({ lines, dimmed = false }: RouteLineLayerProps) {
  const { map, theme } = useMap();

  useEffect(() => {
    const beforeId = map.getLayer(PINS_HIT_LAYER) ? PINS_HIT_LAYER : undefined;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
    map.addLayer(
      {
        id: CASING_LAYER,
        type: 'line',
        source: SOURCE,
        layout,
        paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 11] },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE,
        filter: ['!', isEstimated],
        layout,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: ESTIMATED_LAYER,
        type: 'line',
        source: SOURCE,
        filter: isEstimated,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
          'line-dasharray': ESTIMATE_DASHES,
        },
      },
      beforeId,
    );

    return () => {
      if (!isMapAlive(map)) {
        return;
      }
      map.removeLayer(ESTIMATED_LAYER);
      map.removeLayer(LINE_LAYER);
      map.removeLayer(CASING_LAYER);
      map.removeSource(SOURCE);
    };
  }, [map]);

  useEffect(() => {
    map.setPaintProperty(CASING_LAYER, 'line-color', readToken('--color-route-casing'));
  }, [map, theme]);

  useEffect(() => {
    const opacity = dimmed ? DIMMED_OPACITY : 1;
    for (const layer of [CASING_LAYER, LINE_LAYER, ESTIMATED_LAYER]) {
      map.setPaintProperty(layer, 'line-opacity', opacity);
    }
  }, [map, dimmed]);

  // Callers build `lines` on every render: only a change of content resets the source.
  const content = JSON.stringify(lines);
  const pushData = useEffectEvent(() => {
    void map.getSource<GeoJSONSource>(SOURCE)?.setData(toFeatureCollection(lines));
  });
  useEffect(() => pushData(), [map, content, theme]);

  return null;
}
