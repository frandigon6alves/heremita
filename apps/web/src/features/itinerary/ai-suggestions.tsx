'use client';

import type { PlaceResult, TripPlanOwner } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/shared/components/button/button';
import { Sparkles } from '@/shared/icons/icons';
import styles from './ai-suggestions.module.css';

// The dialog (form, results, its mutation) loads on the first press: the
// planner's first load stays within its budget (I.web.budget).
const AiSuggestionsDialog = dynamic(
  () => import('./ai-suggestions-dialog').then((module) => module.AiSuggestionsDialog),
  { ssr: false },
);

export interface AiSuggestionsProps {
  tripId: string;
  plan: TripPlanOwner;
  disabled: boolean;
  onAdd: (place: PlaceResult) => void;
  /** Closes the dialog and shows the place's card on the map. */
  onShowOnMap: (place: PlaceResult) => void;
}

/** "Suggest places with AI" in the Ideas panel (E52). */
export function AiSuggestions(props: AiSuggestionsProps) {
  const t = useTranslations('itinerary.ai');
  const [open, setOpen] = useState(false);
  // Mounted from the first press on, so the last answer is still there when it reopens.
  const [mounted, setMounted] = useState(false);

  return (
    <>
      <Button
        className={styles.open}
        disabled={props.disabled}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Sparkles size={20} />
        {t('open')}
      </Button>
      {mounted ? (
        <AiSuggestionsDialog
          {...props}
          open={open}
          onClose={() => setOpen(false)}
          onShowOnMap={(place) => {
            setOpen(false);
            props.onShowOnMap(place);
          }}
        />
      ) : null}
    </>
  );
}
