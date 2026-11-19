import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './moderation-page.module.css';

export default function ModerationLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="30%" />
        <SkeletonBlock height="44px" width="320px" />
        <SkeletonBlock height="10rem" />
        <SkeletonBlock height="10rem" />
      </Skeleton>
    </main>
  );
}
