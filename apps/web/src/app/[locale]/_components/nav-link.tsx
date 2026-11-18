'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** A link that marks itself `aria-current="page"` on its own page or below it. */
export function NavLink({ href, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
  return <Link href={href} aria-current={isCurrent ? 'page' : undefined} {...props} />;
}
