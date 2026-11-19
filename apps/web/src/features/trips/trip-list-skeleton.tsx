import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './trip-list.module.css';

/**
 * Same space as the first cards, while they load. Kept out of the client
 * `trip-list.tsx` so `trips/loading.tsx`, which wraps every route under
 * `trips/`, does not ship the list to the planner and the trip forms.
 */
export function TripListSkeleton() {
  return (
    <Skeleton>
      <div className={styles.grid}>
        <SkeletonBlock height="8.5rem" />
        <SkeletonBlock height="8.5rem" />
        <SkeletonBlock height="8.5rem" />
      </div>
    </Skeleton>
  );
}
