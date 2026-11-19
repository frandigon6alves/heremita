const PREFIX = 'hm-draft:';

/**
 * Unsaved text kept in `sessionStorage` until the server has it, so a reload
 * or a failed save does not lose it. Storage may be blocked (private mode,
 * policies): drafts are a safety net only, so every access fails quietly.
 */
export function readDraft(key: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** `null` forgets the draft. */
export function writeDraft(key: string, text: string | null): void {
  try {
    if (text === null) {
      window.sessionStorage.removeItem(PREFIX + key);
    } else {
      window.sessionStorage.setItem(PREFIX + key, text);
    }
  } catch {
    // Not mirrored: the save itself still goes out.
  }
}

/** Forgets every draft: the session ended, and the next person on this tab must not read them. */
export function clearDrafts(): void {
  try {
    const { sessionStorage } = window;
    const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    );
    for (const key of keys) {
      if (key?.startsWith(PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Blocked storage holds no drafts.
  }
}
