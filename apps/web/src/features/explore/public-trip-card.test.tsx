import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { PublicTripCard } from './public-trip-card';
import { buildPublicTripCard } from './test-support';

describe('PublicTripCard', () => {
  it('links_the_title_to_the_trip_and_the_author_to_the_profile', () => {
    const trip = buildPublicTripCard();
    renderWithProviders(<PublicTripCard trip={trip} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Lisboa a pé' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lisboa a pé' })).toHaveAttribute(
      'href',
      `/en/t/${trip.id}`,
    );
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      `/en/u/${trip.author.id}`,
    );
  });

  it('describes_destination_mode_days_author_places_and_copies', () => {
    renderWithProviders(<PublicTripCard trip={buildPublicTripCard()} />);
    const card = screen.getByRole('article');

    expect(card).toHaveTextContent('Lisboa · On foot · 4 days');
    expect(card).toHaveTextContent('by Ana Example · 18 places');
    expect(card).toHaveTextContent('Copied 12 times');
  });

  it('leaves_out_what_is_unknown_or_zero', () => {
    const trip = buildPublicTripCard({
      destinationName: null,
      copyCount: 0,
      defaultMode: 'bike',
      author: { id: '0195f0c8-0000-7000-8000-00000000c002', displayName: 'Bia', isDemo: false },
    });
    renderWithProviders(<PublicTripCard trip={trip} headingLevel={3} />);
    const card = screen.getByRole('article');

    expect(screen.getByRole('heading', { level: 3 })).toBeVisible();
    expect(card).toHaveTextContent(/^Lisboa a péBy bike · 4 days/);
    expect(card).not.toHaveTextContent('Example');
    expect(card).not.toHaveTextContent(/copied/i);
  });

  it('draws_one_dot_per_preview_point_and_a_pin_without_points', () => {
    const { container, rerender } = renderWithProviders(
      <PublicTripCard trip={buildPublicTripCard()} />,
    );
    const sketch = () => container.querySelector('svg[viewBox="0 0 120 72"]');
    expect(sketch()?.querySelectorAll('circle')).toHaveLength(3);
    expect(sketch()?.querySelector('polyline')).not.toBeNull();

    rerender(<PublicTripCard trip={buildPublicTripCard({ previewPoints: [] })} />);
    expect(sketch()).toBeNull();
    expect(container.querySelector('div[aria-hidden="true"] > svg')).not.toBeNull();
  });

  it('speaks_portuguese', () => {
    renderWithProviders(<PublicTripCard trip={buildPublicTripCard({ copyCount: 1 })} />, {
      locale: 'pt-BR',
    });
    const card = screen.getByRole('article');

    expect(card).toHaveTextContent('Lisboa · A pé · 4 dias');
    expect(card).toHaveTextContent('por Ana Exemplo · 18 lugares');
    expect(card).toHaveTextContent('Copiada 1 vez');
  });
});
