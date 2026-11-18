import type { Locale } from '@heremita/shared';
import { loadMessages } from '@/messages/load';

/**
 * Calendar dates in the contract are `YYYY-MM-DD` strings: formatting them in
 * the server's time zone would move them a day near midnight.
 */
export const TIME_ZONE = 'UTC';

export async function buildIntlConfig(locale: Locale) {
  return { locale, timeZone: TIME_ZONE, messages: await loadMessages(locale) };
}
