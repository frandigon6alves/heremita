'use client';

import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useEffectEvent } from 'react';
import { toLngLat, type LngLat } from './geo';
import { consumeLiftClick } from './long-press';
import { isMapAlive, useMap } from './map-context';
import { cameraDuration } from './motion';
import type { ExpressionSpecification } from './style-types';
import { readToken, type CssToken } from './tokens';

export interface MapPin {
  /** Stable id (a UUID): selection and `onSelect` use it. */
  id: string;
  lngLat: LngLat;
  /** Fill colour, e.g. `--day-2`. Ideas are drawn as rings and ignore it. */
  colorToken: CssToken;
  variant: 'stop' | 'idea' | 'saving';
  /** Number drawn on the pin (stop order). */
  order?: number;
  label?: string;
}

interface PinsLayerProps {
  pins: readonly MapPin[];
  selectedId: string | null;
  /** A pin's id when one is tapped, `null` when the empty map is tapped. */
  onSelect: (id: string | null) => void;
  /** Groups pins at low zoom ("all days"). Never for one day's numbered stops. */
  cluster?: boolean;
}

export const PINS_SOURCE = 'h-places';
/** The lowest pin layer: route layers go below it, and taps are tested against it. */
export const PINS_HIT_LAYER = 'h-places-hit';
const HALO_LAYER = 'h-places-halo';
const DOT_LAYER = 'h-places-dot';
const NUMBER_LAYER = 'h-places-num';
const CLUSTER_LAYER = 'h-places-cluster';
const CLUSTER_COUNT_LAYER = 'h-places-cluster-count';

const CLUSTER_MAX_ZOOM = 11;
const CLUSTER_RADIUS_PX = 50;
const CLUSTER_EASE_MS = 300;
const PIN_STROKE = '#ffffff';
const NUMBER_SIZE = 13;

const isSelected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];
const isIdea: ExpressionSpecification = ['==', ['get', 'variant'], 'idea'];
const isSaving: ExpressionSpecification = ['==', ['get', 'variant'], 'saving'];
const isPoint: ExpressionSpecification = ['!', ['has', 'point_count']];

function toFeatureCollection(pins: readonly MapPin[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lngLat[0], pin.lngLat[1]] },
      properties: {
        id: pin.id,
        color: readToken(pin.colorToken),
        variant: pin.variant,
        ...(pin.order === undefined ? {} : { order: pin.order }),
        ...(pin.label === undefined ? {} : { label: pin.label }),
      },
    })),
  };
}

/**
 * Pins as GL layers (cheap at hundreds): a 44 px invisible hit circle, the
 * dot, a selection halo, the stop number; clusters when asked. Selection is
 * feature-state, so it survives data and style updates without a redraw.
 */
export function PinsLayer({ pins, selectedId, onSelect, cluster = false }: PinsLayerProps) {
  const { map, theme, fonts, styleRevision } = useMap();
  const select = useEffectEvent(onSelect);

  useEffect(() => {
    map.addSource(PINS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'id',
      ...(cluster
        ? { cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: CLUSTER_RADIUS_PX }
        : {}),
    });
    map.addLayer({
      id: PINS_HIT_LAYER,
      type: 'circle',
      source: PINS_SOURCE,
      filter: isPoint,
      paint: { 'circle-radius': 22, 'circle-opacity': 0 },
    });
    map.addLayer({
      id: HALO_LAYER,
      type: 'circle',
      source: PINS_SOURCE,
      filter: isPoint,
      paint: { 'circle-radius': 24, 'circle-opacity': ['case', isSelected, 0.35, 0] },
    });
    map.addLayer({
      id: DOT_LAYER,
      type: 'circle',
      source: PINS_SOURCE,
      filter: isPoint,
      paint: {
        'circle-radius': ['case', isSelected, 18, isIdea, 9, 14],
        'circle-stroke-width': ['case', isSelected, 4, isIdea, 3, 2],
        'circle-opacity': ['case', isSaving, 0.6, 1],
        'circle-stroke-opacity': ['case', isSaving, 0.6, 1],
      },
    });
    if (fonts) {
      map.addLayer({
        id: NUMBER_LAYER,
        type: 'symbol',
        source: PINS_SOURCE,
        filter: ['all', isPoint, ['has', 'order']],
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-font': fonts,
          'text-size': NUMBER_SIZE,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': PIN_STROKE, 'text-opacity': ['case', isSaving, 0.6, 1] },
      });
    }
    if (cluster) {
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: PINS_SOURCE,
        filter: ['has', 'point_count'],
        paint: { 'circle-radius': 20, 'circle-stroke-width': 2, 'circle-stroke-color': PIN_STROKE },
      });
      if (fonts) {
        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: 'symbol',
          source: PINS_SOURCE,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': fonts,
            'text-size': NUMBER_SIZE,
            'text-allow-overlap': true,
          },
        });
      }
    }

    return () => {
      if (!isMapAlive(map)) {
        return;
      }
      for (const layer of [
        CLUSTER_COUNT_LAYER,
        CLUSTER_LAYER,
        NUMBER_LAYER,
        DOT_LAYER,
        HALO_LAYER,
        PINS_HIT_LAYER,
      ]) {
        if (map.getLayer(layer)) {
          map.removeLayer(layer);
        }
      }
      map.removeSource(PINS_SOURCE);
    };
  }, [map, cluster, fonts]);

  useEffect(() => {
    map.setPaintProperty(HALO_LAYER, 'circle-color', readToken('--color-accent'));
    map.setPaintProperty(DOT_LAYER, 'circle-color', [
      'case',
      isIdea,
      readToken('--color-surface'),
      ['get', 'color'],
    ]);
    map.setPaintProperty(DOT_LAYER, 'circle-stroke-color', [
      'case',
      isIdea,
      readToken('--color-text'),
      PIN_STROKE,
    ]);
    if (map.getLayer(CLUSTER_LAYER)) {
      map.setPaintProperty(CLUSTER_LAYER, 'circle-color', readToken('--color-primary'));
    }
    if (map.getLayer(CLUSTER_COUNT_LAYER)) {
      map.setPaintProperty(CLUSTER_COUNT_LAYER, 'text-color', readToken('--color-on-primary'));
    }
  }, [map, theme, cluster, fonts]);

  useEffect(() => {
    void map.getSource<GeoJSONSource>(PINS_SOURCE)?.setData(toFeatureCollection(pins));
  }, [map, pins, theme, cluster, fonts]);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const target = { source: PINS_SOURCE, id: selectedId };
    map.setFeatureState(target, { selected: true });
    return () => {
      if (isMapAlive(map) && map.getSource(PINS_SOURCE)) {
        map.setFeatureState(target, { selected: false });
      }
    };
  }, [map, selectedId, cluster, fonts, styleRevision]);

  const handleClick = useEffectEvent((event: MapMouseEvent) => {
    if (consumeLiftClick(map)) {
      return;
    }
    const layers = map.getLayer(CLUSTER_LAYER) ? [PINS_HIT_LAYER, CLUSTER_LAYER] : [PINS_HIT_LAYER];
    const [feature] = map.queryRenderedFeatures(event.point, { layers });
    if (!feature) {
      select(null);
      return;
    }
    if (feature.layer.id !== CLUSTER_LAYER) {
      select(String(feature.id));
      return;
    }
    const center =
      feature.geometry.type === 'Point' ? toLngLat(feature.geometry.coordinates) : null;
    const clusterId = Number(feature.properties.cluster_id);
    void map
      .getSource<GeoJSONSource>(PINS_SOURCE)
      ?.getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        if (isMapAlive(map) && center) {
          map.easeTo({
            center: [center[0], center[1]],
            zoom,
            duration: cameraDuration(CLUSTER_EASE_MS),
          });
        }
      });
  });

  useEffect(() => {
    const onClick = (event: MapMouseEvent) => handleClick(event);
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map]);

  return null;
}
