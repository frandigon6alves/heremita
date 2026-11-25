'use client';

import { PlaceSearch } from '@/features/place-search';
import type { DestinationPicker } from '@/features/trips/destination';

/**
 * The place search as a trip form's destination field (create and settings):
 * features never import each other, so the route composes them here.
 */
export function DestinationSearch({
  label,
  defaultValue,
  onPick,
  onText,
  errorId,
}: DestinationPicker & { label: string }) {
  return (
    <PlaceSearch
      label={label}
      showLabel
      intent="submit"
      defaultValue={defaultValue}
      onSelect={onPick}
      onInputChange={onText}
      errorId={errorId}
    />
  );
}
