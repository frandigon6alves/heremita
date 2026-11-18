import type { ComponentProps, ReactNode } from 'react';
import { buttonClassName, iconButtonClassName, type ButtonVariant } from '../button/button-class';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label' | 'children'> {
  /** Accessible name, required: the button shows only an icon. */
  label: string;
  /** A decorative icon from `@/shared/icons`. */
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, 'danger'>;
}

/** Round 44 px button showing only an icon; `label` becomes its accessible name. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  type = 'button',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={buttonClassName({ variant }, iconButtonClassName, className)}
    >
      {icon}
    </button>
  );
}
