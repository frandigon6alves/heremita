import { getTranslations } from 'next-intl/server';
import { AppBar } from '@/shared/components/app-bar/app-bar';
import { Skeleton, SkeletonBlock } from '@/shared/components/skeleton/skeleton';
import styles from './loading.module.css';

const ROWS = 4;

/** Planner skeleton: the bar, day chips and a few rows, in the panel's place. */
export default async function PlannerLoading() {
  const t = await getTranslations('itinerary.screen');

  return (
    <main id="main" className={styles.main}>
      <AppBar>
        <SkeletonBlock shape="text" width="12rem" />
      </AppBar>
      <div className={styles.panel}>
        <Skeleton label={t('loading')}>
          <div className={styles.chips}>
            {Array.from({ length: ROWS }, (_, index) => (
              <SkeletonBlock key={index} width="5rem" height="var(--chip-height)" />
            ))}
          </div>
          {Array.from({ length: ROWS }, (_, index) => (
            <SkeletonBlock key={index} height="var(--target-min)" />
          ))}
        </Skeleton>
      </div>
    </main>
  );
}
