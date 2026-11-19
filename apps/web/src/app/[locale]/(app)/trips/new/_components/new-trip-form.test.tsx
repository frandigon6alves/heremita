import { endpoints, type CreateTripBody } from '@heremita/shared';
import { screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlaceResult } from '@/features/place-search/test-support';
import { buildTripOwner } from '@/features/trips/test-support';
import { loadPlaceSearchCombobox } from '@/features/place-search/place-search';
import {
  failWith,
  onEndpoint,
  okResponse,
  respondWith,
  setupApiServer,
  TEST_REQUEST_ID,
} from '../../../../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../../../../test/render';
import { NewTripForm } from './new-trip-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupApiServer();

// The combobox loads on first focus in the app; here it is in from the start.
beforeAll(async () => {
  await loadPlaceSearchCombobox();
});

beforeEach(() => push.mockReset());

/** Answers E19 with a new trip and records every body it received. */
function recordCreates() {
  const bodies: CreateTripBody[] = [];
  server.use(
    onEndpoint(endpoints.createTrip, async ({ request }) => {
      bodies.push((await request.json()) as CreateTripBody);
      return okResponse(endpoints.createTrip, buildTripOwner({ id: 'trip-new-1' }));
    }),
  );
  return bodies;
}

function renderForm(locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(<NewTripForm />, { route: `/${locale}/trips/new`, locale });
}

describe('NewTripForm', () => {
  it('creates_a_trip_with_a_day_count_and_opens_the_planner_on_ideas', async () => {
    const bodies = recordCreates();
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa em março');
    const days = screen.getByRole('spinbutton', { name: 'Number of days' });
    await user.clear(days);
    await user.type(days, '3');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/en/trips/trip-new-1?day=ideas'));
    expect(bodies).toEqual([
      {
        title: 'Lisboa em março',
        destination: null,
        startDate: null,
        dayCount: 3,
        defaultMode: 'walk',
      },
    ]);
  });

  it('sends_a_picked_destination_with_its_country_and_centre', async () => {
    const lisboa = buildPlaceResult({
      key: 'osm:R:5400890',
      name: 'Lisboa',
      label: 'Lisboa, Portugal',
      kind: 'area',
      location: { lng: -9.1365, lat: 38.7077 },
      address: { countryCode: 'PT' },
    });
    server.use(respondWith(endpoints.searchPlaces, { items: [lisboa] }));
    const bodies = recordCreates();
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Março');
    await user.type(screen.getByRole('combobox', { name: 'Destination' }), 'Lisb');
    await user.click(await screen.findByRole('option', { name: /Lisboa/ }));
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.destination).toEqual({
      name: 'Lisboa',
      countryCode: 'PT',
      center: { lng: -9.1365, lat: 38.7077 },
    });
  });

  it('sends_typed_destination_text_without_a_centre', async () => {
    server.use(respondWith(endpoints.searchPlaces, { items: [] }));
    const bodies = recordCreates();
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sul');
    await user.type(screen.getByRole('combobox', { name: 'Destination' }), 'Costa Vicentina');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.destination).toEqual({
      name: 'Costa Vicentina',
      countryCode: null,
      center: null,
    });
  });

  it('sends_the_start_date_and_the_day_count_of_a_date_range', async () => {
    const bodies = recordCreates();
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('radio', { name: 'With dates' }));
    await user.type(screen.getByLabelText('First day'), '2027-03-14');
    await user.type(screen.getByLabelText('Last day'), '2027-03-17');

    expect(screen.getByText('4 days')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ startDate: '2027-03-14', dayCount: 4 });
  });

  it('marks_a_missing_title_once_the_field_is_left', async () => {
    const { user } = renderForm();
    const title = screen.getByRole('textbox', { name: 'Title' });

    await user.click(title);
    await user.tab();

    expect(title).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Give the trip a title.');
    expect(title.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('refuses_a_last_day_before_the_first_without_calling_the_api', async () => {
    const bodies = recordCreates();
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('radio', { name: 'With dates' }));
    await user.type(screen.getByLabelText('First day'), '2027-03-14');
    await user.type(screen.getByLabelText('Last day'), '2027-03-10');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    expect(await screen.findByText('The last day cannot come before the first.')).toBeVisible();
    expect(screen.getByLabelText('Last day')).toHaveAttribute('aria-invalid', 'true');
    expect(bodies).toEqual([]);
  });

  it('refuses_more_days_than_the_limit', async () => {
    const { user } = renderForm();
    const days = screen.getByRole('spinbutton', { name: 'Number of days' });

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.clear(days);
    await user.type(days, '61');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    expect(await screen.findByText('Enter a whole number of days from 1 to 60.')).toBeVisible();
    expect(days).toHaveAttribute('aria-invalid', 'true');
    expect(days).toHaveFocus();
  });

  it('puts_a_server_field_error_on_its_field', async () => {
    server.use(
      failWith(endpoints.createTrip, 'validation_failed', {
        errors: [{ pointer: '/body/title', detail: 'Too short' }],
      }),
    );
    const { user } = renderForm();
    const title = screen.getByRole('textbox', { name: 'Title' });

    await user.type(title, 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    expect(await screen.findByText('This title was not accepted. Try another one.')).toBeVisible();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it('explains_the_trip_limit', async () => {
    server.use(failWith(endpoints.createTrip, 'limit_reached'));
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have reached the limit of 100 trips. Delete one to create another.',
    );
  });

  it('quotes_code_and_request_id_of_an_unexpected_failure', async () => {
    server.use(failWith(endpoints.createTrip, 'internal_error'));
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The trip could not be saved. Try again.');
    expect(alert).toHaveTextContent('Code: internal_error');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
    expect(screen.getByRole('button', { name: 'Create and open' })).toBeEnabled();
  });

  it('explains_a_rate_limit_instead_of_an_unexpected_failure', async () => {
    server.use(failWith(endpoints.createTrip, 'rate_limited', {}, { 'Retry-After': '120' }));
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts. Try again in 2 minutes.');
    expect(alert).toHaveTextContent('Code: rate_limited');
  });

  it('quotes_the_request_id_of_a_422_that_names_no_field_of_the_form', async () => {
    server.use(
      failWith(endpoints.createTrip, 'validation_failed', {
        errors: [{ pointer: '/body/unknown', detail: 'Unexpected' }],
      }),
    );
    const { user } = renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Create and open' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Code: validation_failed');
    expect(alert).toHaveTextContent(`Request ID: ${TEST_REQUEST_ID}`);
  });

  it('speaks_portuguese', () => {
    renderForm('pt-BR');

    expect(screen.getByRole('textbox', { name: 'Título' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Destino' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Criar e abrir' })).toBeVisible();
  });
});
