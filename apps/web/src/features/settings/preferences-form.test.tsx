import { endpoints, type Locale } from '@heremita/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  buildMe,
  failWith,
  onEndpoint,
  okResponse,
  setupApiServer,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { PreferencesForm } from './preferences-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupApiServer();
beforeEach(() => {
  router.refresh.mockReset();
  document.documentElement.setAttribute('data-theme', 'light');
});
afterEach(() => {
  act(() => resetToasts());
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

function recordPatches(respondAfterMs = 0) {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.updateMe, async ({ request }) => {
      const body = (await request.json()) as Record<string, string>;
      bodies.push(body);
      await delay(respondAfterMs);
      return okResponse(endpoints.updateMe, buildMe({ theme: 'light', ...body }));
    }),
  );
  return bodies;
}

function renderForm(locale: Locale = 'en') {
  return renderWithProviders(<PreferencesForm />, { locale, viewer: buildMe({ theme: 'light' }) });
}

describe('PreferencesForm', () => {
  it('shows_the_account_theme_and_the_page_language', () => {
    renderForm('pt-BR');

    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Português (Brasil)' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('applies_a_theme_at_once_and_saves_it_to_the_account', async () => {
    const bodies = recordPatches(50);
    const { user, queryClient } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodies).toEqual([{ theme: 'dark' }]);
    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ theme: 'dark' });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('chooses_a_theme_with_the_keyboard', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.keyboard('{ArrowRight}');

    await waitFor(() => expect(bodies).toContainEqual({ theme: 'dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('rolls_the_theme_back_when_saving_fails', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user, queryClient } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'System' }));

    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ theme: 'light' });
    const toast = getSnapshot().toasts.at(-1);
    expect(toast?.message).toBe('Theme not saved. Try again.');
    expect(toast?.action?.label).toBe('Try again');
  });

  it('retries_a_failed_theme_from_the_toast', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await screen.findByText('Not saved');
    const bodies = recordPatches();

    act(() => getSnapshot().toasts.at(-1)?.action?.onAction());

    await waitFor(() => expect(bodies).toEqual([{ theme: 'dark' }]));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('saves_the_language_before_leaving_for_the_other_locale', async () => {
    const bodies = recordPatches(50);
    const { user } = renderForm('pt-BR');

    await user.click(screen.getByRole('radio', { name: 'English' }));

    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeDisabled();
    await waitFor(() => expect(bodies).toEqual([{ locale: 'en' }]));
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeDisabled();
  });

  it('offers_every_language_named_in_itself', () => {
    renderForm();

    const languages = within(screen.getByRole('group', { name: 'Language' }));
    expect(
      languages.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['English', 'Español', 'Português (Brasil)']);
  });

  it('saves_spanish_as_the_language', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Español' }));

    await waitFor(() => expect(bodies).toEqual([{ locale: 'es' }]));
  });

  it('stays_on_the_language_when_saving_it_fails', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user } = renderForm('pt-BR');

    await user.click(screen.getByRole('radio', { name: 'English' }));

    expect(await screen.findByText('Não salvo')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Português (Brasil)' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeEnabled();
    expect(getSnapshot().toasts.at(-1)?.message).toBe('Idioma não salvo. Tente de novo.');
  });
});
