'use client';

import { travelModeSchema, type TravelMode } from '@heremita/shared';
import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/shared/components/segmented-control/segmented-control';
import { ModeIcon } from './mode-icon';

interface ModeSwitchProps {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
  disabled?: boolean;
}

/** Walk / Bike / Drive for the selected day's route. */
export function ModeSwitch({ value, onChange, disabled }: ModeSwitchProps) {
  const t = useTranslations('itinerary.route.mode');
  return (
    <SegmentedControl
      legend={t('legend')}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={travelModeSchema.options.map((mode) => ({
        value: mode,
        label: t(mode),
        icon: <ModeIcon mode={mode} />,
      }))}
    />
  );
}
