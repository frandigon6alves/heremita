import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/api/server';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { robots: { index: false } };

/** Log-in and sign-up: signed-in viewers have nothing to do here. */
export default async function AuthLayout({ children }: LayoutProps<'/[locale]'>) {
  // API down: show the form anyway; submitting explains the failure.
  const viewer = await getViewer().catch(() => null);
  if (viewer !== null) {
    redirect(routes.trips(await getLocale()));
  }

  return children;
}
