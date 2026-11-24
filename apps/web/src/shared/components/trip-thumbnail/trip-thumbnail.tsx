'use client';

import type { LngLat } from '@heremita/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { labelLanguage } from '@/shared/map/label-language';
import { STATIC_MAP_SIZE } from '@/shared/map/static-map-size';
import { useResolvedTheme } from '@/shared/map/use-resolved-theme';
import { RouteSketch } from './route-sketch';
import styles from './trip-thumbnail.module.css';

/** How far below the fold a card may be and still get its map drawn. */
const NEAR_VIEWPORT_MARGIN = '240px';

/**
 * A trip's map for a card: the real basemap of its area with its places as
 * pins, drawn once the card comes near the viewport (one hidden map draws
 * every card in turn, see `shared/map/static-map.ts`) and cached for the
 * session. The route sketch shows first and stays when the map cannot be
 * drawn (no WebGL, basemap down). Decorative: the card's text says it all.
 */
export function TripThumbnail({ points }: { points: readonly LngLat[] }) {
  const t = useTranslations('common');
  const theme = useResolvedTheme();
  const language = labelLanguage(useLocale());
  const frameRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [src, setSrc] = useState<string | null>(null);
  const key = points.map(({ lng, lat }) => `${lng},${lat}`).join(';');

  useEffect(() => {
    const frame = frameRef.current;
    if (near || !frame) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setNear(true);
        }
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || key === '') {
      return;
    }
    let cancelled = false;
    const tuples = points.map(({ lng, lat }) => [lng, lat] as const);
    // The map code (MapLibre) loads here, on demand, never with the page.
    void import('@/shared/map/static-map')
      .then(({ renderStaticMap }) => renderStaticMap({ points: tuples, theme, language }))
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
        }
      })
      .catch(() => {
        // No WebGL, or no basemap: the sketch stays.
      });
    return () => {
      cancelled = true;
    };
    // `key` stands for `points`: callers build the array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, key, theme, language]);

  return (
    <div ref={frameRef} className={styles.frame} data-thumbnail={src ? 'map' : 'sketch'}>
      <RouteSketch points={points} />
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL drawn in the browser; next/image has nothing to optimise */}
          <img
            className={styles.map}
            src={src}
            alt=""
            width={STATIC_MAP_SIZE.width}
            height={STATIC_MAP_SIZE.height}
            decoding="async"
          />
          <span className={styles.credit} aria-hidden="true">
            {t('mapCredit')}
          </span>
        </>
      ) : null}
    </div>
  );
}
