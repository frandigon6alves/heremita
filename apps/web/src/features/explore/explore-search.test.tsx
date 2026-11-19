import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { ExploreSearch } from './explore-search';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe('ExploreSearch', () => {
  it('is_a_get_form_to_explore_with_the_text_as_q', () => {
    renderWithProviders(<ExploreSearch q="lisboa" />);

    const field = screen.getByRole('searchbox', { name: 'Search by destination or title' });
    expect(field).toHaveValue('lisboa');
    expect(field).toHaveAttribute('name', 'q');
    expect(field).toHaveAttribute('maxlength', '80');
    expect(screen.getByRole('search')).toHaveAttribute('action', '/en/explore');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'submit');
  });

  it('speaks_portuguese', () => {
    renderWithProviders(<ExploreSearch q="" />, { locale: 'pt-BR' });

    expect(screen.getByRole('searchbox', { name: 'Buscar por destino ou título' })).toBeVisible();
    expect(screen.getByRole('search')).toHaveAttribute('action', '/pt-BR/explore');
  });
});
