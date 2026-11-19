import { endpoints, type Locale } from '@heremita/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
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
const loadDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/load-document', () => ({ loadDocument }));

const server = setupApiServer();
beforeEach(() => {
  router.refresh.mockReset();
  loadDocument.mockReset();
  document.documentElement.setAttribute('data-theme', 'light');
});
afterEach(() => {
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

function saveButton() {
  return screen.getByRole('button', { name: /Save preferences|Salvar preferências/ });
}

describe('PreferencesForm', () => {
  it('shows_the_account_theme_and_the_page_language', () => {
    renderForm('pt-BR');

    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Português (Brasil)' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('saves_nothing_while_the_arrow_keys_move_through_the_choices', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.keyboard('{ArrowRight}');
    await delay(20);

    expect(screen.getByRole('radio', { name: 'Português (Brasil)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(bodies).toEqual([]);
    expect(loadDocument).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('applies_the_chosen_theme_when_saved_and_saves_it_to_the_account', async () => {
    const bodies = recordPatches(50);
    const { user, queryClient } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(saveButton());

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(bodies).toEqual([{ theme: 'dark' }]);
    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ theme: 'dark' });
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(router.refresh).toHaveBeenCalled();
    expect(loadDocument).not.toHaveBeenCalled();
  });

  it('saves_a_choice_made_with_the_keyboard_on_enter', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.keyboard('{ArrowRight}{Enter}');

    await waitFor(() => expect(bodies).toEqual([{ theme: 'dark' }]));
  });

  it('keeps_the_chosen_theme_when_a_viewer_refetch_was_in_flight', async () => {
    recordPatches();
    server.use(
      onEndpoint(endpoints.getMe, async () => {
        await delay(100);
        return okResponse(endpoints.getMe, buildMe({ theme: 'light' }));
      }),
    );
    const { user, queryClient } = renderForm();
    void queryClient.refetchQueries({ queryKey: queryKeys.viewer });

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(saveButton());
    await delay(150);

    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ theme: 'dark' });
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('rolls_the_theme_back_and_keeps_the_choice_when_saving_fails', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user, queryClient } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'System' }));
    await user.click(saveButton());

    expect(await screen.findByText('Not saved')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Preferences not saved. Try again.');
    expect(screen.getByRole('alert')).toHaveTextContent('Code: internal_error');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ theme: 'light' });
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('saves_the_language_before_leaving_for_the_other_locale', async () => {
    const bodies = recordPatches(50);
    const { user } = renderForm('pt-BR');

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(saveButton());

    await waitFor(() => expect(loadDocument).toHaveBeenCalledWith('/en/settings#preferences'));
    expect(bodies).toEqual([{ locale: 'en' }]);
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeDisabled();
  });

  it('saves_language_and_theme_in_one_request', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'Español' }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(saveButton());

    await waitFor(() => expect(loadDocument).toHaveBeenCalledWith('/es/settings#preferences'));
    expect(bodies).toEqual([{ locale: 'es', theme: 'dark' }]);
  });

  it('sends_nothing_when_nothing_changed', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();

    await user.click(saveButton());
    await delay(20);

    expect(bodies).toEqual([]);
  });

  it('offers_every_language_named_in_itself', () => {
    renderForm();

    const languages = within(screen.getByRole('group', { name: 'Language' }));
    expect(
      languages.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['English', 'Español', 'Português (Brasil)']);
  });

  it('stays_on_the_language_when_saving_it_fails', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user } = renderForm('pt-BR');

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(saveButton());

    expect(await screen.findByText('Não salvo')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Preferências não salvas. Tente de novo.');
    expect(loadDocument).not.toHaveBeenCalled();
  });
});
