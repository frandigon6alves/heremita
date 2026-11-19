import type { PlaceSummary } from '@heremita/shared';
import { useTranslations } from 'next-intl';

/** "Museu · Rua Augusta 24, Lisboa": category word plus the address line. */
export function usePlaceDetail(): (place: PlaceSummary) => string {
  const t = useTranslations('itinerary.categories');
  return (place) => [t(place.category), place.label].filter(Boolean).join(' · ');
}
