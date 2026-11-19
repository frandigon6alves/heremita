import { preconnect } from 'react-dom';
import type { PlanQuery } from '@/lib/routes';
import { publicEnv } from '@/public-env';

type SearchParams = Record<string, string | string[] | undefined>;

/** The planner params (`day`, `place`, `mode`) of a trip page's URL, to keep them across a redirect or login. */
export function planQueryFrom(searchParams: SearchParams): PlanQuery {
  const one = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined;
  return {
    day: one(searchParams.day),
    place: one(searchParams.place),
    mode: one(searchParams.mode),
  };
}

/** Opens the connection to the basemap host while the page renders (§I.web.csp). */
export function preconnectBasemap(): void {
  const style = publicEnv.NEXT_PUBLIC_MAP_STYLE_LIGHT;
  if (/^https?:\/\//.test(style)) {
    preconnect(new URL(style).origin);
  }
}
