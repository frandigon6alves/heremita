import type { TravelMode } from '@heremita/shared';
import { Bike, Car, Footprints } from '@/shared/icons/icons';

const ICONS = { walk: Footprints, bike: Bike, drive: Car } as const;

/** Decorative icon of a travel mode; the text next to it names the mode. */
export function ModeIcon({ mode }: { mode: TravelMode }) {
  const Icon = ICONS[mode];
  return <Icon size={20} />;
}
