import { endpoints, LIMITS } from '@heremita/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import { failWith, onEndpoint, okResponse, setupApiServer } from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { PasswordForm } from './password-form';

const server = setupApiServer();
afterEach(() => {
  act(() => resetToasts());
});

const CURRENT = 'old-password-123';
const NEW = 'tide-pool-hermit-42';

function recordPuts() {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.changePassword, async ({ request }) => {
      bodies.push(await request.json());
      return okResponse(endpoints.changePassword);
    }),
  );
  return bodies;
}

function renderForm(locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<PasswordForm email="ana@example.com" />, { locale });
}

function currentField() {
  return screen.getByLabelText('Current password');
}

function newField() {
  return screen.getByLabelText('New password');
}

describe('PasswordForm', () => {
  it('changes_the_password_and_empties_the_form', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await user.type(currentField(), CURRENT);
    await user.type(newField(), NEW);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(getSnapshot().toasts.at(-1)?.message).toBe(
        'Password changed. Other devices were signed out.',
      ),
    );
    expect(bodies).toEqual([{ currentPassword: CURRENT, newPassword: NEW }]);
    expect(currentField()).toHaveValue('');
    expect(newField()).toHaveValue('');
  });

  it('shows_a_wrong_current_password_on_its_field', async () => {
    server.use(
      failWith(endpoints.changePassword, 'wrong_password', {
        errors: [{ pointer: '/body/currentPassword', detail: 'The password is wrong.' }],
      }),
    );
    const { user } = renderForm();

    await user.type(currentField(), CURRENT);
    await user.type(newField(), NEW);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This is not your current password.',
    );
    expect(currentField()).toHaveAttribute('aria-invalid', 'true');
    expect(currentField()).toHaveFocus();
    expect(newField()).toHaveValue(NEW);
  });

  it('shows_a_common_password_refused_by_the_api_on_the_new_field', async () => {
    server.use(
      failWith(endpoints.changePassword, 'validation_failed', {
        errors: [{ pointer: '/body/newPassword', detail: 'Too common' }],
      }),
    );
    const { user } = renderForm('pt-BR');

    await user.type(screen.getByLabelText('Senha atual'), CURRENT);
    await user.type(screen.getByLabelText('Nova senha'), NEW);
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta senha é muito comum. Escolha outra.',
    );
    expect(screen.getByLabelText('Nova senha')).toHaveFocus();
  });

  it('checks_both_fields_before_calling_the_api', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await user.type(newField(), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Enter your current password.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.getByText(`Use at least ${LIMITS.PASSWORD_MIN} characters.`)).toBeVisible();
    expect(newField()).toHaveAccessibleDescription(
      `At least ${LIMITS.PASSWORD_MIN} characters. Use at least ${LIMITS.PASSWORD_MIN} characters.`,
    );
    expect(bodies).toEqual([]);
  });

  it('refuses_the_e_mail_as_the_new_password', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await user.type(currentField(), CURRENT);
    await user.type(newField(), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Do not use your e-mail address as your password.',
    );
    expect(bodies).toEqual([]);
  });

  it('explains_too_many_attempts', async () => {
    server.use(failWith(endpoints.changePassword, 'rate_limited', {}, { 'Retry-After': '30' }));
    const { user } = renderForm();

    await user.type(currentField(), CURRENT);
    await user.type(newField(), NEW);
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('allows_pasting_into_both_fields', async () => {
    const { user } = renderForm();

    await user.click(currentField());
    await user.paste(CURRENT);
    await user.click(newField());
    await user.paste(NEW);

    expect(currentField()).toHaveValue(CURRENT);
    expect(newField()).toHaveValue(NEW);
    expect(currentField()).toHaveAttribute('autocomplete', 'current-password');
    expect(newField()).toHaveAttribute('autocomplete', 'new-password');
  });
});
