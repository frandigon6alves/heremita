'use client';

import type { Theme } from '@heremita/shared';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function readChosenTheme(): Theme {
  const chosen = document.documentElement.getAttribute('data-theme');
  return chosen === 'light' || chosen === 'dark' ? chosen : 'system';
}

const noChoiceOnServer = (): Theme => 'system';

/** The theme the page was asked for (`<html data-theme>`): light, dark, or system when none. */
export function useChosenTheme(): Theme {
  return useSyncExternalStore(subscribe, readChosenTheme, noChoiceOnServer);
}
