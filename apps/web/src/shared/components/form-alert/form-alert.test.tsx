import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProblemError, HttpError } from '@/lib/api/problem';
import { renderWithIntl } from '@/test-utils/render';
import { FormAlert } from './form-alert';

function problem(code: string, status: number, retryAfterSeconds: number | null = null) {
  return new ApiProblemError(
    { type: 'about:blank', title: code, status, detail: code, instance: '/api/v1', code },
    'req-0042',
    retryAfterSeconds,
  );
}

describe('FormAlert', () => {
  it('alerts_the_message_with_the_code_and_request_id', () => {
    renderWithIntl(<FormAlert error={problem('internal_error', 500)} message="Not saved." />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Not saved.');
    expect(alert).toHaveTextContent('Code: internal_error');
    expect(alert).toHaveTextContent('Request ID: req-0042');
  });

  it('quotes_the_request_id_of_an_answer_without_a_problem_document', () => {
    renderWithIntl(<FormAlert error={new HttpError(502, 'req-0043')} message="Not saved." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Request ID: req-0043');
    expect(screen.queryByText(/Code:/)).not.toBeInTheDocument();
  });

  it('says_when_to_try_again_after_too_many_attempts', () => {
    const { rerender } = renderWithIntl(
      <FormAlert error={problem('rate_limited', 429, 30)} message="Not saved." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 30 seconds.');

    rerender(<FormAlert error={problem('rate_limited', 429, 125)} message="Not saved." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 3 minutes.');

    rerender(<FormAlert error={problem('rate_limited', 429)} message="Not saved." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Wait a moment and try again.');
  });

  it('explains_a_lost_connection_without_a_reference', () => {
    const { rerender } = renderWithIntl(
      <FormAlert error={new TypeError('Failed to fetch')} message="Not saved." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline. Connect and try again.');
    expect(screen.queryByText(/Request ID/)).not.toBeInTheDocument();

    rerender(
      <FormAlert
        error={new TypeError('Failed to fetch')}
        message="Not saved."
        offlineMessage="Your text is still here."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Your text is still here.');
  });
});
