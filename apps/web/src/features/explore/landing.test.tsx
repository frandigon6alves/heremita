import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { Landing } from './landing';
import { buildPublicTripCard } from './test-support';

describe('Landing', () => {
  it('invites_a_signed_out_visitor_to_sign_up', () => {
    renderWithProviders(<Landing signedIn={false} communityTrips={[]} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your trip, your way.');
    for (const link of screen.getAllByRole('link', { name: 'Start planning' })) {
      expect(link).toHaveAttribute('href', '/en/signup');
    }
  });

  it('sends_a_signed_in_viewer_to_their_trips', () => {
    renderWithProviders(<Landing signedIn communityTrips={[]} />);

    expect(screen.queryByRole('link', { name: 'Start planning' })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Go to my trips' })) {
      expect(link).toHaveAttribute('href', '/en/trips');
    }
  });

  it('lists_three_steps', () => {
    renderWithProviders(<Landing signedIn={false} communityTrips={[]} />);

    const steps = screen.getByRole('heading', { name: 'How it works' }).nextElementSibling;
    expect(
      within(steps as HTMLElement)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Mark', 'Organise', 'Follow']);
  });

  it('shows_the_community_strip_with_a_link_to_explore', () => {
    const trips = [
      buildPublicTripCard({ title: 'Lisboa a pé' }),
      buildPublicTripCard({ title: 'Rio' }),
    ];
    renderWithProviders(<Landing signedIn={false} communityTrips={trips} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Trips from the community' }),
    ).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 3, name: 'Rio' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'See all in Explore' })).toHaveAttribute(
      'href',
      '/en/explore',
    );
  });

  it('hides_the_community_strip_without_trips', () => {
    renderWithProviders(<Landing signedIn={false} communityTrips={[]} />);

    expect(
      screen.queryByRole('heading', { name: 'Trips from the community' }),
    ).not.toBeInTheDocument();
  });

  it('speaks_portuguese', () => {
    renderWithProviders(<Landing signedIn={false} communityTrips={[]} />, { locale: 'pt-BR' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Sua viagem, do seu jeito.',
    );
    expect(screen.getAllByRole('link', { name: 'Começar a planejar' })[0]).toHaveAttribute(
      'href',
      '/pt-BR/signup',
    );
  });
});
