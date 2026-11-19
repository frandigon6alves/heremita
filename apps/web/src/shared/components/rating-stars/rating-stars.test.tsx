import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { RatingStars } from './rating-stars';

function filledWidth(): string {
  const image = screen.getByRole('img');
  const filled = image.lastElementChild;
  if (!(filled instanceof HTMLElement)) {
    throw new Error('filled stars missing');
  }
  return filled.style.width;
}

describe('RatingStars', () => {
  it('is_one_image_named_by_its_text_label', () => {
    renderWithIntl(<RatingStars rating={4.4} label="4.4 out of 5 stars" />);

    expect(screen.getByRole('img', { name: '4.4 out of 5 stars' })).toBeInTheDocument();
  });

  it('fills_the_share_of_the_rating_including_fractions', () => {
    renderWithIntl(<RatingStars rating={4.4} label="4.4 out of 5 stars" />);

    expect(filledWidth()).toBe('88%');
  });

  it('clamps_ratings_outside_zero_to_five', () => {
    const { rerender } = renderWithIntl(<RatingStars rating={-1} label="none" />);
    expect(filledWidth()).toBe('0%');

    rerender(<RatingStars rating={7} label="full" />);
    expect(filledWidth()).toBe('100%');
  });
});
