import { Star } from '@/shared/icons/icons';
import styles from './rating-stars.module.css';

const MAX_RATING = 5;
const STARS = Array.from({ length: MAX_RATING }, (_, index) => index);

export interface RatingStarsProps {
  /** 0–5, fractions allowed (an average). */
  rating: number;
  /** What a screen reader hears instead of the stars ("4,4 de 5 estrelas"). */
  label: string;
}

/** Read-only stars filled to `rating` (partial stars for averages), one image with a text name. */
export function RatingStars({ rating, label }: RatingStarsProps) {
  const filledPercent = (Math.min(Math.max(rating, 0), MAX_RATING) / MAX_RATING) * 100;

  return (
    <span className={styles.stars} role="img" aria-label={label}>
      <span className={styles.row}>
        {STARS.map((index) => (
          <Star key={index} size={20} />
        ))}
      </span>
      <span className={`${styles.row} ${styles.filled}`} style={{ width: `${filledPercent}%` }}>
        {STARS.map((index) => (
          <Star key={index} size={20} />
        ))}
      </span>
    </span>
  );
}
