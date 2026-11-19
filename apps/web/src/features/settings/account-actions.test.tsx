import { endpoints } from '@heremita/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import { readDraft, writeDraft } from '@/shared/storage/session-drafts';
import {
  buildMe,
  failWith,
  networkErrorOn,
  onEndpoint,
  okResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { AccountActions } from './account-actions';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupApiServer();
beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});
afterEach(() => {
  act(() => resetToasts());
});

const PASSWORD = 'my-own-password-1';

function renderActions(locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<AccountActions logOut={<button type="button">Log out</button>} />, {
    locale,
    viewer: buildMe(),
  });
}

async function openDeleteDialog(user: ReturnType<typeof renderActions>['user']) {
  await user.click(screen.getByRole('button', { name: 'Delete account' }));
  return screen.getByRole('dialog', { name: 'Delete your account?' });
}

describe('AccountActions', () => {
  it('logs_out_everywhere_and_forgets_the_viewer', async () => {
    let called = false;
    server.use(
      onEndpoint(endpoints.logOutEverywhere, () => {
        called = true;
        return okResponse(endpoints.logOutEverywhere);
      }),
    );
    const { user, queryClient } = renderActions('pt-BR');
    writeDraft('note:1', 'Private note');

    await user.click(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pt-BR'));
    expect(readDraft('note:1')).toBeNull();
    expect(called).toBe(true);
    expect(router.refresh).toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toBeUndefined();
  });

  it('treats_an_ended_session_as_logged_out_everywhere', async () => {
    server.use(failWith(endpoints.logOutEverywhere, 'unauthenticated'));
    const { user } = renderActions();

    await user.click(screen.getByRole('button', { name: 'Log out on all devices' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
  });

  it('stays_with_a_toast_when_logging_out_everywhere_fails', async () => {
    server.use(networkErrorOn(endpoints.logOutEverywhere));
    const { user, queryClient } = renderActions();

    await user.click(screen.getByRole('button', { name: 'Log out on all devices' }));

    await waitFor(() =>
      expect(getSnapshot().toasts.at(-1)?.message).toBe('Could not log out. Try again.'),
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toEqual(buildMe());
    expect(screen.getByRole('button', { name: 'Log out on all devices' })).toBeEnabled();
  });

  it('opens_the_delete_dialog_with_a_warning_and_cancel_focused', async () => {
    const { user } = renderActions();

    const dialog = await openDeleteDialog(user);

    expect(dialog).toHaveTextContent('your public trips and reviews disappear for everyone');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete account' })).toHaveFocus();
  });

  it('deletes_the_account_with_the_password_and_leaves', async () => {
    const bodies: unknown[] = [];
    server.use(
      onEndpoint(endpoints.deleteAccount, async ({ request }) => {
        bodies.push(await request.json());
        await delay(30);
        return okResponse(endpoints.deleteAccount);
      }),
    );
    const { user, queryClient } = renderActions();
    writeDraft('note:1', 'Private note');
    const dialog = await openDeleteDialog(user);

    await user.type(within(dialog).getByLabelText('Password'), PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    expect(await within(dialog).findByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
    expect(readDraft('note:1')).toBeNull();
    expect(bodies).toEqual([{ password: PASSWORD }]);
    expect(queryClient.getQueryData(queryKeys.viewer)).toBeUndefined();
    expect(getSnapshot().toasts.at(-1)?.message).toBe('Your account was deleted.');
  });

  it('shows_a_wrong_password_on_its_field', async () => {
    server.use(
      failWith(endpoints.deleteAccount, 'wrong_password', {
        errors: [{ pointer: '/body/password', detail: 'The password is wrong.' }],
      }),
    );
    const { user } = renderActions('pt-BR');
    await user.click(screen.getByRole('button', { name: 'Excluir conta' }));

    await user.type(screen.getByLabelText('Senha'), PASSWORD);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta.');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('asks_for_the_password_before_calling_the_api', async () => {
    const { user } = renderActions();
    const dialog = await openDeleteDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password to confirm.');
  });

  it('explains_an_unexpected_failure_inside_the_dialog', async () => {
    server.use(failWith(endpoints.deleteAccount, 'internal_error'));
    const { user } = renderActions();
    await openDeleteDialog(user);

    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.keyboard('{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });
});
