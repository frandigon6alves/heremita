import { endpoints, type OrderSuggestion, type TripPlanOwner } from '@heremita/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMoveStop, applyReorder } from '@/features/itinerary/apply-plan-ops';
import {
  buildDayRoute,
  buildPlan,
  dayId,
  stopId,
  TRIP_ID,
} from '@/features/itinerary/test-support';
import { resetToasts } from '@/shared/components/toast/toast-store';
import { Toaster } from '@/shared/components/toast/toaster';
import { installFakeMatchMedia } from '@/shared/hooks/match-media.test-support';
import {
  buildMe,
  onEndpoint,
  okResponse,
  problemResponse,
  setupApiServer,
} from '../../../../../../../test/msw/handlers';
import { renderWithProviders } from '../../../../../../../test/render';
import { PlannerScreen } from './planner-screen';

vi.mock('@/shared/map/trip-map', () => ({
  TripMap: () => <div data-map-state="ready" />,
}));

const server = setupApiServer();

let serverPlan: TripPlanOwner;

/** Every E40 request as `<dayId> <planVersion?> <mode|->`, newest last. */
let routeRequests: string[];

type RouteAnswer = (dayIdValue: string, mode: string | null) => Response | Promise<Response>;

function serve(plan: TripPlanOwner, answer?: RouteAnswer) {
  serverPlan = plan;
  routeRequests = [];
  server.use(
    onEndpoint(endpoints.getTripPlan, () => okResponse(endpoints.getTripPlan, serverPlan)),
    onEndpoint(endpoints.getDayRoute, ({ params, request }) => {
      const mode = new URL(request.url).searchParams.get('mode');
      routeRequests.push(`${params.dayId} ${serverPlan.planVersion} ${mode ?? '-'}`);
      return answer
        ? answer(params.dayId, mode)
        : okResponse(endpoints.getDayRoute, buildDayRoute(serverPlan, params.dayId));
    }),
  );
}

function record(
  def: Parameters<typeof onEndpoint>[0],
  answer: (body: unknown, url: URL) => Response | Promise<Response>,
) {
  const calls: { body: unknown; url: URL }[] = [];
  server.use(
    onEndpoint(def, async ({ request }) => {
      const text = await request.text();
      const body: unknown = text === '' ? null : JSON.parse(text);
      const url = new URL(request.url);
      calls.push({ body, url });
      return answer(body, url);
    }),
  );
  return calls;
}

function renderPlanner(route = `/en/trips/${TRIP_ID}`, locale: 'en' | 'pt-BR' = 'en') {
  return renderWithProviders(
    <>
      <PlannerScreen tripId={TRIP_ID} initialPlan={serverPlan} initialUpdatedAt={Date.now()} />
      <Toaster />
    </>,
    { route, locale, viewer: buildMe() },
  );
}

/** A closed popover's control (jsdom keeps closed popovers in the tree, hidden). */
function inPopoverOf(trigger: HTMLElement, role: 'button' | 'link', name: string) {
  const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
  if (popover === null) {
    throw new Error('popover missing');
  }
  return within(popover).getByRole(role, { name, hidden: true });
}

function toast(text: string | RegExp) {
  return screen.findByText(text, { selector: 'li *, li' });
}

function suggestion(overrides: Partial<OrderSuggestion> = {}): OrderSuggestion {
  return {
    dayId: dayId(1),
    planVersion: serverPlan.planVersion,
    stopIds: [stopId(1), stopId(3), stopId(2)],
    before: { distanceMeters: 2400, durationSeconds: 1500 },
    after: { distanceMeters: 1500, durationSeconds: 900 },
    estimated: false,
    ...overrides,
  };
}

beforeEach(() => {
  installFakeMatchMedia();
  HTMLElement.prototype.hidePopover = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => resetToasts());
  Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('PlannerScreen routes', () => {
  it('shows_each_leg_and_the_day_totals_once_the_route_arrives', async () => {
    serve(buildPlan());
    renderPlanner();

    expect(screen.getAllByText('Calculating the route…')).toHaveLength(2);
    expect(await screen.findAllByText('12 min · 900 m')).toHaveLength(2);
    expect(screen.getByText('Day 1 · 3 places · 1.8 km · 24 min')).toBeInTheDocument();
    expect(routeRequests).toEqual([`${dayId(1)} 7 -`]);
  });

  it('reads_legs_and_totals_in_portuguese', async () => {
    serve(buildPlan(), (id) =>
      okResponse(
        endpoints.getDayRoute,
        buildDayRoute(serverPlan, id, (i) => ({ estimated: i === 0 })),
      ),
    );
    renderPlanner(`/pt-BR/trips/${TRIP_ID}`, 'pt-BR');

    expect(await screen.findByText('≈ 12 min (estimativa) · 900 m')).toBeInTheDocument();
    expect(
      screen.getByText('Dia 1 · 3 lugares · 1,8 km · 24 min · inclui estimativas'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A pé' })).toBeChecked();
  });

  it('marks_estimated_legs_and_the_summary', async () => {
    serve(buildPlan(), (id) =>
      okResponse(
        endpoints.getDayRoute,
        buildDayRoute(serverPlan, id, (i) => ({ estimated: i === 0 })),
      ),
    );
    renderPlanner();

    expect(await screen.findByText('≈ 12 min (estimate) · 900 m')).toBeInTheDocument();
    expect(
      screen.getByText('Day 1 · 3 places · 1.8 km · 24 min · includes estimates'),
    ).toBeInTheDocument();
  });

  it('names_the_place_no_path_reaches_in_a_banner', async () => {
    serve(buildPlan(), (id) =>
      okResponse(
        endpoints.getDayRoute,
        buildDayRoute(serverPlan, id, (i) => ({ estimated: i === 1, unroutable: i === 1 })),
      ),
    );
    renderPlanner();

    expect(
      await screen.findByText('Could not reach Time Out Market on foot; times are estimates.'),
    ).toBeInTheDocument();
  });

  it('a_failed_route_falls_back_to_estimates_and_retry_loads_it', async () => {
    let fail = true;
    serve(buildPlan(), (id) =>
      fail
        ? problemResponse('internal_error')
        : okResponse(endpoints.getDayRoute, buildDayRoute(serverPlan, id)),
    );
    const { user } = renderPlanner();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Route unavailable. Times shown are estimates.');
    expect(screen.getAllByText(/\(estimate\)/)).toHaveLength(2);

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findAllByText('12 min · 900 m')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a_day_with_one_place_asks_for_another_and_fetches_no_route', async () => {
    serve(buildPlan());
    renderPlanner(`/en/trips/${TRIP_ID}?day=${dayId(2)}`);

    expect(screen.getByText('Add another place to see a route.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await act(() => delay(50));
    expect(routeRequests).toEqual([]);
  });

  it('the_mode_switch_replaces_the_url_saves_the_day_and_refetches', async () => {
    serve(buildPlan());
    const calls = record(endpoints.updateDay, () => {
      serverPlan = {
        ...serverPlan,
        planVersion: 8,
        days: serverPlan.days.map((day) =>
          day.id === dayId(1) ? { ...day, mode: 'bike', modeOverride: 'bike' } : day,
        ),
      };
      return okResponse(endpoints.updateDay, { planVersion: 8 });
    });
    const { user, urlUpdates } = renderPlanner();
    await screen.findAllByText('12 min · 900 m');

    await user.click(screen.getByRole('radio', { name: 'Bike' }));

    expect(urlUpdates.at(-1)?.queryString).toBe('?mode=bike');
    expect(urlUpdates.at(-1)?.options.history).toBe('replace');
    await waitFor(() => expect(calls.map((call) => call.body)).toEqual([{ modeOverride: 'bike' }]));
    await waitFor(() => expect(routeRequests.at(-1)).toBe(`${dayId(1)} 8 -`));
    expect(routeRequests.filter((request) => request.endsWith(' bike'))).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Bike' })).toBeChecked();
  });

  it('a_day_mode_that_fails_to_save_keeps_the_url_and_says_so', async () => {
    serve(buildPlan());
    record(endpoints.updateDay, () => problemResponse('internal_error'));
    const { user, urlUpdates } = renderPlanner();

    await user.click(screen.getByRole('radio', { name: 'Drive' }));

    expect(await toast('Mode not saved.')).toBeInTheDocument();
    expect(urlUpdates.at(-1)?.queryString).toBe('?mode=drive');
    expect(screen.getByRole('radio', { name: 'Drive' })).toBeChecked();
  });

  it('reads_the_mode_from_the_url_and_asks_for_that_route', async () => {
    serve(buildPlan());
    renderPlanner(`/en/trips/${TRIP_ID}?mode=drive`);

    await screen.findAllByText('12 min · 900 m');
    expect(screen.getByRole('radio', { name: 'Drive' })).toBeChecked();
    expect(routeRequests).toEqual([`${dayId(1)} 7 drive`]);
  });

  it('the_leg_popover_saves_the_leg_mode_and_hands_off_to_map_apps', async () => {
    serve(buildPlan());
    const calls = record(endpoints.updateStop, () =>
      okResponse(endpoints.updateStop, { planVersion: 8 }),
    );
    const { user } = renderPlanner();
    const leg = await screen.findByRole('button', {
      name: 'Route to Miradouro da Graça on foot: 12 min · 900 m',
    });

    const google = inPopoverOf(leg, 'link', 'Google Maps');
    expect(new URL(google.getAttribute('href') ?? '').searchParams.get('travelmode')).toBe(
      'walking',
    );
    expect(inPopoverOf(leg, 'link', 'Apple Maps')).toHaveAttribute(
      'href',
      expect.stringContaining('mode=walking'),
    );
    expect(inPopoverOf(leg, 'button', 'Walk')).toHaveAttribute('aria-current', 'true');

    await user.click(inPopoverOf(leg, 'button', 'Drive'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url.pathname).toContain(stopId(1));
    expect(calls[0]?.body).toEqual({ modeToNext: 'drive' });
  });

  it('a_plan_edit_asks_for_the_route_of_the_new_plan_version', async () => {
    serve(buildPlan());
    record(endpoints.putStopPlacement, () => {
      serverPlan = { ...applyMoveStop(serverPlan, stopId(1), dayId(1), 2), planVersion: 8 };
      return okResponse(endpoints.putStopPlacement, { planVersion: 8 });
    });
    const { user } = renderPlanner();
    await screen.findAllByText('12 min · 900 m');
    const menu = screen.getByRole('button', { name: 'Actions for Castelo de São Jorge' });

    await user.click(inPopoverOf(menu, 'button', 'Move to the end'));

    await waitFor(() => expect(routeRequests).toEqual([`${dayId(1)} 7 -`, `${dayId(1)} 8 -`]));
  });
});

describe('PlannerScreen optimise order', () => {
  it('previews_the_shorter_order_and_applies_it_with_undo', async () => {
    serve(buildPlan());
    const orders = record(endpoints.putStopOrder, (body) => {
      const { stopIds } = body as { stopIds: string[] };
      serverPlan = { ...applyReorder(serverPlan, dayId(1), stopIds), planVersion: 8 };
      return okResponse(endpoints.putStopOrder, { planVersion: serverPlan.planVersion });
    });
    record(endpoints.getOrderSuggestion, () =>
      okResponse(endpoints.getOrderSuggestion, suggestion()),
    );
    const { user } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Optimise order' }));

    const dialog = screen.getByRole('dialog', { name: 'Optimise day 1' });
    expect(await within(dialog).findByText('Before: 25 min · After: 15 min')).toBeInTheDocument();
    const suggested = within(dialog).getByRole('list', { name: 'Suggested order' });
    expect(
      within(suggested)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1Castelo de São Jorge', '2Time Out Marketwas 3', '3Miradouro da Graçawas 2']);

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await toast('New order applied')).toBeInTheDocument();
    expect(orders[0]?.body).toEqual({ stopIds: [stopId(1), stopId(3), stopId(2)] });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(orders).toHaveLength(2));
    expect(orders[1]?.body).toEqual({ stopIds: [stopId(1), stopId(2), stopId(3)] });
  });

  it('keep_the_last_place_is_on_by_default_and_turning_it_off_asks_again', async () => {
    serve(buildPlan());
    const asks = record(endpoints.getOrderSuggestion, () =>
      okResponse(endpoints.getOrderSuggestion, suggestion()),
    );
    const { user } = renderPlanner();
    await user.click(screen.getByRole('button', { name: 'Optimise order' }));
    const keepLast = screen.getByRole('checkbox', { name: 'Keep the last place last' });
    expect(keepLast).toBeChecked();

    await user.click(keepLast);

    await waitFor(() =>
      expect(asks.map((ask) => ask.url.searchParams.get('keepLast'))).toEqual(['true', 'false']),
    );
  });

  it('says_when_the_order_is_already_the_shortest', async () => {
    serve(buildPlan());
    record(endpoints.getOrderSuggestion, () =>
      okResponse(
        endpoints.getOrderSuggestion,
        suggestion({ stopIds: [stopId(1), stopId(2), stopId(3)] }),
      ),
    );
    const { user } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Optimise order' }));

    expect(await screen.findByText('This order is already the shortest.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('a_failed_suggestion_offers_retry_with_its_reference', async () => {
    serve(buildPlan());
    record(endpoints.getOrderSuggestion, () => problemResponse('internal_error'));
    const { user } = renderPlanner();

    await user.click(screen.getByRole('button', { name: 'Optimise order' }));

    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByRole('heading', { name: 'No order could be suggested' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Code: internal_error')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('a_plan_changed_elsewhere_rolls_back_and_offers_no_retry', async () => {
    serve(buildPlan());
    record(endpoints.getOrderSuggestion, () =>
      okResponse(endpoints.getOrderSuggestion, suggestion()),
    );
    record(endpoints.putStopOrder, async () => {
      await delay(100);
      return problemResponse('plan_changed', { currentPlanVersion: 9 });
    });
    const { user } = renderPlanner();
    await user.click(screen.getByRole('button', { name: 'Optimise order' }));
    await screen.findByText('Before: 25 min · After: 15 min');

    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(
      await toast('The trip changed somewhere else; showing the current version.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Places of day 1' });
    expect(within(list).getByRole('button', { name: /^Castelo/ })).toBeInTheDocument();
  });

  it('is_offered_only_on_days_with_three_places', () => {
    serve(buildPlan());
    renderPlanner(`/en/trips/${TRIP_ID}?day=${dayId(2)}`);

    expect(screen.queryByRole('button', { name: 'Optimise order' })).not.toBeInTheDocument();
  });
});
