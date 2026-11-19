import { endpoints } from '@heremita/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  failWith,
  onEndpoint,
  okResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { ReviewItem } from './review-item';
import { buildReview, PLACE_ID, stubPopoverApi } from './test-support';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupApiServer();
stubPopoverApi();
afterEach(() => {
  resetToasts();
  push.mockReset();
});

const review = buildReview({
  id: '0195f0c8-0000-7000-8000-0000000f0001',
  author: { id: '0195f0c8-0000-7000-8000-0000000f0002', displayName: 'Bia', isDemo: false },
});

function renderItem(signedIn = true) {
  return renderWithProviders(<ReviewItem review={review} signedIn={signedIn} />);
}

async function openMenuItem(user: ReturnType<typeof renderItem>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: 'Actions for the review by Bia' }));
  await user.click(screen.getByRole('button', { name, hidden: true }));
}

function lastToast(): string | undefined {
  return getSnapshot().toasts.at(-1)?.message;
}

describe('ReviewItem report', () => {
  it('requires_a_reason_before_sending', async () => {
    const { user } = renderItem();

    await openMenuItem(user, 'Report');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a reason.');
    expect(screen.getByRole('group', { name: 'Reason' })).toHaveAccessibleDescription(
      'Choose a reason.',
    );
  });

  it('sends_reason_and_cleaned_details_then_closes_with_a_toast', async () => {
    const bodies: unknown[] = [];
    server.use(
      onEndpoint(endpoints.createReport, async ({ request }) => {
        bodies.push(await request.json());
        return okResponse(endpoints.createReport, { id: '0195f0c8-0000-7000-8000-0000000f0003' });
      }),
    );
    const { user } = renderItem();

    await openMenuItem(user, 'Report');
    await user.click(screen.getByRole('radio', { name: 'Spam or advertising' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Details (optional)' }),
      '  link de loja  ',
    );
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bodies).toEqual([
      { target: { type: 'review', id: review.id }, reason: 'spam', details: 'link de loja' },
    ]);
    expect(lastToast()).toBe('Report sent. A moderator will look at it.');
  });

  it('leaves_details_out_when_empty', async () => {
    const bodies: unknown[] = [];
    server.use(
      onEndpoint(endpoints.createReport, async ({ request }) => {
        bodies.push(await request.json());
        return okResponse(endpoints.createReport, { id: '0195f0c8-0000-7000-8000-0000000f0003' });
      }),
    );
    const { user } = renderItem();

    await openMenuItem(user, 'Report');
    await user.click(screen.getByRole('radio', { name: 'Something else' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ target: { type: 'review', id: review.id }, reason: 'other' });
  });

  it('explains_a_duplicate_report_and_stays_open', async () => {
    server.use(failWith(endpoints.createReport, 'already_reported'));
    const { user } = renderItem();

    await openMenuItem(user, 'Report');
    await user.click(screen.getByRole('radio', { name: 'Offensive or hateful' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You already reported this.');
    expect(screen.getByRole('alert')).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getByRole('dialog', { name: 'Report this review' })).toBeVisible();
  });

  it('cancels_without_sending', async () => {
    const { user } = renderItem();

    await openMenuItem(user, 'Report');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ReviewItem block', () => {
  it('blocks_the_author_after_confirmation_and_refetches_places', async () => {
    const blocked: string[] = [];
    server.use(
      onEndpoint(endpoints.blockUser, ({ params }) => {
        blocked.push(params.userId);
        return okResponse(endpoints.blockUser);
      }),
    );
    const { user, queryClient } = renderItem();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await openMenuItem(user, 'Block user');
    expect(screen.getByRole('dialog', { name: 'Block Bia?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Block Bia' }));

    await waitFor(() => expect(lastToast()).toBe('Bia is blocked.'));
    expect(blocked).toEqual([review.author.id]);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['me', 'blocks'],
      ['places'],
      ['explore'],
    ]);
  });

  it('explains_a_failed_block_inside_the_dialog', async () => {
    server.use(failWith(endpoints.blockUser, 'internal_error'));
    const { user } = renderItem();

    await openMenuItem(user, 'Block user');
    await user.click(screen.getByRole('button', { name: 'Block Bia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bia could not be blocked. Try again.',
    );
  });
});

describe('ReviewItem signed out', () => {
  it('sends_the_viewer_to_log_in_and_back_to_the_place', async () => {
    const { user } = renderItem(false);

    await openMenuItem(user, 'Report');

    expect(push).toHaveBeenCalledWith(
      `/en/login?next=${encodeURIComponent(`/en/places/${PLACE_ID}`)}`,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ReviewItem own review', () => {
  it('has_no_menu_and_tells_when_moderation_hid_it', () => {
    renderWithProviders(
      <ReviewItem review={{ ...review, isMine: true, status: 'hidden' }} signedIn />,
      { locale: 'pt-BR' },
    );

    expect(screen.queryByRole('button', { name: /Ações/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sua avaliação')).toBeVisible();
    expect(screen.getByText('Oculta pela moderação: só você pode ver.')).toBeVisible();
  });
});
