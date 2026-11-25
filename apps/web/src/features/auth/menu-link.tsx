'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

/**
 * A link inside a native popover menu. A client navigation keeps the layout
 * (and the open popover) mounted, so the link closes its popover itself.
 */
export function MenuLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
  }
  return <Link {...props} onClick={handleClick} />;
}
