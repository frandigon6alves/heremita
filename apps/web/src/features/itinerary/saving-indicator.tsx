'use client';

import { useIsMutating } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StatusLine } from '@/shared/components/status-line/status-line';
import { planMutationKey } from './use-plan-mutation';

/** Quick saves never flash the indicator. */
export const SAVING_DELAY_MS = 400;

/** The app bar's single "Salvando…" for every queued edit of the trip. */
export function SavingIndicator({ tripId }: { tripId: string }) {
  const saving = useIsMutating({ mutationKey: planMutationKey(tripId) }) > 0;
  return saving ? <DelayedSaving /> : null;
}

function DelayedSaving() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SAVING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? <StatusLine status="saving" /> : null;
}
