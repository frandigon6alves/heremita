import { useTranslations } from 'next-intl';
import styles from './demo-badge.module.css';

/** "Exemplo" / "Example" next to anything written by a seeded demo account. */
export function DemoBadge() {
  const t = useTranslations('common');
  return <span className={styles.badge}>{t('demoBadge')}</span>;
}
