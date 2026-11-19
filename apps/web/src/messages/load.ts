import type { Locale } from '@heremita/shared';
import type { Messages } from './types';

const loaders: Record<Locale, () => Promise<Messages>> = {
  en: () => import('./en').then((module) => module.messages),
  es: () => import('./es').then((module) => module.messages),
  'pt-BR': () => import('./pt-BR').then((module) => module.messages),
};

/** Loads one locale's catalogue, so a request never ships the other language. */
export function loadMessages(locale: Locale): Promise<Messages> {
  return loaders[locale]();
}
