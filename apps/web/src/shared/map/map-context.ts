'use client';

import type { Map as MapLibreMap } from 'maplibre-gl';
import { createContext, use } from 'react';
import type { MapTheme } from './basemap';

/**
 * What a map child needs besides the map: the theme the basemap shows (paint
 * values follow it), the font stack of the basemap's glyph server (`null`
 * when the style has no glyphs, so no text layer can be drawn) and a counter
 * bumped on every `style.load` after the first, when the style was swapped.
 */
export interface MapHandle {
  map: MapLibreMap;
  theme: MapTheme;
  fonts: string[] | null;
  styleRevision: number;
}

export const MapContext = createContext<MapHandle | null>(null);

/** The map of the surrounding `MapView`. Its children render only once the map has loaded. */
export function useMap(): MapHandle {
  const handle = use(MapContext);
  if (!handle) {
    throw new Error('useMap() must be used inside <MapView>');
  }
  return handle;
}

const removedMaps = new WeakSet<MapLibreMap>();

export function markMapRemoved(map: MapLibreMap): void {
  removedMaps.add(map);
}

/**
 * React runs a parent's effect cleanup before its children's, so a child
 * layer's cleanup finds the map already removed; every child cleanup checks this.
 */
export function isMapAlive(map: MapLibreMap): boolean {
  return !removedMaps.has(map);
}
