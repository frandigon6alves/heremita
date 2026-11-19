'use client';

import type { LngLat, Locale, PlaceResult, TripPlaceOwner, TripPlanOwner } from '@heremita/shared';
import type { RefObject } from 'react';
import { PlaceCard } from '@/features/itinerary/place-card';
import type { PlanEditor } from '@/features/itinerary/plan-editor';
import { isPendingId } from '@/features/itinerary/plan-view';
import { ResultCard } from '@/features/itinerary/result-card';
import { WhatsHereCard, type CustomPlaceDraft } from '@/features/place-search';
import { CommunitySlot } from '../../../../_components/trip/community-slot';

/** What covers the list: a search result, the "What's here?" card of a draft pin, or a trip place. */
export type PlannerOverlay =
  | { kind: 'result'; result: PlaceResult; focus: boolean }
  | { kind: 'draft'; point: LngLat }
  | { kind: 'place'; tripPlace: TripPlaceOwner; focus: boolean };

interface PlannerOverlayCardProps {
  overlay: PlannerOverlay;
  tripId: string;
  plan: TripPlanOwner;
  locale: Locale;
  editor: PlanEditor;
  /** "Add to day 2" or "Add to Ideas". */
  addLabel: string;
  /** Wraps the "What's here?" card: the draft pin's Enter focuses its heading. */
  whatsHereRef: RefObject<HTMLDivElement | null>;
  onAddResult: (result: PlaceResult) => void;
  onPickNearby: (result: PlaceResult) => void;
  onAddCustom: (place: CustomPlaceDraft) => void;
  onDraftPointChange: (point: LngLat) => void;
  /** Closes the result or draft card, or goes back from a trip place to the list. */
  onClose: () => void;
}

/** The card that replaces the planner's list while something is chosen. */
export function PlannerOverlayCard({
  overlay,
  tripId,
  plan,
  locale,
  editor,
  addLabel,
  whatsHereRef,
  onAddResult,
  onPickNearby,
  onAddCustom,
  onDraftPointChange,
  onClose,
}: PlannerOverlayCardProps) {
  const adding = editor.actions.adding;

  if (overlay.kind === 'result') {
    return (
      <ResultCard
        result={overlay.result}
        addLabel={addLabel}
        adding={adding}
        disabled={editor.disabled}
        autoFocus={overlay.focus}
        onAdd={() => onAddResult(overlay.result)}
        onClose={onClose}
      />
    );
  }
  if (overlay.kind === 'draft') {
    return (
      <div ref={whatsHereRef}>
        <WhatsHereCard
          point={overlay.point}
          addLabel={addLabel}
          adding={adding}
          onPick={onPickNearby}
          onAddCustom={onAddCustom}
          onPointChange={onDraftPointChange}
          onClose={onClose}
        />
      </div>
    );
  }
  const { tripPlace } = overlay;
  return (
    <PlaceCard
      plan={plan}
      tripPlaceId={tripPlace.id}
      autoFocus={overlay.focus}
      onBack={onClose}
      communitySlot={
        isPendingId(tripPlace.id) ? null : <CommunitySlot place={tripPlace} locale={locale} />
      }
      owner={{ tripId, note: tripPlace.note, editor }}
    />
  );
}
