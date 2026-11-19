'use client';

import { useSyncExternalStore } from 'react';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import type { MapTheme } from './basemap';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const readChosenTheme = () => document.documentElement.getAttribute('data-theme');
const noChosenTheme = () => null;

/** The theme the page shows: `<html data-theme>`, or the OS setting for "system" and none. */
export function useResolvedTheme(): MapTheme {
  const chosen = useSyncExternalStore(subscribe, readChosenTheme, noChosenTheme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  if (chosen === 'light' || chosen === 'dark') {
    return chosen;
  }
  return systemDark ? 'dark' : 'light';
}
