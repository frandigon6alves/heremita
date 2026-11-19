import { vi } from 'vitest';

/**
 * Test double for `window.matchMedia` (jsdom has none): `set(query, matches)`
 * flips a query and fires `change` on its listeners.
 */
export function installFakeMatchMedia() {
  const state = new Map<string, boolean>();
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return state.get(query) ?? false;
    },
    media: query,
    addEventListener: (_type: 'change', listener: () => void) => {
      const set = listeners.get(query) ?? new Set();
      set.add(listener);
      listeners.set(query, set);
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      listeners.get(query)?.delete(listener);
    },
  }));

  return {
    set(query: string, matches: boolean) {
      state.set(query, matches);
      for (const listener of listeners.get(query) ?? []) {
        listener();
      }
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0;
    },
  };
}
