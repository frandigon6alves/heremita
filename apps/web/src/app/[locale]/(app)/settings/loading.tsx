import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './settings-page.module.css';

export default function SettingsLoading() {
  return (
    <main id="main" className={styles.main}>
      <Skeleton>
        <SkeletonBlock shape="text" width="30%" />
        <SkeletonBlock height="var(--target-min)" width="80%" />
        <SkeletonBlock height="8rem" />
        <SkeletonBlock height="8rem" />
        <SkeletonBlock height="12rem" />
      </Skeleton>
    </main>
  );
}
