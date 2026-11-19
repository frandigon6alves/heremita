'use client';

import { useSyncExternalStore } from 'react';

interface MediaQueryStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

const stores = new Map<string, MediaQueryStore>();

/** One stable store per query, so React never resubscribes on re-render. */
function storeFor(query: string): MediaQueryStore {
  const existing = stores.get(query);
  if (existing !== undefined) {
    return existing;
  }
  const store: MediaQueryStore = {
    subscribe: (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    getSnapshot: () => window.matchMedia(query).matches,
  };
  stores.set(query, store);
  return store;
}

/** The server cannot know the viewport: phone first, so every query is false until hydrated. */
const matchesOnServer = () => false;

/**
 * Whether the media query matches now, updated when it flips. Use it only
 * for behaviour (gesture mechanics, camera options); layout stays in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const { subscribe, getSnapshot } = storeFor(query);
  return useSyncExternalStore(subscribe, getSnapshot, matchesOnServer);
}
