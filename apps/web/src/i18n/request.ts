import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { buildIntlConfig } from './config';
import { routing } from './routing';

export default getRequestConfig(async () => {
  const requested = await rootLocale();
  return buildIntlConfig(hasLocale(routing.locales, requested) ? requested : routing.defaultLocale);
});
