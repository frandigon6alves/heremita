import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './trip-settings-page.module.css';

export default function TripSettingsLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="12rem" />
        <SkeletonBlock shape="text" width="60%" />
        <SkeletonBlock height="3rem" />
        <SkeletonBlock height="7rem" />
        <SkeletonBlock height="3rem" />
        <SkeletonBlock height="12rem" />
      </Skeleton>
    </main>
  );
}
