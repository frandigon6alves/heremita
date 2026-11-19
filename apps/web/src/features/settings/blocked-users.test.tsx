import { endpoints } from '@heremita/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  failWith,
  onEndpoint,
  okResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { BlockedUsers } from './blocked-users';
import { buildUserCard } from './test-support';

const server = setupApiServer();
afterEach(() => {
  act(() => resetToasts());
});

const BRUNO = buildUserCard();
const CARLA = buildUserCard({
  id: '0195f0c8-0000-7000-8000-0000000000b2',
  displayName: 'Carla',
  isDemo: true,
});
const DIEGO = buildUserCard({ id: '0195f0c8-0000-7000-8000-0000000000b3', displayName: 'Diego' });

function renderList(locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<BlockedUsers />, { locale });
}

describe('BlockedUsers', () => {
  it('lists_blocked_people_with_a_profile_link_and_demo_badge', async () => {
    server.use(respondWith(endpoints.listBlocks, { items: [BRUNO, CARLA], nextCursor: null }));
    renderList();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Blocked people' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByRole('link', { name: 'Bruno' })).toHaveAttribute(
      'href',
      `/en/u/${BRUNO.id}`,
    );
    expect(within(list).getByText('Example')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says_when_nobody_is_blocked', async () => {
    server.use(respondWith(endpoints.listBlocks, { items: [], nextCursor: null }));
    renderList('pt-BR');

    expect(
      await screen.findByRole('heading', { name: 'Você não bloqueou ninguém' }),
    ).toBeInTheDocument();
  });

  it('loads_the_next_page_on_request', async () => {
    const cursors: (string | null)[] = [];
    server.use(
      onEndpoint(endpoints.listBlocks, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return cursor === null
          ? okResponse(endpoints.listBlocks, { items: [BRUNO], nextCursor: 'page2' })
          : okResponse(endpoints.listBlocks, { items: [DIEGO], nextCursor: null });
      }),
    );
    const { user } = renderList();

    await user.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: 'Diego' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bruno' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(cursors).toEqual([null, 'page2']);
  });

  it('shows_an_error_with_retry_when_the_list_fails', async () => {
    server.use(failWith(endpoints.listBlocks, 'internal_error'));
    const { user } = renderList();

    expect(
      await screen.findByRole('heading', { name: 'Could not load the people you blocked.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`Request ID: ${TEST_REQUEST_ID}`)).toBeInTheDocument();

    server.use(respondWith(endpoints.listBlocks, { items: [BRUNO], nextCursor: null }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'Bruno' })).toBeInTheDocument();
  });

  it('unblocks_a_person_and_refreshes_what_they_wrote', async () => {
    let blocked = [BRUNO, CARLA];
    const unblocked: string[] = [];
    server.use(
      onEndpoint(endpoints.listBlocks, () =>
        okResponse(endpoints.listBlocks, { items: blocked, nextCursor: null }),
      ),
      onEndpoint(endpoints.unblockUser, ({ params }) => {
        unblocked.push(params.userId);
        blocked = blocked.filter((person) => person.id !== params.userId);
        return okResponse(endpoints.unblockUser);
      }),
    );
    const { user, queryClient } = renderList();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Unblock Bruno' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Bruno' })).not.toBeInTheDocument(),
    );
    expect(unblocked).toEqual([BRUNO.id]);
    expect(getSnapshot().toasts.at(-1)?.message).toBe('Bruno unblocked');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'blocks'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['places'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['explore'] });
  });

  it('keeps_the_person_and_offers_retry_when_unblocking_fails', async () => {
    server.use(
      respondWith(endpoints.listBlocks, { items: [BRUNO], nextCursor: null }),
      failWith(endpoints.unblockUser, 'internal_error'),
    );
    const { user } = renderList();

    await user.click(await screen.findByRole('button', { name: 'Unblock Bruno' }));

    await waitFor(() =>
      expect(getSnapshot().toasts.at(-1)?.message).toBe('Could not unblock Bruno.'),
    );
    expect(getSnapshot().toasts.at(-1)?.action?.label).toBe('Try again');
    expect(screen.getByRole('link', { name: 'Bruno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unblock Bruno' })).toBeEnabled();
  });
});
