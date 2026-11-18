import { notFound } from 'next/navigation';

/**
 * Any URL under a locale that no route matches: renders the localized
 * `not-found.tsx` inside the root layout instead of Next's bare 404.
 */
export default function UnknownPage() {
  notFound();
}
