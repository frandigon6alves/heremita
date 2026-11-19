'use client';

import { lazy, Suspense, useState } from 'react';
import type { ReportDialogProps } from './report-dialog';

/** The form (react-hook-form, zod and the shared schema) downloads on the first "Report". */
const ReportDialog = lazy(() =>
  import('./report-dialog').then((module) => ({ default: module.ReportDialog })),
);

/**
 * `ReportDialog` for pages where reporting is a rare side action (trip viewer,
 * reviews): nothing renders until the first open, then it stays mounted so
 * closing and reopening behave as the eager dialog.
 */
export function LazyReportDialog(props: ReportDialogProps) {
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) {
    setOpened(true);
  }
  if (!opened) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <ReportDialog {...props} />
    </Suspense>
  );
}
