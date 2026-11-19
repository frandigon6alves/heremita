import type { Locale, Me } from '@heremita/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderWithIntl } from '@/test-utils/render';

export const ME: Me = {
  id: '0195f0c8-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  displayName: 'Ana',
  locale: 'en',
  theme: 'dark',
  role: 'user',
  isDemo: false,
  createdAt: '2026-11-18T10:00:00.000Z',
};

/** A problem document as the API sends it, plus its headers. */
export function problemResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      type: `urn:heremita:problem:${code}`,
      title: code,
      status,
      detail: `Problem ${code}`,
      instance: '/api/v1/x',
      code,
      ...extra,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Request-Id': 'req-12345678',
        ...headers,
      },
    },
  );
}

/** Renders an auth component with intl and a fresh query client (no retries). */
export function renderAuth(ui: ReactElement, { locale = 'en' }: { locale?: Locale } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = renderWithIntl(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    { locale },
  );
  return { ...result, queryClient };
}
