import { endpoints } from '@heremita/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMe,
  failWith,
  onEndpoint,
  okResponse,
  setupApiServer,
} from '../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../test/render';
import { LanguageSwitcher } from './language-switcher';

const loadDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/load-document', () => ({ loadDocument }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/places/p1',
  useSearchParams: () => new URLSearchParams('sort=lowest'),
}));

const server = setupApiServer();
afterEach(() => loadDocument.mockReset());

function recordPatches() {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.updateMe, async ({ request }) => {
      bodies.push(await request.json());
      return okResponse(endpoints.updateMe, buildMe({ locale: 'es' }));
    }),
  );
  return bodies;
}

describe('LanguageSwitcher', () => {
  it('links_to_the_same_page_in_the_other_languages', () => {
    renderWithProviders(<LanguageSwitcher signedIn={false} />);

    expect(screen.getByRole('link', { name: 'Español' })).toHaveAttribute(
      'href',
      '/es/places/p1?sort=lowest',
    );
    expect(screen.getByRole('link', { name: 'Português (Brasil)' })).toHaveAttribute(
      'href',
      '/pt-BR/places/p1?sort=lowest',
    );
  });

  it('saves_the_language_to_the_account_before_leaving_when_signed_in', async () => {
    const bodies = recordPatches();
    const { user } = renderWithProviders(<LanguageSwitcher signedIn />);

    await user.click(screen.getByRole('link', { name: 'Español' }));

    await waitFor(() => expect(loadDocument).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ locale: 'es' }]);
    expect(loadDocument).toHaveBeenCalledWith(
      expect.stringMatching(/\/es\/places\/p1\?sort=lowest$/),
    );
  });

  it('still_switches_the_page_when_saving_the_language_fails', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user } = renderWithProviders(<LanguageSwitcher signedIn />);

    await user.click(screen.getByRole('link', { name: 'Português (Brasil)' }));

    await waitFor(() =>
      expect(loadDocument).toHaveBeenCalledWith(expect.stringMatching(/\/pt-BR\/places\/p1/)),
    );
  });

  it('sends_nothing_for_a_signed_out_visitor', async () => {
    const bodies = recordPatches();
    const { user } = renderWithProviders(<LanguageSwitcher signedIn={false} />);

    await user.click(screen.getByRole('link', { name: 'Español' }));

    expect(bodies).toEqual([]);
    expect(loadDocument).not.toHaveBeenCalled();
  });
});
