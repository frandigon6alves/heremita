import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonClassName, type ButtonLookProps } from '../button/button-class';

export type LinkButtonProps = ComponentProps<typeof Link> & ButtonLookProps;

/** Navigation that looks like a button (a call to action). Still a link: it goes somewhere. */
export function LinkButton({ variant, size, block, className, ...props }: LinkButtonProps) {
  return <Link {...props} className={buttonClassName({ variant, size, block }, className)} />;
}
