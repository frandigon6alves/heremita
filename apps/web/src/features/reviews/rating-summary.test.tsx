import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { RatingSummary } from './rating-summary';
import { buildRating } from './test-support';

describe('RatingSummary', () => {
  it('invites_the_first_review_when_there_is_none', () => {
    renderWithIntl(<RatingSummary rating={buildRating(0)} />, { locale: 'pt-BR' });

    expect(screen.getByText('Ainda sem avaliações. Esteve lá? Escreva a primeira.')).toBeVisible();
  });

  it('shows_only_the_count_below_six_reviews', () => {
    renderWithIntl(<RatingSummary rating={buildRating(5)} />, { locale: 'pt-BR' });

    expect(screen.getByText('5 avaliações')).toBeVisible();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows_one_review_in_the_singular', () => {
    renderWithIntl(<RatingSummary rating={buildRating(1)} />);

    expect(screen.getByText('1 review')).toBeVisible();
  });

  it('shows_average_and_distribution_from_six_reviews', () => {
    renderWithIntl(
      <RatingSummary rating={{ count: 12, average: 4.36, distribution: [0, 1, 1, 3, 7] }} />,
      { locale: 'pt-BR' },
    );

    expect(screen.getByText('4,4 ★')).toBeInTheDocument();
    expect(screen.getByText('Média 4,4 de 5')).toBeInTheDocument();
    expect(screen.getByText('12 avaliações')).toBeVisible();
    const bars = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(bars).toEqual([
      '5 estrelas: 7',
      '4 estrelas: 3',
      '3 estrelas: 1',
      '2 estrelas: 1',
      '1 estrela: 0',
    ]);
  });
});
