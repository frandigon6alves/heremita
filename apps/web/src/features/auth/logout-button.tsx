'use client';

import { apiRoutes } from '@heremita/shared/api-routes';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { isUnauthenticated } from '@/lib/api/problem';
import { Button } from '@/shared/components/button/button';
import { showToast } from '@/shared/components/toast/toast-store';
import { useSignedOut } from '@/shared/hooks/use-signed-out';

interface LogoutButtonProps {
  className?: string;
}

/**
 * Ends this device's session (E6) and goes to the start page. A session that
 * already ended counts as logged out. Called through `apiFetch` directly, not
 * a mutation, so the global 401 handler does not send the viewer to log-in.
 */
export function LogoutButton({ className }: LogoutButtonProps) {
  const t = useTranslations('auth.account');
  const signedOut = useSignedOut();
  const [pending, setPending] = useState(false);

  const logOut = async () => {
    setPending(true);
    try {
      await apiFetch(apiRoutes.logOut);
    } catch (error) {
      if (!isUnauthenticated(error)) {
        setPending(false);
        showToast({ message: t('logOutFailed') });
        return;
      }
    }
    signedOut();
  };

  return (
    <Button className={className} variant="ghost" busy={pending} onClick={() => void logOut()}>
      {pending ? t('loggingOut') : t('logOut')}
    </Button>
  );
}
