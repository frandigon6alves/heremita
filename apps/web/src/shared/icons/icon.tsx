import type { ReactNode } from 'react';

export interface IconProps {
  /** Rendered width and height in CSS px: 20 in rows, 24 in bars. */
  size?: 20 | 24;
  className?: string;
}

/**
 * Decorative 24×24 stroke icon drawn in `currentColor`. Always hidden from
 * assistive technology: the control around it carries the accessible name.
 */
export function Icon({ size = 24, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}
