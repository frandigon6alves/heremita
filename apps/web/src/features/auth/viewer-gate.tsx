import 'server-only';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { makeQueryClient } from '@/lib/api/query-client';
import { queryKeys } from '@/lib/api/query-keys';
import { getViewer } from '@/lib/api/server';
import { REQUEST_PATH_HEADER } from '@/lib/routes';
import { signedOutRedirect } from './gate-redirect';

/**
 * Members-only pages: signed out → log-in with `next` back to the page.
 * Signed in → the client cache starts with the viewer (`['viewer']`), so no
 * client component asks the API for it again. An API failure is not "signed
 * out": it reaches the error boundary.
 */
export async function ViewerGate({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  // SHORTCUT(owner): signup required to create a trip — ceiling: users who abandon at the signup form; upgrade: if signup-start → signup-done drops below 60%, add server-side guest accounts that convert on signup
  if (viewer === null) {
    const requested = (await headers()).get(REQUEST_PATH_HEADER);
    redirect(signedOutRedirect(await getLocale(), requested));
  }

  const queryClient = makeQueryClient();
  queryClient.setQueryData(queryKeys.viewer, viewer);
  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
