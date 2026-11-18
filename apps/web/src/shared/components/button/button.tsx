import type { ComponentProps } from 'react';
import { Spinner } from '../spinner/spinner';
import { buttonClassName, type ButtonLookProps } from './button-class';

export interface ButtonProps extends ComponentProps<'button'>, ButtonLookProps {
  /**
   * Work in progress (submitting): the button is disabled and shows a spinner
   * next to its label. Pass the in-progress label ("Criando…") as children.
   */
  busy?: boolean;
}

/** A `<button>` (default `type="button"`) with the app's look and a 44 px minimum target. */
export function Button({
  variant,
  size,
  block,
  busy = false,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      className={buttonClassName({ variant, size, block }, className)}
    >
      {busy ? <Spinner size={20} /> : null}
      {children}
    </button>
  );
}
