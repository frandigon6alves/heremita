import { PublicTripFeedSkeleton } from '@/features/explore/public-trip-feed';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './profile-page.module.css';

export default function ProfileLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="12rem" />
        <SkeletonBlock shape="text" width="9rem" />
        <SkeletonBlock shape="text" width="14rem" />
      </Skeleton>
      <PublicTripFeedSkeleton />
    </main>
  );
}
