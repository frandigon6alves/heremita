import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './place-page.module.css';

export default function PlaceLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="60%" />
        <SkeletonBlock shape="text" width="40%" />
        <SkeletonBlock height="180px" />
        <SkeletonBlock height="7rem" />
        <SkeletonBlock height="7rem" />
      </Skeleton>
    </main>
  );
}
