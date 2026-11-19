import { endpoints, type UpdateTripBody } from '@heremita/shared';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTripOwner, SHARE_TOKEN, TRIP_ID } from '@/features/trips/test-support';
import { getSnapshot, resetToasts } from '@/shared/components/toast/toast-store';
import {
  failWith,
  onEndpoint,
  okResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../../../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../../../../../test/render';
import { TripSettingsScreen } from './trip-settings-screen';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

const server = setupApiServer();

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});
afterEach(() => resetToasts());

const NEW_TOKEN = 'ZyXwVuTsRqPoNmLkJiHgFe';

function lastToast() {
  return getSnapshot().toasts.at(-1);
}

/** Answers E21 like the API (the trip with the body applied) and records every body. */
function recordUpdates(base = buildTripOwner()) {
  const bodies: UpdateTripBody[] = [];
  server.use(
    onEndpoint(endpoints.updateTrip, async ({ request }) => {
      const body = (await request.json()) as UpdateTripBody;
      bodies.push(body);
      const visibility = body.visibility ?? base.visibility;
      return okResponse(endpoints.updateTrip, {
        ...buildTripOwner({ ...base, ...body, destination: base.destination }),
        visibility,
        shareToken: visibility === 'private' ? base.shareToken : (base.shareToken ?? SHARE_TOKEN),
      });
    }),
    respondWith(endpoints.getTrip, base),
  );
  return bodies;
}

function renderSettings(trip = buildTripOwner(), locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<TripSettingsScreen trip={trip} />, {
    route: `/${locale}/trips/${TRIP_ID}/settings`,
    locale,
  });
}

describe('TripSettingsScreen details', () => {
  it('saves_only_the_changed_fields_and_says_saved', async () => {
    const bodies = recordUpdates();
    const { user } = renderSettings();
    const title = screen.getByRole('textbox', { name: 'Title' });

    await user.clear(title);
    await user.type(title, 'Lisboa 2027');
    await user.click(screen.getByRole('radio', { name: 'Bike' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved')).toBeVisible();
    expect(bodies).toEqual([{ title: 'Lisboa 2027', defaultMode: 'bike' }]);
  });

  it('sends_nothing_when_nothing_changed', async () => {
    const bodies = recordUpdates();
    const { user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved')).toBeVisible();
    expect(bodies).toEqual([]);
  });

  it('clears_the_first_day_with_null', async () => {
    const trip = buildTripOwner({ startDate: '2027-03-14' });
    const bodies = recordUpdates(trip);
    const { user } = renderSettings(trip);

    await user.clear(screen.getByLabelText('First day'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(bodies).toEqual([{ startDate: null }]));
  });

  it('marks_an_empty_title_without_calling_the_api', async () => {
    const bodies = recordUpdates();
    const { user } = renderSettings();
    const title = screen.getByRole('textbox', { name: 'Title' });

    await user.clear(title);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Give the trip a title.')).toBeVisible();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();
    expect(bodies).toEqual([]);
  });

  it('puts_a_server_field_error_on_the_description', async () => {
    server.use(
      failWith(endpoints.updateTrip, 'validation_failed', {
        errors: [{ pointer: '/body/description', detail: 'Rejected' }],
      }),
    );
    const { user } = renderSettings();
    const description = screen.getByRole('textbox', { name: 'Description' });

    await user.type(description, 'Primavera');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This description was not accepted. Try another one.'),
    ).toBeVisible();
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('quotes_code_and_request_id_when_saving_fails', async () => {
    server.use(failWith(endpoints.updateTrip, 'internal_error'));
    const { user } = renderSettings();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The changes could not be saved. Try again.');
    expect(alert).toHaveTextContent('Code: internal_error');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });
});

describe('TripSettingsScreen visibility and sharing', () => {
  it('makes_a_private_trip_shareable_by_link_and_shows_the_link', async () => {
    const bodies = recordUpdates();
    const { user } = renderSettings();

    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /By link/ }));

    const link = await screen.findByRole('textbox', { name: 'Share link' });
    expect(link).toHaveValue(`${window.location.origin}/en/s/${SHARE_TOKEN}`);
    expect(screen.getByRole('radio', { name: /By link/ })).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: /Who can see/ })).getByText('Saved'),
    ).toBeVisible();
    expect(bodies).toEqual([{ visibility: 'link' }]);
  });

  it('keeps_the_saved_choice_and_offers_retry_when_visibility_fails', async () => {
    server.use(failWith(endpoints.updateTrip, 'internal_error'));
    const { user } = renderSettings();

    await user.click(screen.getByRole('radio', { name: /Public/ }));

    expect(await screen.findByText('Not saved')).toBeVisible();
    expect(screen.getByRole('radio', { name: /Private/ })).toBeChecked();
    expect(lastToast()?.message).toBe('Visibility not saved.');
    expect(lastToast()?.action?.label).toBe('Try again');
  });

  it('copies_the_absolute_link', async () => {
    const trip = buildTripOwner({ visibility: 'public', shareToken: SHARE_TOKEN });
    const { user } = renderSettings(trip);

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/en/s/${SHARE_TOKEN}`,
    );
    expect(lastToast()?.message).toBe('Link copied.');
  });

  it('offers_the_system_share_sheet_only_when_there_is_one', async () => {
    const trip = buildTripOwner({ visibility: 'link', shareToken: SHARE_TOKEN });
    const first = renderSettings(trip);
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    first.unmount();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const { user } = renderSettings(trip);
      await user.click(screen.getByRole('button', { name: 'Share' }));

      expect(share).toHaveBeenCalledWith({
        title: trip.title,
        url: `${window.location.origin}/en/s/${SHARE_TOKEN}`,
      });
    } finally {
      Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('replaces_the_link_after_confirmation', async () => {
    const trip = buildTripOwner({ visibility: 'link', shareToken: SHARE_TOKEN });
    let rotations = 0;
    server.use(
      onEndpoint(endpoints.rotateShareToken, () => {
        rotations += 1;
        return okResponse(endpoints.rotateShareToken, { shareToken: NEW_TOKEN });
      }),
      respondWith(endpoints.getTrip, { ...trip, shareToken: NEW_TOKEN }),
    );
    const { user } = renderSettings(trip);

    await user.click(screen.getByRole('button', { name: 'Create a new link' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a new link?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Create new link' }));

    await vi.waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Share link' })).toHaveValue(
        `${window.location.origin}/en/s/${NEW_TOKEN}`,
      ),
    );
    expect(rotations).toBe(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lastToast()?.message).toBe('New link created. The old one no longer works.');
  });

  it('keeps_the_link_when_the_replacement_is_cancelled', async () => {
    let rotations = 0;
    server.use(
      onEndpoint(endpoints.rotateShareToken, () => {
        rotations += 1;
        return okResponse(endpoints.rotateShareToken, { shareToken: NEW_TOKEN });
      }),
    );
    const { user } = renderSettings(
      buildTripOwner({ visibility: 'link', shareToken: SHARE_TOKEN }),
    );

    await user.click(screen.getByRole('button', { name: 'Create a new link' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rotations).toBe(0);
  });

  it('explains_a_failed_replacement_inside_the_dialog', async () => {
    server.use(failWith(endpoints.rotateShareToken, 'internal_error'));
    const { user } = renderSettings(
      buildTripOwner({ visibility: 'link', shareToken: SHARE_TOKEN }),
    );

    await user.click(screen.getByRole('button', { name: 'Create a new link' }));
    await user.click(screen.getByRole('button', { name: 'Create new link' }));

    const alert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('A new link could not be created. Try again.');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });
});

describe('TripSettingsScreen duplicate and delete', () => {
  it('duplicates_the_trip_and_offers_to_open_the_copy', async () => {
    server.use(
      respondWith(endpoints.copyTrip, buildTripOwner({ id: 'copy-1', title: 'Cópia de Lisboa' })),
    );
    const { user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    await vi.waitFor(() => expect(lastToast()?.message).toBe('Copy created: Cópia de Lisboa'));
    lastToast()?.action?.onAction();
    expect(push).toHaveBeenCalledWith('/en/trips/copy-1');
  });

  it('explains_the_trip_limit_when_duplicating', async () => {
    server.use(failWith(endpoints.copyTrip, 'limit_reached'));
    const { user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    await vi.waitFor(() =>
      expect(lastToast()?.message).toBe(
        'You have reached the limit of trips. Delete one to copy another.',
      ),
    );
  });

  it('deletes_after_confirmation_and_goes_to_my_trips', async () => {
    let deletes = 0;
    server.use(
      onEndpoint(endpoints.deleteTrip, () => {
        deletes += 1;
        return okResponse(endpoints.deleteTrip);
      }),
    );
    const { user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Delete trip' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Lisboa em março”?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/en/trips'));
    expect(deletes).toBe(1);
    expect(lastToast()?.message).toBe('Trip deleted: Lisboa em março');
  });

  it('keeps_the_trip_and_explains_when_deleting_fails', async () => {
    server.use(failWith(endpoints.deleteTrip, 'internal_error'));
    const { user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Delete trip' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete trip' }),
    );

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'The trip could not be deleted. Try again.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('speaks_portuguese', () => {
    renderSettings(buildTripOwner({ visibility: 'public', shareToken: SHARE_TOKEN }), 'pt-BR');

    expect(screen.getByRole('heading', { name: 'Visibilidade e compartilhamento' })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Pública/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Gerar novo link' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir viagem' })).toBeVisible();
  });
});
