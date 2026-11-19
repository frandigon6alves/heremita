import { travelModeSchema, type TravelMode } from '@heremita/shared';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const plannerParams = {
  day: parseAsString,
  place: parseAsString,
  mode: parseAsStringLiteral(travelModeSchema.options),
};

/**
 * URL state of the planner and the read-only trip pages (§I.web.params):
 * `day` and `mode` replace the history entry, `place` pushes one so Back
 * deselects. Raw values: the screen resolves them against the plan.
 */
export function usePlannerParams() {
  const [params, setParams] = useQueryStates(plannerParams, { shallow: true });

  return {
    day: params.day,
    place: params.place,
    mode: params.mode,
    /** Switching day closes the selected place, in the same history entry. */
    selectDay: (day: string) => setParams({ day, place: null }, { history: 'replace' }),
    selectPlace: (place: string | null) => setParams({ place }, { history: 'push' }),
    selectMode: (mode: TravelMode | null) => setParams({ mode }, { history: 'replace' }),
  };
}
