import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@/shared/theme/theme';

/** Installable app metadata; the name is the brand, so it is not translated. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Heremita',
    short_name: 'Heremita',
    description: 'Plan your own trip: places on a map, a day-by-day itinerary and routes.',
    start_url: '/',
    display: 'standalone',
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
