'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { clearDrafts } from '@/shared/storage/session-drafts';

/**
 * After log-out or account deletion: nothing of the previous viewer stays in
 * memory (query cache, session drafts), the browser goes to the start page
 * without a history entry, and the server-rendered parts render again signed out.
 */
export function useSignedOut(): () => void {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();

  return () => {
    queryClient.clear();
    clearDrafts();
    router.replace(routes.landing(locale));
    router.refresh();
  };
}
