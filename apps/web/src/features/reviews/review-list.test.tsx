import { endpoints } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  failWith,
  onEndpoint,
  okResponse,
  problemResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { ReviewList, type ReviewListProps } from './review-list';
import { buildReview, page, PLACE_ID, stubPopoverApi } from './test-support';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const server = setupApiServer();
stubPopoverApi();

function renderList(props: Partial<ReviewListProps> = {}, route = `/en/places/${PLACE_ID}`) {
  return renderWithProviders(
    <ReviewList placeId={PLACE_ID} reviewCount={3} myReview={null} signedIn {...props} />,
    { route },
  );
}

function authors(): string[] {
  return screen
    .getAllByRole('article')
    .map((article) => within(article).getAllByRole('link')[0]!.textContent ?? '');
}

describe('ReviewList', () => {
  it('renders_the_server_page_without_fetching', () => {
    const reviews = [
      buildReview({
        author: { id: '0195f0c8-0000-7000-8000-0000000c0001', displayName: 'Caio', isDemo: true },
      }),
    ];
    renderList({ initialPage: { sort: 'recent', page: page(reviews) } });

    expect(authors()).toEqual(['Caio']);
    expect(screen.getByText('Example')).toBeVisible();
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
    expect(screen.getByText('Visited in Oct 2026')).toBeVisible();
  });

  it('shows_a_skeleton_while_the_first_page_loads', async () => {
    server.use(respondWith(endpoints.listPlaceReviews, page([buildReview()])));
    renderList();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('article')).toBeVisible();
  });

  it('refetches_with_the_chosen_sort_and_writes_it_to_the_url', async () => {
    const sorts: string[] = [];
    server.use(
      onEndpoint(endpoints.listPlaceReviews, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get('sort') ?? '');
        return okResponse(endpoints.listPlaceReviews, page([buildReview({ rating: 1 })]));
      }),
    );
    const { user, urlUpdates } = renderList({
      initialPage: { sort: 'recent', page: page([buildReview()]) },
    });

    await user.click(screen.getByRole('radio', { name: 'Lowest rated' }));

    expect(await screen.findByRole('img', { name: '1 out of 5 stars' })).toBeInTheDocument();
    expect(sorts).toEqual(['lowest']);
    expect(urlUpdates.at(-1)?.queryString).toBe('?sort=lowest');
    expect(urlUpdates.at(-1)?.options.history).toBe('replace');
  });

  it('starts_from_the_sort_in_the_url', async () => {
    server.use(respondWith(endpoints.listPlaceReviews, page([buildReview()])));
    renderList({}, `/en/places/${PLACE_ID}?sort=lowest`);

    expect(screen.getByRole('radio', { name: 'Lowest rated' })).toBeChecked();
    expect(await screen.findByRole('article')).toBeVisible();
  });

  it('loads_more_until_the_last_page', async () => {
    const second = buildReview({
      author: { id: '0195f0c8-0000-7000-8000-0000000d0002', displayName: 'Duda', isDemo: false },
    });
    const cursors: Array<string | null> = [];
    server.use(
      onEndpoint(endpoints.listPlaceReviews, ({ request }) => {
        cursors.push(new URL(request.url).searchParams.get('cursor'));
        return okResponse(endpoints.listPlaceReviews, page([second]));
      }),
    );
    const { user } = renderList({
      initialPage: { sort: 'recent', page: page([buildReview()], 'cursor-2') },
    });

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: 'Duda' })).toBeVisible();
    expect(cursors).toEqual(['cursor-2']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps_the_list_and_explains_when_load_more_fails', async () => {
    server.use(failWith(endpoints.listPlaceReviews, 'internal_error'));
    const { user } = renderList({
      initialPage: { sort: 'recent', page: page([buildReview()], 'cursor-2') },
    });

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('More reviews could not be loaded.');
    expect(screen.getByRole('alert')).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('shows_an_error_with_code_request_id_and_retry_when_the_first_page_fails', async () => {
    let attempts = 0;
    server.use(
      onEndpoint(endpoints.listPlaceReviews, () => {
        attempts += 1;
        return attempts === 1
          ? problemResponse('internal_error')
          : okResponse(endpoints.listPlaceReviews, page([buildReview()]));
      }),
    );
    const { user } = renderList();

    expect(
      await screen.findByRole('heading', { name: 'Reviews could not be loaded.' }),
    ).toBeVisible();
    expect(screen.getByText('Code: internal_error')).toBeVisible();
    expect(screen.getByText(`Request ID: ${TEST_REQUEST_ID}`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('article')).toBeVisible();
  });

  it('lists_the_viewers_own_review_first_and_only_once', () => {
    const mine = buildReview({
      isMine: true,
      author: { id: '0195f0c8-0000-7000-8000-0000000e0001', displayName: 'Ana', isDemo: false },
    });
    const other = buildReview();
    renderList({ myReview: mine, initialPage: { sort: 'recent', page: page([other, mine]) } });

    expect(authors()).toEqual(['Ana', 'Bia']);
    expect(screen.getByText('Your review')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Actions for the review by/ })).toHaveLength(1);
  });

  it('says_when_every_review_is_filtered_out', () => {
    renderList({ initialPage: { sort: 'recent', page: page([]) } });

    expect(screen.getByRole('heading', { name: 'No reviews to show.' })).toBeVisible();
  });

  it('renders_nothing_when_the_place_has_no_reviews', () => {
    const { container } = renderList({
      reviewCount: 0,
      initialPage: { sort: 'recent', page: page([]) },
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('reads_in_portuguese', async () => {
    server.use(respondWith(endpoints.listPlaceReviews, page([buildReview()])));
    renderWithProviders(
      <ReviewList placeId={PLACE_ID} reviewCount={1} myReview={null} signedIn={false} />,
      { locale: 'pt-BR' },
    );

    expect(await screen.findByText('Visitou em out. de 2026')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Mais recentes' })).toBeChecked();
  });
});
