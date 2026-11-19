'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/shared/components/empty-state/empty-state';
import { MapPin } from '@/shared/icons/icons';
import type { PlanEditor } from './plan-editor';
import { findPlace, ideaIds, isPendingId, type PlanLike } from './plan-view';
import { IdeaActions } from './stop-actions';
import { dayOptions } from './stop-list';
import { StopRow, type OpenSource } from './stop-row';
import { usePlaceDetail } from './use-place-detail';
import styles from './stop-list.module.css';

interface IdeasListProps {
  plan: PlanLike;
  selectedPlaceId: string | null;
  onOpen: (tripPlaceId: string, source: OpenSource) => void;
  editor?: PlanEditor;
}

/** Places saved for later, on no day yet. */
export function IdeasList({ plan, selectedPlaceId, onOpen, editor }: IdeasListProps) {
  const t = useTranslations('itinerary');
  const detailOf = usePlaceDetail();
  const ids = ideaIds(plan);

  if (ids.length === 0) {
    return (
      <EmptyState
        headingLevel={3}
        icon={<MapPin size={24} />}
        title={t('list.emptyIdeas.title')}
        body={editor ? t('list.emptyIdeas.body') : undefined}
      />
    );
  }

  return (
    <ul className={styles.list} aria-label={t('list.ideasLabel')}>
      {ids.map((id) => {
        const entry = findPlace(plan, id);
        if (!entry) {
          return null;
        }
        const name = entry.place.name;
        const pending = isPendingId(id);
        return (
          <li key={id}>
            <StopRow
              name={name}
              detail={detailOf(entry.place)}
              selected={id === selectedPlaceId}
              pending={pending}
              onOpen={(source) => onOpen(id, source)}
              controls={
                editor ? (
                  <IdeaActions
                    name={name}
                    days={dayOptions(plan)}
                    disabled={editor.disabled || pending}
                    onSchedule={(dayId, index) =>
                      editor.actions.schedule({ tripPlaceId: id, name, dayId, index })
                    }
                    onScheduleNewDay={() =>
                      void editor.actions.scheduleOnNewDay({ tripPlaceId: id, name })
                    }
                    onDeleteFromTrip={() => editor.actions.deleteFromTrip(id)}
                  />
                ) : null
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
