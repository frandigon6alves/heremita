'use client';

import type { Me } from '@heremita/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * After sign-up or log-in: nothing cached for the signed-out visitor stays
 * (lists, place pages and reviews depend on who looks), the client cache
 * learns the viewer at once, the browser goes on to `target` without a
 * history entry for the form, and the server-rendered parts (app bar, theme)
 * render again for the new session.
 */
export function useSignedIn(): (me: Me, target: string) => void {
  const queryClient = useQueryClient();
  const router = useRouter();

  return (me, target) => {
    queryClient.clear();
    queryClient.setQueryData(queryKeys.viewer, me);
    router.replace(target);
    router.refresh();
  };
}
