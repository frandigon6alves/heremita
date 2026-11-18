import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonLookProps {
  /** `primary` once per screen; `danger` only inside a confirmation. Defaults to `secondary`. */
  variant?: ButtonVariant;
  /** `large` = 48 px, for the main action of a form or page. */
  size?: 'medium' | 'large';
  /** Full width of its container (phone forms). */
  block?: boolean;
}

/** Class names shared by every button-looking control (buttons and links). */
export function buttonClassName(
  { variant = 'secondary', size = 'medium', block = false }: ButtonLookProps,
  ...extra: Array<string | undefined>
): string {
  return [
    styles.button,
    styles[variant],
    size === 'large' ? styles.large : undefined,
    block ? styles.block : undefined,
    ...extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export const iconButtonClassName = styles.icon;
