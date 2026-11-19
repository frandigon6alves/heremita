import type { TravelMode } from '@heremita/shared';
import { TRAVEL_MODES } from '@heremita/shared/plain';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const plannerParams = {
  day: parseAsString,
  place: parseAsString,
  mode: parseAsStringLiteral(TRAVEL_MODES),
};

/**
 * URL state of the planner and the read-only trip pages (§I.web.params):
 * `day` and `mode` replace the history entry, `place` pushes one so Back
 * deselects. Raw values: the screen resolves them against the plan.
 * `modePerDay` (owner): a mode chosen in the URL is saved on its day, so
 * switching day drops it and the next day shows its own saved mode.
 */
export function usePlannerParams({ modePerDay = false }: { modePerDay?: boolean } = {}) {
  const [params, setParams] = useQueryStates(plannerParams, { shallow: true });

  return {
    day: params.day,
    place: params.place,
    mode: params.mode,
    /** Switching day closes the selected place, in the same history entry. */
    selectDay: (day: string) =>
      setParams(modePerDay ? { day, place: null, mode: null } : { day, place: null }, {
        history: 'replace',
      }),
    selectPlace: (place: string | null) => setParams({ place }, { history: 'push' }),
    selectMode: (mode: TravelMode | null) => setParams({ mode }, { history: 'replace' }),
  };
}
