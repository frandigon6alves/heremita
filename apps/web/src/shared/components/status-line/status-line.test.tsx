import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { StatusLine, type SaveStatus } from './status-line';

describe('StatusLine', () => {
  it.each<[SaveStatus, string]>([
    ['saving', 'Salvando…'],
    ['saved', 'Salvo'],
    ['error', 'Não salvo'],
  ])('says_%s_in_words', (status, text) => {
    renderWithIntl(<StatusLine status={status} />, { locale: 'pt-BR' });

    expect(screen.getByText(text)).toBeVisible();
  });

  it('is_empty_while_idle', () => {
    const { container } = renderWithIntl(<StatusLine status="idle" />);

    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});
