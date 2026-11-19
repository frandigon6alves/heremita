import { endpoints, type Review } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  failWith,
  onEndpoint,
  okResponse,
  problemResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { buildReview, page, PLACE_ID } from './test-support';
import { UserReviewList } from './user-review-list';

const server = setupApiServer();
const USER_ID = '0195f0c8-0000-7000-8000-00000000c001';

/** A review on this traveller's profile list. */
function authoredReview(overrides: Partial<Review> = {}): Review {
  return buildReview({ author: { id: USER_ID, displayName: 'Ana', isDemo: false }, ...overrides });
}

describe('UserReviewList', () => {
  it('shows_place_link_stars_visit_month_and_text', () => {
    renderWithProviders(<UserReviewList userId={USER_ID} initialPage={page([authoredReview()])} />);
    const review = screen.getByRole('article');

    expect(within(review).getByRole('link', { name: 'Castelo de São Jorge' })).toHaveAttribute(
      'href',
      `/en/places/${PLACE_ID}`,
    );
    expect(within(review).getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(review).toHaveTextContent('Visited in Oct 2026');
    expect(review).toHaveTextContent('Vista linda sobre a cidade, vale a subida.');
  });

  it('tells_the_author_a_review_is_hidden', () => {
    renderWithProviders(
      <UserReviewList
        userId={USER_ID}
        initialPage={page([authoredReview({ status: 'hidden' })])}
      />,
    );

    expect(screen.getByText('Hidden by moderation: only you see it.')).toBeVisible();
  });

  it('says_when_there_are_none', () => {
    renderWithProviders(<UserReviewList userId={USER_ID} initialPage={page([])} />, {
      locale: 'pt-BR',
    });

    expect(screen.getByRole('heading', { level: 3, name: 'Ainda sem avaliações.' })).toBeVisible();
  });

  it('loads_more_and_explains_a_failed_page', async () => {
    let calls = 0;
    server.use(
      onEndpoint(endpoints.listUserReviews, () => {
        calls += 1;
        return calls === 1
          ? okResponse(endpoints.listUserReviews, page([authoredReview()], 'cursor-3'))
          : problemResponse('internal_error');
      }),
    );
    const { user } = renderWithProviders(
      <UserReviewList userId={USER_ID} initialPage={page([authoredReview()], 'cursor-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('More reviews could not be loaded.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });

  it('shows_an_error_with_retry_when_the_first_page_fails', async () => {
    server.use(failWith(endpoints.listUserReviews, 'internal_error'));
    renderWithProviders(<UserReviewList userId={USER_ID} />);

    expect(
      await screen.findByRole('heading', { name: 'The reviews could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
  });
});
