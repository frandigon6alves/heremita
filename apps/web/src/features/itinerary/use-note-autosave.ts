import { endpoints } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { SaveStatus } from '@/shared/components/status-line/status-line';
import { readDraft, writeDraft } from '@/shared/storage/session-drafts';
import { applyNote } from './apply-plan-ops';
import { usePlanMutation } from './use-plan-mutation';

/** Typing pause after which the note saves itself. */
export const NOTE_AUTOSAVE_MS = 800;

function draftKey(tripPlaceId: string): string {
  return `note:${tripPlaceId}`;
}

const SAVE_STATUS = {
  idle: 'idle',
  pending: 'saving',
  error: 'error',
  success: 'saved',
} as const satisfies Record<string, SaveStatus>;

const toNote = (text: string) => (text.trim() === '' ? null : text);

/**
 * A trip place's private note, saved 800 ms after the last keystroke and on
 * blur (E30, last write wins). Unsaved text is mirrored in `sessionStorage`
 * until the server has it, so a reload or a failed save does not lose it: a
 * draft found on mount is shown and saved like fresh typing.
 */
export function useNoteAutosave(tripId: string, tripPlaceId: string, savedNote: string | null) {
  const t = useTranslations('itinerary.toasts');
  const [text, setText] = useState(savedNote ?? '');
  const timer = useRef<number | null>(null);
  const lastSent = useRef(savedNote ?? '');

  // SHORTCUT(owner): note autosave has no concurrency control — ceiling: two tabs editing one note, last write wins; upgrade: first report of a lost note
  const mutation = usePlanMutation<{ text: string }, unknown>({
    tripId,
    mutationFn: ({ text: sent }) =>
      apiFetch(endpoints.updateTripPlace, {
        params: { tripId, tripPlaceId },
        body: { note: toNote(sent) },
      }),
    optimistic: (plan, { text: sent }) => applyNote(plan, tripPlaceId, toNote(sent)),
    failureMessage: () => t('noteFailed'),
    onSuccess: (_data, { text: sent }) => {
      if (readDraft(draftKey(tripPlaceId)) === sent) {
        writeDraft(draftKey(tripPlaceId), null);
      }
    },
  });

  function save(current: string) {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    // After a failure the same text is sent again (blur is the user's retry too).
    if (current === lastSent.current && mutation.status !== 'error') {
      return;
    }
    lastSent.current = current;
    mutation.mutate({ text: current });
  }

  const flush = useEffectEvent(() => {
    if (timer.current !== null) {
      save(text);
    }
  });

  const resumeDraft = useEffectEvent(() => {
    const draft = readDraft(draftKey(tripPlaceId));
    if (draft === null) {
      return;
    }
    if (draft === (savedNote ?? '')) {
      writeDraft(draftKey(tripPlaceId), null);
      return;
    }
    change(draft);
  });

  useEffect(() => {
    resumeDraft();
    return () => flush();
  }, []);

  function change(next: string) {
    setText(next);
    writeDraft(draftKey(tripPlaceId), next);
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => save(next), NOTE_AUTOSAVE_MS);
  }

  return { text, change, blur: () => save(text), status: SAVE_STATUS[mutation.status] };
}
