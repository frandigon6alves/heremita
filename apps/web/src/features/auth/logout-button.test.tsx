import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import { readDraft, writeDraft } from '@/shared/storage/session-drafts';
import { LogoutButton } from './logout-button';
import { ME, problemResponse, renderAuth } from './test-support';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});
afterEach(() => {
  server.resetHandlers();
  act(() => resetToasts());
});
afterAll(() => server.close());

describe('LogoutButton', () => {
  it('ends_the_session_forgets_the_viewer_and_goes_to_the_start_page', async () => {
    let method = '';
    server.use(
      http.delete('*/api/v1/sessions/current', ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, queryClient } = renderAuth(<LogoutButton />, { locale: 'pt-BR' });
    queryClient.setQueryData(queryKeys.viewer, ME);
    writeDraft('note:1', 'Private note');

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pt-BR'));
    expect(readDraft('note:1')).toBeNull();
    expect(method).toBe('DELETE');
    expect(router.refresh).toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toBeUndefined();
  });

  it('treats_an_already_ended_session_as_logged_out', async () => {
    server.use(
      http.delete('*/api/v1/sessions/current', () => problemResponse(401, 'unauthenticated')),
    );
    const { user } = renderAuth(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en'));
  });

  it('stays_and_shows_a_toast_when_logging_out_fails', async () => {
    server.use(http.delete('*/api/v1/sessions/current', () => HttpResponse.error()));
    const { user, queryClient } = renderAuth(<LogoutButton />);
    queryClient.setQueryData(queryKeys.viewer, ME);

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await vi.waitFor(() =>
      expect(getSnapshot().toasts.map((toast) => toast.message)).toEqual([
        'Could not log out. Try again.',
      ]),
    );
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toEqual(ME);
  });
});
