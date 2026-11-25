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
import { LanguageMenu, MobileMenu, ThemeMenu } from './header-menus';

const loadDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/load-document', () => ({ loadDocument }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/explore',
  useSearchParams: () => new URLSearchParams('q=lisboa'),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const server = setupApiServer();

afterEach(() => {
  loadDocument.mockReset();
  resetToasts();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function openMenu(name: string) {
  const trigger = screen.getByRole('button', { name });
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

describe('LanguageMenu and ThemeMenu', () => {
  it('lists_every_language_as_a_link_to_this_page_and_marks_the_current_one', () => {
    renderWithProviders(<LanguageMenu signedIn={false} />);
    const menu = openMenu('Language');

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
    const { user } = renderWithProviders(<ThemeMenu signedIn={false} />);
    const menu = openMenu('Theme');

    await user.click(menu.getByRole('radio', { name: 'Dark', hidden: true }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(menu.getByRole('radio', { name: 'Dark', hidden: true })).toBeChecked();
    expect(bodies).toEqual([]);
  });

  it('saves_the_theme_to_the_account_when_signed_in', async () => {
    const bodies = recordPatches();
    const { user, queryClient } = renderWithProviders(<ThemeMenu signedIn />, {
      viewer: buildMe({ theme: 'system' }),
    });
    const menu = openMenu('Theme');

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
    const { user } = renderWithProviders(<ThemeMenu signedIn />);
    const menu = openMenu('Theme');

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
    const { user } = renderWithProviders(<LanguageMenu signedIn />);
    const menu = openMenu('Language');

    await user.click(menu.getByRole('link', { name: 'Português (Brasil)', hidden: true }));

    await waitFor(() => expect(loadDocument).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ locale: 'pt-BR' }]);
    expect(loadDocument).toHaveBeenCalledWith(expect.stringMatching(/\/pt-BR\/explore\?q=lisboa$/));
  });

  it('gives_the_theme_button_one_icon_per_theme_for_css_to_pick_from_the_first_paint', () => {
    renderWithProviders(<ThemeMenu signedIn={false} />);

    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(
      [...trigger.querySelectorAll('[data-theme-icon]')].map((icon) =>
        icon.getAttribute('data-theme-icon'),
      ),
    ).toEqual(['system', 'light', 'dark']);
  });
});

describe('MobileMenu', () => {
  it('offers_everything_to_a_visitor_behind_one_gear', () => {
    renderWithProviders(<MobileMenu viewer={null} />);
    const menu = openMenu('Menu');

    expect(menu.getByRole('link', { name: 'Explore', hidden: true })).toHaveAttribute(
      'href',
      '/en/explore',
    );
    expect(menu.getByRole('link', { name: 'Log in', hidden: true })).toHaveAttribute(
      'href',
      '/en/login',
    );
    expect(menu.getByRole('link', { name: 'Sign up', hidden: true })).toHaveAttribute(
      'href',
      '/en/signup',
    );
    expect(menu.getByRole('link', { name: 'Español', hidden: true })).toBeInTheDocument();
    expect(menu.getByRole('radio', { name: 'Dark', hidden: true })).toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'My trips', hidden: true })).not.toBeInTheDocument();
  });

  it('offers_the_account_to_a_signed_in_viewer_and_moderation_to_moderators', () => {
    renderWithProviders(<MobileMenu viewer={{ displayName: 'Ana Beatriz', moderator: true }} />);
    const menu = openMenu('Menu');

    expect(menu.getByText('Ana Beatriz')).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'My trips', hidden: true })).toHaveAttribute(
      'href',
      '/en/trips',
    );
    expect(menu.getByRole('link', { name: 'Settings', hidden: true })).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Moderation', hidden: true })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: 'Log out', hidden: true })).toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Log in', hidden: true })).not.toBeInTheDocument();
  });

  it('hides_moderation_from_other_users', () => {
    renderWithProviders(<MobileMenu viewer={{ displayName: 'Ana', moderator: false }} />);

    expect(
      openMenu('Menu').queryByRole('link', { name: 'Moderation', hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('closes_itself_when_a_link_navigates', async () => {
    const { user } = renderWithProviders(<MobileMenu viewer={null} />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    if (popover === null) {
      throw new Error('popover missing');
    }
    // jsdom has no popover API.
    const hidePopover = vi.fn();
    popover.hidePopover = hidePopover;

    await user.click(within(popover).getByRole('link', { name: 'Explore', hidden: true }));

    expect(hidePopover).toHaveBeenCalledOnce();
  });
});

describe('header menus in Portuguese', () => {
  it('speak_portuguese', () => {
    renderWithProviders(
      <>
        <LanguageMenu signedIn={false} />
        <ThemeMenu signedIn={false} />
        <MobileMenu viewer={null} />
      </>,
      { locale: 'pt-BR' },
    );

    expect(screen.getByRole('button', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Criar conta', hidden: true })).toHaveLength(1);
  });
});
