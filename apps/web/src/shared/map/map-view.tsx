'use client';

import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './map-view.module.css';

// A bundled MapLibre cannot find its web worker by itself. Next.js emits the
// worker file as a hashed static asset; this resolves to its public URL.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

/** OpenStreetMap vector tiles served by OpenFreeMap. No API key needed. */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** MapLibre GL JS draws with WebGL 2 and throws without it. */
function browserSupportsWebGL2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Checked once, on the first render. This component never renders on the
  // server (see trip-map.tsx), so `document` exists here.
  const [supported] = useState(browserSupportsWebGL2);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!supported || !container) {
      return;
    }

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
      center: [0, 20],
      zoom: 1.5,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.once('load', () => setLoaded(true));

    return () => {
      map.remove();
    };
  }, [supported]);

  if (!supported) {
    return (
      <div className={styles.map} data-map-status="error">
        <p className={styles.message} role="alert">
          The map cannot be displayed in this browser.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.map} data-map-status={loaded ? 'ready' : 'loading'}>
      <div ref={containerRef} className={styles.canvas} />
    </div>
  );
}
