import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { LoadMore, type LoadMoreProps } from './load-more';

function pagesOf(overrides: Partial<LoadMoreProps['pages']> = {}): LoadMoreProps['pages'] {
  return {
    error: null,
    isFetchNextPageError: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

describe('LoadMore', () => {
  it('fetches_the_next_page_on_click', async () => {
    const pages = pagesOf();
    const { user } = renderWithIntl(<LoadMore pages={pages} failedMessage="More failed" />);

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(pages.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows_nothing_on_the_last_page', () => {
    renderWithIntl(
      <LoadMore pages={pagesOf({ hasNextPage: false })} failedMessage="More failed" />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says_the_next_page_failed_and_still_offers_it', () => {
    renderWithIntl(
      <LoadMore
        pages={pagesOf({ isFetchNextPageError: true, error: new Error('boom') })}
        failedMessage="More failed"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('More failed');
    expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible();
  });
});
