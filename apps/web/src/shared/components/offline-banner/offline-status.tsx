'use client';

import { onlineManager } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useOnline } from '@/shared/hooks/use-online';
import { announce } from '../toast/toast-store';
import { OfflineBanner } from './offline-banner';

/**
 * App-wide offline notice: the banner while offline, and one announcement in
 * the polite live region on each change (a banner appearing is not announced
 * by itself).
 */
export function OfflineStatus() {
  const t = useTranslations('common');
  const online = useOnline();

  useEffect(
    () => onlineManager.subscribe((isOnline) => announce(t(isOnline ? 'onlineAgain' : 'offline'))),
    [t],
  );

  return <OfflineBanner online={online} />;
}
