'use client';

import type { Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef } from 'react';
import { showToast } from '@/shared/components/toast/toast-store';
import type { LngLat } from './geo';
import { useMap } from './map-context';
import { readToken } from './tokens';

interface DraftPinProps {
  lngLat: LngLat;
  /** The pin was dragged, or moved with the arrow keys, to `lngLat`. */
  onMove: (lngLat: LngLat) => void;
  /** Enter or Space on the focused pin: open the "What's here?" card for this spot. */
  onActivate: () => void;
  /** Focus the pin when it appears (keyboard path). */
  autoFocus?: boolean;
}

const ACTIVATE_KEYS = new Set(['Enter', ' ']);

/**
 * The one DOM marker on the map: a draggable teardrop in the accent colour.
 * MapLibre makes it a focusable button that arrow keys move (1 px, Shift 10 px).
 * It is rebuilt on a theme change (new colour) and keeps focus across it.
 */
export function DraftPin({ lngLat, onMove, onActivate, autoFocus = false }: DraftPinProps) {
  const t = useTranslations('map');
  const label = t('draftPin');
  const unavailable = t('unavailable');
  const { map, theme } = useMap();
  const markerRef = useRef<Marker | null>(null);
  const positionRef = useRef(lngLat);
  const focusNextRef = useRef(autoFocus);
  const move = useEffectEvent(onMove);
  const activate = useEffectEvent(onActivate);

  useEffect(() => {
    let marker: Marker | null = null;
    let cancelled = false;

    void import('maplibre-gl')
      .then(({ Marker: MarkerClass }) => {
        if (cancelled) {
          return;
        }
        const created = new MarkerClass({ color: readToken('--color-accent'), draggable: true });
        const element = created.getElement();
        element.setAttribute('aria-label', label);
        element.addEventListener('keydown', (event) => {
          if (ACTIVATE_KEYS.has(event.key)) {
            event.preventDefault();
            activate();
          }
        });
        created.on('dragend', () => {
          const { lng, lat } = created.getLngLat();
          move([lng, lat]);
        });
        created.setLngLat([positionRef.current[0], positionRef.current[1]]).addTo(map);
        if (focusNextRef.current) {
          element.focus();
        }
        marker = created;
        markerRef.current = created;
      })
      .catch(() => showToast({ message: unavailable }));

    return () => {
      cancelled = true;
      if (marker) {
        focusNextRef.current = marker.getElement() === document.activeElement;
        marker.remove();
      }
      markerRef.current = null;
    };
  }, [map, theme, label, unavailable]);

  useEffect(() => {
    positionRef.current = lngLat;
    markerRef.current?.setLngLat([lngLat[0], lngLat[1]]);
  }, [lngLat]);

  return null;
}
