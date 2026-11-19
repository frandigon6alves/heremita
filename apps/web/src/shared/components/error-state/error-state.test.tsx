import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { renderWithIntl } from '@/test-utils/render';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('shows_the_message_retry_code_and_request_id', async () => {
    const retry = vi.fn();
    const { user } = renderWithIntl(
      <ErrorState
        message="Your places are still saved."
        onRetry={retry}
        code="provider_unavailable"
        requestId="0193a000-aaaa"
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible();
    expect(screen.getByText('Your places are still saved.')).toBeVisible();
    expect(screen.getByText('Code: provider_unavailable')).toBeVisible();
    expect(screen.getByText('Request ID: 0193a000-aaaa')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it('reads_the_code_and_request_id_from_the_error', () => {
    const error = new ApiProblemError(
      {
        type: 'about:blank',
        title: 'Rate limited',
        status: 429,
        detail: 'Too many requests',
        instance: '/api/v1/explore',
        code: 'rate_limited',
      },
      'req-0099',
    );
    const { rerender } = renderWithIntl(<ErrorState error={error} />);

    expect(screen.getByText('Code: rate_limited')).toBeVisible();
    expect(screen.getByText('Request ID: req-0099')).toBeVisible();

    rerender(<ErrorState error={new HttpError(504, 'req-0100')} />);

    expect(screen.queryByText(/Code:/)).not.toBeInTheDocument();
    expect(screen.getByText('Request ID: req-0100')).toBeVisible();
  });

  it('omits_retry_and_references_when_not_given', () => {
    renderWithIntl(<ErrorState title="Route unavailable" headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Route unavailable' })).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Code:/)).not.toBeInTheDocument();
  });

  it('speaks_portuguese', () => {
    renderWithIntl(<ErrorState onRetry={vi.fn()} code="internal_error" />, { locale: 'pt-BR' });

    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    expect(screen.getByText('Código: internal_error')).toBeVisible();
  });
});
