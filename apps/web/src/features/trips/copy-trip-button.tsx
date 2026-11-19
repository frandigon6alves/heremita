'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/button/button';
import { useOnline } from '@/shared/hooks/use-online';
import { Copy } from '@/shared/icons/icons';
import type { CopyTrip } from './use-copy-trip';

export interface CopyTripButtonProps {
  /** From `useCopyTrip`: the screen may also start it (copy resumed after login). */
  copy: CopyTrip;
  /** "Duplicar" on my own trip, "Copiar para minhas viagens" elsewhere. */
  label: string;
}

/** Starts a copy into my trips. Signed in only: the caller handles signed-out viewers. */
export function CopyTripButton({ copy, label }: CopyTripButtonProps) {
  const t = useTranslations('trips.copy');
  const online = useOnline();

  return (
    <Button busy={copy.isPending} disabled={!online} onClick={() => copy.mutate()}>
      <Copy size={20} />
      {copy.isPending ? t('copying') : label}
    </Button>
  );
}
