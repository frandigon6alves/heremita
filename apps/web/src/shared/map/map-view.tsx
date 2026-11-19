'use client';

import {
  AttributionControl,
  GeolocateControl,
  GPUInitializationError,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type LngLatBoundsLike,
  type LngLatLike,
} from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { publicEnv } from '@/public-env';
import { showToast } from '@/shared/components/toast/toast-store';
import { labelLanguage, localizeLabels, styleUrl } from './basemap';
import { attachBasemap, type BasemapController } from './basemap-controller';
import { FIT_MAX_ZOOM, FIT_PADDING_PX } from './fit-bounds';
import { MapContext, markMapRemoved, type MapHandle } from './map-context';
import { useResolvedTheme } from './use-resolved-theme';
import styles from './map-view.module.css';

declare global {
  interface Window {
    /** The live map, for e2e tests only (`NEXT_PUBLIC_E2E=1`). */
    __heremitaMap?: MapLibreMap;
  }
}

// A bundled MapLibre cannot find its web worker by itself.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

const MAX_PIXEL_RATIO = 2;
const GEOLOCATE_MAX_ZOOM = 15;

export type InitialView = { center: LngLatLike; zoom: number } | { bounds: LngLatBoundsLike };

interface MapViewProps {
  /** Camera when the map is created; later moves go through `easeTo`/`fitBounds`. */
  initialView: InitialView;
  /** Accessible name of the map region. Defaults to "Trip map". */
  label?: string;
  /** Small maps inside scrolling pages: one finger scrolls the page. */
  cooperativeGestures?: boolean;
  /** Shows the "My location" control. */
  geolocate?: boolean;
  className?: string;
  /** Layers and markers (`PinsLayer`, `RouteLineLayer`, …), rendered once the map has loaded. */
  children?: ReactNode;
}

type Translate = ReturnType<typeof useTranslations<'map'>>;

function uiStrings(t: Translate, label: string): Record<string, string> {
  return {
    'Map.Title': label,
    'AttributionControl.ToggleAttribution': t('controls.toggleAttribution'),
    'AttributionControl.MapFeedback': t('controls.mapFeedback'),
    'GeolocateControl.FindMyLocation': t('controls.findMyLocation'),
    'GeolocateControl.LocationNotAvailable': t('controls.locationNotAvailable'),
    'Marker.Title': t('controls.marker'),
    'NavigationControl.ZoomIn': t('controls.zoomIn'),
    'NavigationControl.ZoomOut': t('controls.zoomOut'),
    'NavigationControl.ResetBearing': t('controls.resetBearing'),
    'Popup.Close': t('controls.closePopup'),
    'CooperativeGesturesHandler.WindowsHelpText': t('controls.cooperativeWindows'),
    'CooperativeGesturesHandler.MacHelpText': t('controls.cooperativeMac'),
    'CooperativeGesturesHandler.MobileHelpText': t('controls.cooperativeMobile'),
  };
}

function cameraOptions(view: InitialView) {
  if ('bounds' in view) {
    return {
      bounds: view.bounds,
      fitBoundsOptions: { padding: FIT_PADDING_PX, maxZoom: FIT_MAX_ZOOM },
    };
  }
  return { center: view.center, zoom: view.zoom };
}

/**
 * One MapLibre map. Load it through `TripMap` (client only, own chunk). Its
 * children see the map through `useMap()` once it has loaded. Without WebGL 2
 * it shows an alert instead, and the page's list stays the way to every place.
 */
export function MapView({
  initialView,
  label,
  cooperativeGestures = false,
  geolocate = false,
  className,
  children,
}: MapViewProps) {
  const t = useTranslations('map');
  const language = labelLanguage(useLocale());
  const theme = useResolvedTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const basemapRef = useRef<BasemapController | null>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [initial] = useState(() => ({
    view: initialView,
    theme,
    language,
    cooperativeGestures,
    geolocate,
    strings: uiStrings(t, label ?? t('title')),
    geolocateError: t('geolocateError'),
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: styleUrl('primary', initial.theme),
        transformStyle: localizeLabels(initial.language),
        ...cameraOptions(initial.view),
        pixelRatio: Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO),
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        cooperativeGestures: initial.cooperativeGestures,
        locale: initial.strings,
      });
    } catch (error) {
      if (!(error instanceof GPUInitializationError)) {
        throw error;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the constructor is the WebGL 2 probe: its failure is external state
      setFailed(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), 'top-left');
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    if (initial.geolocate) {
      const control = new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
      });
      control.on('error', () => showToast({ message: initial.geolocateError }));
      map.addControl(control, 'top-right');
    }
    basemapRef.current = attachBasemap(map, initial, (state) => setHandle({ map, ...state }));
    if (publicEnv.NEXT_PUBLIC_E2E) {
      window.__heremitaMap = map;
    }

    return () => {
      basemapRef.current = null;
      markMapRemoved(map);
      map.remove();
      setHandle(null);
      if (window.__heremitaMap === map) {
        delete window.__heremitaMap;
      }
    };
  }, [initial]);

  useEffect(() => {
    basemapRef.current?.show(theme, language);
  }, [theme, language]);

  const rootClass = [styles.map, className].filter(Boolean).join(' ');

  if (failed) {
    return (
      <div className={rootClass} data-map-state="failed">
        <p className={styles.message} role="alert">
          {t('unavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className={rootClass} data-map-state={handle ? 'ready' : 'loading'}>
      <div ref={containerRef} className={styles.canvas} />
      {handle && <MapContext value={handle}>{children}</MapContext>}
    </div>
  );
}
