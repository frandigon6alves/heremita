import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { resetToasts } from '../toast/toast-store';
import { Toaster } from '../toast/toaster';
import { OfflineStatus } from './offline-status';

function goOffline() {
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

describe('OfflineStatus', () => {
  afterEach(() => {
    act(() => {
      onlineManager.setOnline(true);
      resetToasts();
    });
  });

  function renderStatus() {
    return renderWithIntl(
      <>
        <OfflineStatus />
        <Toaster />
      </>,
      { locale: 'pt-BR' },
    );
  }

  it('shows_nothing_while_online', () => {
    renderStatus();

    expect(
      screen.queryByText('Você está offline. As alterações estão pausadas.'),
    ).not.toBeInTheDocument();
  });

  it('shows_the_banner_and_announces_when_the_browser_goes_offline', () => {
    renderStatus();

    goOffline();

    expect(
      screen.getByText('Você está offline. As alterações estão pausadas.', { selector: 'p' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Você está offline. As alterações estão pausadas.',
    );
  });

  it('hides_the_banner_and_announces_when_back_online', () => {
    renderStatus();
    goOffline();

    goOnline();

    expect(screen.getByRole('status')).toHaveTextContent('Você está online de novo.');
    expect(
      screen.queryByText('Você está offline. As alterações estão pausadas.', { selector: 'p' }),
    ).not.toBeInTheDocument();
  });
});
