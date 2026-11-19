import type { Locale } from '@heremita/shared';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { TIME_ZONE } from '@/i18n/config';
import { messages as en } from '@/messages/en';
import { messages as es } from '@/messages/es';
import { messages as ptBR } from '@/messages/pt-BR';
import type { Messages } from '@/messages/types';

const catalogues: Record<Locale, Messages> = { en, es, 'pt-BR': ptBR };

/** The app's intl provider with the real catalogue of `locale` and UTC dates. */
export function TestIntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={catalogues[locale]} timeZone={TIME_ZONE}>
      {children}
    </NextIntlClientProvider>
  );
}

interface RenderWithIntlOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Defaults to `en` so assertions read in the source language. */
  locale?: Locale;
  /** Options for `userEvent.setup()`, e.g. `advanceTimers` with fake timers. */
  userOptions?: Parameters<typeof userEvent.setup>[0];
}

/** Renders `ui` inside the app's intl provider (real catalogues, UTC) with a user-event session. */
export function renderWithIntl(
  ui: ReactElement,
  { locale = 'en', userOptions, ...options }: RenderWithIntlOptions = {},
): RenderResult & { user: UserEvent } {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TestIntlProvider locale={locale}>{children}</TestIntlProvider>;
  }
  return { user: userEvent.setup(userOptions), ...render(ui, { wrapper: Wrapper, ...options }) };
}
