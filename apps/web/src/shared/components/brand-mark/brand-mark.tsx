import styles from './brand-mark.module.css';

/**
 * The Heremita mark: a hermit crab's shell on a teal tile with one coral
 * dot, the brand's "one thing that matters". Decorative: the name next to
 * it (or the link around it) says who we are.
 */
export function BrandMark({ size = 28 }: { size?: 28 | 40 }) {
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" className={styles.tile} />
      <path
        d="M18 15a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44"
        className={styles.shell}
      />
      <circle cx="24.5" cy="7.5" r="2.5" className={styles.dot} />
    </svg>
  );
}
