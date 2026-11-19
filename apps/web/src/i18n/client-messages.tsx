import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Messages } from '@/messages/types';

export type Namespace = keyof Messages;

/** What every page's client components translate with: chrome, states, the account menu. */
export const ROOT_NAMESPACES = ['common', 'auth'] as const satisfies readonly Namespace[];

/**
 * Hands the client components below only the catalogue parts they use, so a
 * page's RSC payload carries those and not the whole catalogue. The root
 * layout passes none (`ROOT_NAMESPACES` only); a layout or page adds its own.
 * A nested provider replaces its parent's messages, hence the root ones are
 * always included. `client-messages.test.ts` checks every route has every
 * namespace its client components use.
 */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Namespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  const picked = Object.fromEntries(
    [...ROOT_NAMESPACES, ...namespaces].map((namespace) => [namespace, messages[namespace]]),
  );
  return <NextIntlClientProvider messages={picked}>{children}</NextIntlClientProvider>;
}
