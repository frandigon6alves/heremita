import type { ComponentProps } from 'react';
import styles from './visually-hidden.module.css';

/** Text for assistive technology only: read out, never painted. */
export function VisuallyHidden({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      {...props}
      className={className ? `${styles.visuallyHidden} ${className}` : styles.visuallyHidden}
    />
  );
}
