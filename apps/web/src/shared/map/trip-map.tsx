'use client';

import dynamic from 'next/dynamic';
import styles from './map-view.module.css';

/**
 * MapLibre needs a browser (WebGL 2 and web workers), so the map is loaded on
 * the client only and its code stays out of the initial bundle. Layer
 * components import no MapLibre code, so pages can import them directly.
 */
export const TripMap = dynamic(() => import('./map-view').then((module) => module.MapView), {
  ssr: false,
  loading: () => <div className={styles.map} data-map-state="loading" aria-busy="true" />,
});
