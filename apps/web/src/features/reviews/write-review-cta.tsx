import { useTranslations } from 'next-intl';
import { LinkButton } from '@/shared/components/link-button/link-button';
import styles from './write-review-cta.module.css';

/**
 * Sticky "Escrever avaliação" (or "Editar minha avaliação") at the bottom of
 * the place page. Signed-out viewers go through log-in and come back to the
 * review form.
 */
export function WriteReviewCta({ href, hasReview }: { href: string; hasReview: boolean }) {
  const t = useTranslations('reviews.place');

  return (
    <div className={styles.bar}>
      <LinkButton href={href} variant="primary" size="large" className={styles.button}>
        {hasReview ? t('editMine') : t('write')}
      </LinkButton>
    </div>
  );
}
