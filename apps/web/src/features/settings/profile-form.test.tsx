import { endpoints, LIMITS } from '@heremita/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/query-keys';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  buildMe,
  failWith,
  networkErrorOn,
  onEndpoint,
  okResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { ProfileForm } from './profile-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupApiServer();
beforeEach(() => {
  router.refresh.mockReset();
});
afterEach(() => {
  act(() => resetToasts());
});

function recordPatches() {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.updateMe, async ({ request }) => {
      const body = (await request.json()) as { displayName: string };
      bodies.push(body);
      await delay(30);
      return okResponse(endpoints.updateMe, buildMe({ displayName: body.displayName }));
    }),
  );
  return bodies;
}

function renderForm(locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<ProfileForm displayName="Ana" />, { locale, viewer: buildMe() });
}

describe('ProfileForm', () => {
  it('saves_the_cleaned_name_and_updates_the_viewer', async () => {
    const bodies = recordPatches();
    const { user, queryClient } = renderForm();
    const field = screen.getByRole('textbox', { name: 'Name' });

    await user.clear(field);
    await user.type(field, '  Ana Lima  ');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(bodies).toEqual([{ displayName: 'Ana Lima' }]);
    expect(queryClient.getQueryData(queryKeys.viewer)).toMatchObject({ displayName: 'Ana Lima' });
    expect(getSnapshot().toasts.at(-1)?.message).toBe('Name saved');
    expect(field).toHaveValue('Ana Lima');
  });

  it('rejects_an_empty_name_without_calling_the_api', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();
    const field = screen.getByRole('textbox', { name: 'Name' });

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your name.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      'Shown on your reviews and public trips. Enter your name.',
    );
    expect(bodies).toEqual([]);
  });

  it('rejects_a_name_over_the_limit', async () => {
    const bodies = recordPatches();
    const { user } = renderForm();
    const field = screen.getByRole('textbox', { name: 'Name' });

    await user.clear(field);
    await user.type(field, 'a'.repeat(LIMITS.DISPLAY_NAME_MAX + 1));
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Use at most ${LIMITS.DISPLAY_NAME_MAX} characters.`,
    );
    expect(bodies).toEqual([]);
  });

  it('maps_a_server_422_pointer_to_the_field', async () => {
    server.use(
      failWith(endpoints.updateMe, 'validation_failed', {
        errors: [{ pointer: '/body/displayName', detail: 'Invalid' }],
      }),
    );
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This name cannot be used. Try another one.',
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('explains_a_failure_with_the_code_and_request_id', async () => {
    server.use(failWith(endpoints.updateMe, 'internal_error'));
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Save name' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).toHaveTextContent('Code: internal_error');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });

  it('says_when_the_device_is_offline', async () => {
    server.use(networkErrorOn(endpoints.updateMe));
    const { user } = renderForm('pt-BR');

    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você está offline. Conecte-se e tente de novo.',
    );
  });
});
