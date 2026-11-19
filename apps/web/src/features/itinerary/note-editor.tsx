'use client';

import { LIMITS } from '@heremita/shared/plain';
import { useTranslations } from 'next-intl';
import { StatusLine } from '@/shared/components/status-line/status-line';
import { TextArea } from '@/shared/components/text-area/text-area';
import { useNoteAutosave } from './use-note-autosave';
import styles from './note-editor.module.css';

interface NoteEditorProps {
  tripId: string;
  tripPlaceId: string;
  note: string | null;
  disabled: boolean;
}

/** The owner's private note on a place; saves itself (key it by trip place id). */
export function NoteEditor({ tripId, tripPlaceId, note, disabled }: NoteEditorProps) {
  const t = useTranslations('itinerary.card');
  const { text, change, blur, status } = useNoteAutosave(tripId, tripPlaceId, note);

  return (
    <div className={styles.note}>
      <TextArea
        label={t('note')}
        hint={t('noteHint')}
        value={text}
        maxLength={LIMITS.NOTE_MAX}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
        onBlur={blur}
      />
      <StatusLine status={status} />
    </div>
  );
}
