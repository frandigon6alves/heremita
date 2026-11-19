'use client';

import { useParams, useSelectedLayoutSegments } from 'next/navigation';
import type { ReactNode } from 'react';

interface SiteChromeProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * The site header and footer around every page except a trip screen (the
 * planner, a public trip, a shared trip), which has its own app bar. The
 * locale layout renders it once, so the header's client code ships in the
 * layout's chunk instead of a copy in each page's and in the not-found chunk.
 */
export function SiteChrome({ header, footer, children }: SiteChromeProps) {
  const params = useParams<{ tripId?: string; shareToken?: string }>();
  const page = useSelectedLayoutSegments().at(-1);
  const tripScreen = page !== undefined && (page === params.tripId || page === params.shareToken);
  return (
    <>
      {tripScreen ? null : header}
      {children}
      {tripScreen ? null : footer}
    </>
  );
}
