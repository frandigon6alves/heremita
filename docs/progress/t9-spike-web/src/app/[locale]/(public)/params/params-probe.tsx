'use client';

import { useHydrated } from '@/app/use-hydrated';
import { useTranslations } from 'next-intl';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';

export function ParamsProbe() {
  const t = useTranslations('common');
  const [day, setDay] = useQueryState('day', parseAsString.withOptions({ history: 'replace' }));
  const [place, setPlace] = useQueryState('place', parseAsString.withOptions({ history: 'push' }));
  const [mode, setMode] = useQueryState(
    'mode',
    parseAsStringLiteral(['walk', 'bike', 'drive'] as const).withOptions({ history: 'replace' }),
  );
  return (
    <main data-hydrated={useHydrated()}>
      <p data-testid="state">
        day={day ?? '-'} place={place ?? '-'} mode={mode ?? '-'}
      </p>
      <p data-testid="plural">{t('places', { count: 0 })}</p>
      <button onClick={() => void setDay('d2')}>day</button>
      <button onClick={() => void setPlace('p1')}>place</button>
      <button onClick={() => void setMode('bike')}>mode</button>
    </main>
  );
}
