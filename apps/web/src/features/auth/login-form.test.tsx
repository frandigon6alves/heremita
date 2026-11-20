import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { LoginForm } from './login-form';
import {
  buildMe,
  problemResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';

const ME = buildMe();

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupApiServer();
beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});

function emailField() {
  return screen.getByRole('textbox', { name: 'E-mail' });
}
function passwordField() {
  return screen.getByLabelText('Password');
}
function submitButton() {
  return screen.getByRole('button', { name: /Log in|Logging in…/ });
}

async function logIn(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(emailField(), 'ana@example.com');
  await user.type(passwordField(), 'any password');
  await user.click(submitButton());
}

describe('LoginForm', () => {
  it('asks_for_both_fields_on_an_empty_submit_and_focuses_the_first', async () => {
    const { user } = renderWithProviders(<LoginForm />);

    await user.click(submitButton());

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Enter an e-mail address like ana@example.com.',
      'Enter your password.',
    ]);
    expect(emailField()).toHaveFocus();
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses_the_current_password_autocomplete_so_password_managers_fill_it', () => {
    renderWithProviders(<LoginForm />);

    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
    expect(emailField()).toHaveAttribute('autocomplete', 'email');
  });

  it('goes_to_my_trips_after_log_in_and_caches_the_viewer', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/sessions', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(ME, { status: 201 });
      }),
    );
    const { user, queryClient } = renderWithProviders(<LoginForm />);

    await logIn(user);

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en/trips'));
    expect(body).toEqual({ email: 'ana@example.com', password: 'any password' });
    expect(router.refresh).toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toEqual(ME);
    expect(screen.getByRole('button', { name: 'Logging in…' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('forgets_what_was_cached_for_the_signed_out_visitor', async () => {
    server.use(http.post('*/api/v1/sessions', () => HttpResponse.json(ME, { status: 201 })));
    const { user, queryClient } = renderWithProviders(<LoginForm />);
    const anonymousReviews = queryKeys.places.reviews('place-1', 'recent');
    queryClient.setQueryData(anonymousReviews, { pages: [], pageParams: [] });
    queryClient.setQueryData(queryKeys.viewer, null);

    await logIn(user);

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(queryClient.getQueryData(anonymousReviews)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.viewer)).toEqual(ME);
  });

  it('goes_back_to_next_after_log_in', async () => {
    server.use(http.post('*/api/v1/sessions', () => HttpResponse.json(ME, { status: 201 })));
    const { user } = renderWithProviders(<LoginForm next="/en/t/trip-1?copy=1" />);

    await logIn(user);

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en/t/trip-1?copy=1'));
  });

  it('says_email_or_password_is_wrong_without_blaming_one_field', async () => {
    server.use(http.post('*/api/v1/sessions', () => problemResponse('invalid_credentials')));
    const { user } = renderWithProviders(<LoginForm />);

    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail or password is wrong.');
    expect(emailField()).not.toHaveAttribute('aria-invalid');
    expect(passwordField()).not.toHaveAttribute('aria-invalid');
    expect(submitButton()).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows_the_lockout_wait_in_minutes_on_too_many_attempts', async () => {
    server.use(
      http.post('*/api/v1/sessions', () =>
        problemResponse('too_many_attempts', {}, { 'Retry-After': '61' }),
      ),
    );
    const { user } = renderWithProviders(<LoginForm />);

    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 2 minutes.',
    );
  });

  it('says_offline_when_the_request_never_got_an_answer', async () => {
    server.use(http.post('*/api/v1/sessions', () => HttpResponse.error()));
    const { user } = renderWithProviders(<LoginForm />);

    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are offline. Connect and try again.',
    );
  });

  it('quotes_the_request_id_on_an_unexpected_failure', async () => {
    server.use(http.post('*/api/v1/sessions', () => problemResponse('internal_error')));
    const { user } = renderWithProviders(<LoginForm />);

    await logIn(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });

  it('removes_the_form_alert_when_submitting_again', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/v1/sessions', () => {
        calls += 1;
        return calls === 1
          ? problemResponse('invalid_credentials')
          : HttpResponse.json(ME, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<LoginForm />);
    await logIn(user);
    await screen.findByRole('alert');

    await user.click(submitButton());

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('links_to_sign_up_keeping_next_and_explains_password_reset_in_portuguese', () => {
    renderWithProviders(<LoginForm next="/pt-BR/trips/abc" />, { locale: 'pt-BR' });

    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/pt-BR/signup?next=%2Fpt-BR%2Ftrips%2Fabc',
    );
    expect(screen.getByText(/O Heremita não envia e-mails/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});
