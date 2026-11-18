import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { LinkButton } from '../link-button/link-button';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('says_why_it_is_empty_and_offers_the_next_step', () => {
    renderWithIntl(
      <EmptyState
        title="You have no trips yet"
        body="Or copy one from Explore."
        actions={<LinkButton href="/en/trips/new">New trip</LinkButton>}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'You have no trips yet' })).toBeVisible();
    expect(screen.getByText('Or copy one from Explore.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/en/trips/new');
  });

  it('uses_the_requested_heading_level', () => {
    renderWithIntl(<EmptyState title="No public trips for 'Fiji'" headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      "No public trips for 'Fiji'",
    );
  });
});
