import { PublicTripFeedSkeleton } from '@/features/explore/public-trip-feed';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './explore-page.module.css';

export default function ExploreLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="10rem" />
        <SkeletonBlock shape="text" width="70%" />
        <SkeletonBlock height="3rem" />
      </Skeleton>
      <PublicTripFeedSkeleton />
    </main>
  );
}
