import styles from './spinner.module.css';

interface SpinnerProps {
  size?: 16 | 20 | 24;
}

/**
 * Short in-place wait (inside a busy button, a refreshing row). Decorative:
 * the text next to it ("Salvando…") says what is happening. Lists and cards
 * use `Skeleton` instead.
 */
export function Spinner({ size = 20 }: SpinnerProps) {
  return (
    <svg
      className={styles.spinner}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden="true"
      focusable="false"
    >
      <circle className={styles.track} cx="12" cy="12" r="9" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
