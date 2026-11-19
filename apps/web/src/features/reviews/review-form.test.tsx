import { endpoints, LIMITS } from '@heremita/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  failWith,
  onEndpoint,
  okResponse,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../test/msw/handlers';
import { renderWithProviders } from '../../../test/render';
import { ReviewForm } from './review-form';
import { buildReview, PLACE_ID } from './test-support';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupApiServer();
afterEach(() => {
  resetToasts();
  push.mockReset();
});

const CURRENT_MONTH = '2026-11';
const BODY = 'Vista linda sobre a cidade.';

function renderForm(
  myReview = null as ReturnType<typeof buildReview> | null,
  locale: 'en' | 'pt-BR' = 'en',
) {
  return renderWithProviders(
    <ReviewForm placeId={PLACE_ID} myReview={myReview} currentMonth={CURRENT_MONTH} />,
    { locale },
  );
}

function recordPuts() {
  const bodies: unknown[] = [];
  server.use(
    onEndpoint(endpoints.putMyReview, async ({ request }) => {
      bodies.push(await request.json());
      return okResponse(endpoints.putMyReview, buildReview({ isMine: true }));
    }),
  );
  return bodies;
}

async function fillIn(user: ReturnType<typeof renderForm>['user'], month = '2026-10') {
  await user.click(screen.getByRole('radio', { name: '4 stars' }));
  await user.type(screen.getByLabelText('When did you go?'), month);
  await user.type(screen.getByRole('textbox', { name: 'Your opinion' }), BODY);
}

function lastToast(): string | undefined {
  return getSnapshot().toasts.at(-1)?.message;
}

describe('ReviewForm', () => {
  it('publishes_a_new_review_and_returns_to_the_place', async () => {
    const bodies = recordPuts();
    const { user, queryClient } = renderForm();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/en/places/${PLACE_ID}`));
    expect(bodies).toEqual([{ rating: 4, visitedMonth: '2026-10', body: BODY }]);
    expect(lastToast()).toBe('Review published');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['places', PLACE_ID] });
  });

  it('marks_every_missing_field_with_an_error', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Choose from 1 to 5 stars.')).toBeVisible();
    expect(screen.getByLabelText('When did you go?')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Tell us the month of your visit.')).toHaveAttribute('role', 'alert');
    const text = screen.getByRole('textbox', { name: 'Your opinion' });
    expect(text).toHaveAttribute('aria-invalid', 'true');
    expect(text).toHaveAccessibleDescription(
      `Between ${LIMITS.REVIEW_BODY_MIN} and ${LIMITS.REVIEW_BODY_MAX} characters. Write at least ${LIMITS.REVIEW_BODY_MIN} characters.`,
    );
    expect(bodies).toEqual([]);
  });

  it('rejects_a_future_month', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await fillIn(user, '2026-12');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('The visit cannot be in a future month.')).toBeVisible();
    expect(bodies).toEqual([]);
  });

  it('accepts_the_current_month', async () => {
    const bodies = recordPuts();
    const { user } = renderForm();

    await fillIn(user, CURRENT_MONTH);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
  });

  it('maps_a_server_422_pointer_to_its_field', async () => {
    server.use(
      failWith(endpoints.putMyReview, 'validation_failed', {
        errors: [{ pointer: '/body/visitedMonth', detail: 'Month is in the future' }],
      }),
    );
    const { user } = renderForm();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('The visit cannot be in a future month.')).toBeVisible();
    expect(screen.getByLabelText('When did you go?')).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps_the_text_and_explains_a_rate_limit', async () => {
    server.use(failWith(endpoints.putMyReview, 'rate_limited', {}, { 'Retry-After': '60' }));
    const { user } = renderForm();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many reviews in a short time. Try again later.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getByRole('textbox', { name: 'Your opinion' })).toHaveValue(BODY);
  });

  it('counts_characters', async () => {
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Your opinion' }), 'Linda vista');

    expect(screen.getByText(`11 / ${LIMITS.REVIEW_BODY_MAX}`)).toBeInTheDocument();
    await waitFor(
      () =>
        expect(screen.getByText(`11 of ${LIMITS.REVIEW_BODY_MAX} characters`)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it('prefills_the_viewers_review_and_updates_it', async () => {
    const bodies = recordPuts();
    const mine = buildReview({ isMine: true, rating: 2, visitedMonth: '2026-08', body: BODY });
    const { user } = renderForm(mine);

    expect(screen.getByRole('radio', { name: '2 stars' })).toBeChecked();
    expect(screen.getByLabelText('When did you go?')).toHaveValue('2026-08');
    expect(screen.getByRole('textbox', { name: 'Your opinion' })).toHaveValue(BODY);
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(lastToast()).toBe('Review updated'));
    expect(bodies).toEqual([{ rating: 5, visitedMonth: '2026-08', body: BODY }]);
  });

  it('deletes_the_review_after_confirmation', async () => {
    let deletes = 0;
    server.use(
      onEndpoint(endpoints.deleteMyReview, () => {
        deletes += 1;
        return okResponse(endpoints.deleteMyReview);
      }),
    );
    const { user } = renderForm(buildReview({ isMine: true }));

    await user.click(screen.getByRole('button', { name: 'Delete my review' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete review' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/en/places/${PLACE_ID}`));
    expect(deletes).toBe(1);
    expect(lastToast()).toBe('Review deleted');
  });

  it('offers_no_delete_for_a_new_review', () => {
    renderForm();

    expect(screen.queryByRole('button', { name: 'Delete my review' })).not.toBeInTheDocument();
  });

  it('reads_in_portuguese', () => {
    renderForm(buildReview({ isMine: true }), 'pt-BR');

    expect(screen.getByRole('radiogroup', { name: 'Nota' })).toBeVisible();
    expect(screen.getByLabelText('Quando você foi?')).toBeVisible();
    expect(screen.getByText('Sem e-mail, sem fotos: só texto público.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir minha avaliação' })).toBeVisible();
  });
});
