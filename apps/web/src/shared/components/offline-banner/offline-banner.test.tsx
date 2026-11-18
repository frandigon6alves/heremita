import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { OfflineBanner } from './offline-banner';

describe('OfflineBanner', () => {
  it('says_changes_are_paused_while_offline', () => {
    renderWithIntl(<OfflineBanner online={false} />, { locale: 'pt-BR' });

    expect(screen.getByText('Você está offline. As alterações estão pausadas.')).toBeVisible();
  });

  it('renders_nothing_while_online', () => {
    const { container } = renderWithIntl(<OfflineBanner online />);

    expect(container).toBeEmptyDOMElement();
  });
});
