'use client';

import { endpoints } from '@heremita/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { isUnauthenticated } from '@/lib/api/problem';
import { routes } from '@/lib/routes';
import { Button } from '@/shared/components/button/button';
import { showToast } from '@/shared/components/toast/toast-store';

interface LogoutButtonProps {
  className?: string;
}

/**
 * Ends this device's session (E6) and goes to the start page. A session that
 * already ended counts as logged out. Called through `apiFetch` directly, not
 * a mutation, so the global 401 handler does not send the viewer to log-in.
 */
export function LogoutButton({ className }: LogoutButtonProps) {
  const locale = useLocale();
  const t = useTranslations('auth.account');
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logOut = async () => {
    setPending(true);
    try {
      await apiFetch(endpoints.logOut);
    } catch (error) {
      if (!isUnauthenticated(error)) {
        setPending(false);
        showToast({ message: t('logOutFailed') });
        return;
      }
    }
    // Nothing of the previous viewer stays in memory.
    queryClient.clear();
    router.replace(routes.landing(locale));
    router.refresh();
  };

  return (
    <Button className={className} variant="ghost" busy={pending} onClick={() => void logOut()}>
      {pending ? t('loggingOut') : t('logOut')}
    </Button>
  );
}
