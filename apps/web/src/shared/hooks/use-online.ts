'use client';

import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();
/** The server cannot know; rendering "online" avoids a banner flash on hydration. */
const isOnlineOnServer = () => true;

/**
 * Whether the browser is online, as TanStack Query sees it (`online`/`offline`
 * events). Queries and mutations pause while offline; edit controls read this
 * to disable themselves instead of queueing changes silently.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnlineOnServer);
}
