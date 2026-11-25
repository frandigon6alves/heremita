import { endpoints } from '@heremita/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import { THEME_STORAGE_KEY } from '@/shared/theme/theme';
import {
  buildMe,
  failWith,
  onEndpoint,
  okResponse,
  setupApiServer,
} from '../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../test/render';
import { PreferencesMenu } from './preferences-menu';

const loadDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/load-document', () => ({ loadDocument }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/explore',
  useSearchParams: () => new URLSearchParams('q=lisboa'),
}));

const server = setupApiServer();

afterEach(() => {
  loadDocument.mockReset();
  resetToasts();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Language and theme' });
  const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
  if (popover === null) {
    throw new Error('popover missing');
  }
  expect(popover).toHaveAttribute('popover', 'auto');
  return within(popover);
}

function recordPatches() {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.updateMe, async ({ request }) => {
      const body = (await request.json()) as { theme?: string };
      bodies.push(body);
      return okResponse(endpoints.updateMe, buildMe({ theme: body.theme as 'dark' }));
    }),
  );
  return bodies;
}

describe('PreferencesMenu', () => {
  it('lists_every_language_as_a_link_to_this_page_and_marks_the_current_one', () => {
    renderWithProviders(<PreferencesMenu signedIn={false} />);
    const menu = openMenu();

    const english = menu.getByRole('link', { name: 'English', hidden: true });
    expect(english).toHaveAttribute('aria-current', 'true');
    expect(english).toHaveAttribute('href', '/en/explore?q=lisboa');
    expect(menu.getByRole('link', { name: 'Español', hidden: true })).toHaveAttribute(
      'href',
      '/es/explore?q=lisboa',
    );
    expect(menu.getByRole('link', { name: 'Português (Brasil)', hidden: true })).toHaveAttribute(
      'href',
      '/pt-BR/explore?q=lisboa',
    );
  });

  it('applies_the_theme_at_once_and_keeps_it_in_this_browser_when_signed_out', async () => {
    const bodies = recordPatches();
    const { user } = renderWithProviders(<PreferencesMenu signedIn={false} />);
    const menu = openMenu();

    await user.click(menu.getByRole('radio', { name: 'Dark', hidden: true }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(menu.getByRole('radio', { name: 'Dark', hidden: true })).toBeChecked();
    expect(bodies).toEqual([]);
  });

  it('saves_the_theme_to_the_account_when_signed_in', async () => {
    const bodies = recordPatches();
    const { user, queryClient } = renderWithProviders(<PreferencesMenu signedIn />, {
      viewer: buildMe({ theme: 'system' }),
    });
    const menu = openMenu();

    await user.click(menu.getByRole('radio', { name: 'Light', hidden: true }));

    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => expect(bodies).toEqual([{ theme: 'light' }]));
    await waitFor(() =>
      expect(queryClient.getQueryData(['viewer'])).toMatchObject({ theme: 'light' }),
    );
  });

  it('puts_the_previous_theme_back_and_says_so_when_the_account_refuses', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    document.documentElement.setAttribute('data-theme', 'light');
    const { user } = renderWithProviders(<PreferencesMenu signedIn />);
    const menu = openMenu();

    await user.click(menu.getByRole('radio', { name: 'Dark', hidden: true }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(getSnapshot().toasts.map((toast) => toast.message)).toEqual([
      'The theme was not saved to your account. Try again.',
    ]);
  });

  it('saves_the_language_before_leaving_when_signed_in', async () => {
    const bodies: unknown[] = [];
    server.use(
      onEndpoint(endpoints.updateMe, async ({ request }) => {
        bodies.push(await request.json());
        return okResponse(endpoints.updateMe, buildMe({ locale: 'pt-BR' }));
      }),
    );
    const { user } = renderWithProviders(<PreferencesMenu signedIn />);
    const menu = openMenu();

    await user.click(menu.getByRole('link', { name: 'Português (Brasil)', hidden: true }));

    await waitFor(() => expect(loadDocument).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ locale: 'pt-BR' }]);
    expect(loadDocument).toHaveBeenCalledWith(expect.stringMatching(/\/pt-BR\/explore\?q=lisboa$/));
  });

  it('speaks_portuguese', () => {
    renderWithProviders(<PreferencesMenu signedIn={false} />, { locale: 'pt-BR' });

    expect(screen.getByRole('button', { name: 'Idioma e tema' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Escuro', hidden: true })).toBeInTheDocument();
  });
});
