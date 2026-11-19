import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './review-page.module.css';

export default function PlaceReviewLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="40%" />
        <SkeletonBlock shape="text" width="70%" />
        <SkeletonBlock height="44px" width="240px" />
        <SkeletonBlock height="44px" width="224px" />
        <SkeletonBlock height="10rem" />
      </Skeleton>
    </main>
  );
}
