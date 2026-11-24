import type { LngLat } from '@heremita/shared';
import { MapPin } from '@/shared/icons/icons';
import { projectToFrame } from './thumbnail-geometry';
import styles from './route-thumbnail.module.css';

const FRAME = { width: 120, height: 72, padding: 10 };

/**
 * Decorative sketch of a trip: its preview points in visit order joined by a
 * line (no map tiles, no request). A trip without places shows a pin.
 */
export function RouteThumbnail({ points }: { points: readonly LngLat[] }) {
  const projected = projectToFrame(points, FRAME);

  if (projected.length === 0) {
    return (
      <div className={`${styles.thumbnail} ${styles.empty}`} aria-hidden="true">
        <MapPin />
      </div>
    );
  }
  return (
    <svg
      className={styles.thumbnail}
      viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        className={styles.route}
        points={projected.map(({ x, y }) => `${x},${y}`).join(' ')}
      />
      {projected.map(({ x, y }, index) => (
        <circle
          key={index}
          className={index === 0 ? styles.start : styles.stop}
          cx={x}
          cy={y}
          r={index === 0 ? 4 : 3}
        />
      ))}
    </svg>
  );
}
