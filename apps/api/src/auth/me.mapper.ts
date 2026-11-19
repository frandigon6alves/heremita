import type { Locale, Me } from '@heremita/shared';
import type { User } from '../generated/prisma/client.js';

type DbLocale = User['locale'];

const TO_DB_LOCALE: Record<Locale, DbLocale> = { en: 'en', es: 'es', 'pt-BR': 'pt_BR' };
const FROM_DB_LOCALE: Record<DbLocale, Locale> = { en: 'en', es: 'es', pt_BR: 'pt-BR' };

export function toDbLocale(locale: Locale): DbLocale {
  return TO_DB_LOCALE[locale];
}

export function fromDbLocale(locale: DbLocale): Locale {
  return FROM_DB_LOCALE[locale];
}

/** The fields of a user row the `Me` payload is built from. */
export type MeRow = Pick<
  User,
  'id' | 'email' | 'displayName' | 'locale' | 'theme' | 'role' | 'isDemo' | 'createdAt'
>;

/** Prisma `select` matching {@link MeRow}. */
export const ME_SELECT = {
  id: true,
  email: true,
  displayName: true,
  locale: true,
  theme: true,
  role: true,
  isDemo: true,
  createdAt: true,
} as const satisfies Record<keyof MeRow, true>;

export function toMe(user: MeRow): Me {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: fromDbLocale(user.locale),
    theme: user.theme,
    role: user.role,
    isDemo: user.isDemo,
    createdAt: user.createdAt.toISOString(),
  };
}
