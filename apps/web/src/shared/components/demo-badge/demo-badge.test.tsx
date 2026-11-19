import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { DemoBadge } from './demo-badge';

describe('DemoBadge', () => {
  it('says_example_in_english', () => {
    renderWithIntl(<DemoBadge />, { locale: 'en' });

    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('says_exemplo_in_portuguese', () => {
    renderWithIntl(<DemoBadge />, { locale: 'pt-BR' });

    expect(screen.getByText('Exemplo')).toBeInTheDocument();
  });
});
