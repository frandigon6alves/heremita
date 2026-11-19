import { http, HttpResponse, delay } from 'msw';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { SignupForm } from './signup-form';
import { buildMe, problemResponse, setupApiServer } from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';

const ME = buildMe();

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupApiServer();
beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
});

const VALID = { name: 'Ana', email: 'ana@example.com', password: 'a long passphrase' };

function nameField() {
  return screen.getByRole('textbox', { name: 'Name' });
}
function emailField() {
  return screen.getByRole('textbox', { name: 'E-mail' });
}
function passwordField() {
  return screen.getByLabelText('Password');
}
function submitButton() {
  return screen.getByRole('button', { name: /Create account|Creating…/ });
}

async function fillValid(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(nameField(), VALID.name);
  await user.type(emailField(), VALID.email);
  await user.type(passwordField(), VALID.password);
}

describe('SignupForm', () => {
  it('shows_a_field_error_after_leaving_the_field_wired_to_the_input', async () => {
    const { user } = renderWithProviders(<SignupForm />);

    await user.type(passwordField(), 'short');
    await user.tab();

    const field = passwordField();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Use at least 12 characters.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = field.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain(alert.id);
    expect(screen.getByText('At least 12 characters.').id).toBe(describedBy[0]);
  });

  it('shows_no_error_before_the_field_is_left', async () => {
    const { user } = renderWithProviders(<SignupForm />);

    await user.type(passwordField(), 'short');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(passwordField()).not.toHaveAttribute('aria-invalid');
  });

  it('clears_the_error_as_soon_as_the_value_becomes_valid', async () => {
    const { user } = renderWithProviders(<SignupForm />);
    await user.type(emailField(), 'ana');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an e-mail address');

    await user.type(emailField(), '@example.com');

    expect(emailField()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/Enter an e-mail address/)).not.toBeInTheDocument();
  });

  it('rejects_the_email_as_password_with_the_shared_schema', async () => {
    const { user } = renderWithProviders(<SignupForm />);
    await user.type(nameField(), 'Ana');
    await user.type(emailField(), 'longaddress1@example.com');
    await user.type(passwordField(), 'longaddress1');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Do not use your e-mail address as your password.',
    );
  });

  it('allows_pasting_into_the_password', async () => {
    const { user } = renderWithProviders(<SignupForm />);

    await user.click(passwordField());
    await user.paste('pasted passphrase 123');

    expect(passwordField()).toHaveValue('pasted passphrase 123');
    expect(passwordField()).toHaveAttribute('autocomplete', 'new-password');
    expect(emailField()).toHaveAttribute('autocomplete', 'email');
    expect(emailField()).toHaveAttribute('type', 'email');
  });

  it('sends_the_cleaned_body_with_the_page_locale_and_goes_to_a_new_trip', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/v1/users', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(ME, { status: 201 });
      }),
    );
    const { user, queryClient } = renderWithProviders(<SignupForm />, { locale: 'pt-BR' });

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), '  Ana ');
    await user.type(screen.getByRole('textbox', { name: 'E-mail' }), ' Ana@Example.com');
    await user.type(screen.getByLabelText('Senha'), VALID.password);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/pt-BR/trips/new'));
    expect(body).toEqual({
      displayName: 'Ana',
      email: 'ana@example.com',
      password: VALID.password,
      locale: 'pt-BR',
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.viewer)).toEqual(ME);
  });

  it('goes_to_next_after_sign_up_when_given', async () => {
    server.use(http.post('*/api/v1/users', () => HttpResponse.json(ME, { status: 201 })));
    const { user } = renderWithProviders(<SignupForm next="/en/t/trip-1?copy=1" />);

    await fillValid(user);
    await user.click(submitButton());

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/en/t/trip-1?copy=1'));
  });

  it('disables_the_submit_button_while_submitting', async () => {
    server.use(
      http.post('*/api/v1/users', async () => {
        await delay(50);
        return problemResponse('internal_error');
      }),
    );
    const { user } = renderWithProviders(<SignupForm />);
    await fillValid(user);

    await user.click(submitButton());

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('maps_422_pointers_to_their_fields', async () => {
    server.use(
      http.post('*/api/v1/users', () =>
        problemResponse('validation_failed', {
          errors: [{ pointer: '/body/password', detail: 'Password is too common' }],
        }),
      ),
    );
    const { user } = renderWithProviders(<SignupForm />);
    await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This password is too common. Choose another one.',
    );
    expect(passwordField()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordField()).toHaveFocus();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows_email_taken_on_the_email_field_with_a_login_link_keeping_next', async () => {
    server.use(http.post('*/api/v1/users', () => problemResponse('email_taken')));
    const { user } = renderWithProviders(<SignupForm next="/en/t/trip-1" />);
    await fillValid(user);

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('There is already an account with this e-mail.');
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: 'Log in instead' })).toHaveAttribute(
      'href',
      '/en/login?next=%2Fen%2Ft%2Ftrip-1',
    );
  });

  it('shows_a_form_alert_with_the_retry_after_wait_on_429', async () => {
    server.use(
      http.post('*/api/v1/users', () =>
        problemResponse('rate_limited', {}, { 'Retry-After': '42' }),
      ),
    );
    const { user } = renderWithProviders(<SignupForm />);
    await fillValid(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 42 seconds.',
    );
    expect(passwordField()).not.toHaveAttribute('aria-invalid');
  });

  it('reads_in_portuguese', async () => {
    const { user } = renderWithProviders(<SignupForm />, { locale: 'pt-BR' });

    await user.type(screen.getByLabelText('Senha'), 'curta');
    await user.tab();

    expect(screen.getByText('Mínimo de 12 caracteres.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Use no mínimo 12 caracteres.');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/pt-BR/login');
  });
});
