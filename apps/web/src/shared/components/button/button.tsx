import type { ComponentProps, MouseEvent } from 'react';
import { Spinner } from '../spinner/spinner';
import { buttonClassName, type ButtonLookProps } from './button-class';

export interface ButtonProps extends ComponentProps<'button'>, ButtonLookProps {
  /**
   * Work in progress (submitting): the button shows a spinner next to its
   * label and ignores presses, but stays focusable (`aria-disabled`, not
   * `disabled`) so a keyboard or screen-reader user who pressed it keeps
   * their place instead of being dropped at the top of the page. Pass the
   * in-progress label ("Criando…") as children.
   */
  busy?: boolean;
}

/** A press while busy does nothing: no click handler, no form submission (Enter in a field lands here too). */
function ignorePress(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/** A `<button>` (default `type="button"`) with the app's look and a 44 px minimum target. */
export function Button({
  variant,
  size,
  block,
  busy = false,
  type = 'button',
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={busy ? ignorePress : onClick}
      className={buttonClassName({ variant, size, block }, className)}
    >
      {busy ? <Spinner size={20} /> : null}
      {children}
    </button>
  );
}
