import type { CopySource } from '@/features/trips/use-copy-trip';

const KEY = 'hm-copy-intent';

function keyOf(source: CopySource): string {
  return 'tripId' in source ? `trip:${source.tripId}` : `share:${source.shareToken}`;
}

/**
 * A signed-out viewer chose "Copy" in this tab; login brings them back with
 * `?copy=1`. Only a copy this tab asked for resumes: a crafted link with the
 * param alone copies nothing.
 */
export function rememberCopyIntent(source: CopySource): void {
  try {
    window.sessionStorage.setItem(KEY, keyOf(source));
  } catch {
    // Blocked storage: back from login, the viewer presses Copy again.
  }
}

/** Whether this tab asked to copy `source`; the intent is spent either way. */
export function takeCopyIntent(source: CopySource): boolean {
  try {
    const intent = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return intent === keyOf(source);
  } catch {
    return false;
  }
}
