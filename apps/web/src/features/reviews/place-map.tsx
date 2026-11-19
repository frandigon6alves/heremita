'use client';

import type { LngLat } from '@heremita/shared';
import { PinsLayer } from '@/shared/map/pins-layer';
import { TripMap } from '@/shared/map/trip-map';
import styles from './place-map.module.css';

/** The place page map opens close enough to see the street around the place. */
const PLACE_ZOOM = 15;

export interface PlaceMapProps {
  location: LngLat;
  /** Accessible name of the map region ("Mapa de Castelo de São Jorge"). */
  label: string;
  name: string;
}

/**
 * Small embedded map (180 px) of one place. Cooperative gestures: one finger
 * scrolls the page, two fingers move the map.
 */
export function PlaceMap({ location, label, name }: PlaceMapProps) {
  const lngLat: [number, number] = [location.lng, location.lat];

  return (
    <div className={styles.frame}>
      <TripMap
        initialView={{ center: lngLat, zoom: PLACE_ZOOM }}
        label={label}
        cooperativeGestures
        className={styles.map}
      >
        <PinsLayer
          pins={[
            { id: 'place', lngLat, colorToken: '--color-accent', variant: 'stop', label: name },
          ]}
          selectedId="place"
          onSelect={() => undefined}
        />
      </TripMap>
    </div>
  );
}
